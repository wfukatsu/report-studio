package com.report.server.auth.oidc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nimbusds.jwt.JWTClaimsSet;
import com.report.server.AppConfig;
import com.report.server.auth.AuthController;
import com.report.server.auth.Principal;
import com.report.server.auth.RateLimiter;
import com.report.server.auth.UserRecord;
import com.report.server.auth.UserRepository;
import io.javalin.http.Context;
import io.javalin.http.Cookie;
import io.javalin.http.HttpStatus;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Keycloak / OpenID Connect login for the browser and Bearer access-token auth for API clients
 * (#499).
 *
 * <ul>
 *   <li>{@code GET /api/v1/auth/oidc/login} — starts Authorization Code + PKCE: stores {state →
 *       nonce, code_verifier} server-side (10 min TTL), pins the state in a short-lived cookie and
 *       302s to the provider.
 *   <li>{@code GET /api/v1/auth/oidc/callback} — validates state (cookie + one-time server entry),
 *       exchanges the code, verifies the ID token (signature / iss / aud / exp / nonce), maps the
 *       user, provisions or links the account and issues the <b>same cookie session</b> a password
 *       login would. Errors redirect to the SPA with {@code ?oidc_error=<code>} so the login modal
 *       can explain them.
 *   <li>{@code GET /api/v1/auth/oidc/login?link=1} — <b>explicit account linking</b>: a user who is
 *       already signed in with a local password starts the same flow, and the callback attaches the
 *       IdP {@code sub} to <em>that</em> account instead of creating one. Requires {@code
 *       OIDC_LINK_LOCAL_USERS=true}. A plain OIDC login whose user id collides with a local account
 *       is always refused ({@code user_conflict}) — username equality alone must never take over an
 *       account.
 *   <li>{@link #resolveFromBearer} — verifies a Keycloak access token presented as {@code
 *       Authorization: Bearer} (called by the auth before-filter after the PAT lookup misses).
 *       Resolves <em>existing</em> accounts only: an API token never provisions or links.
 *   <li>{@link #logoutUrl} — RP-Initiated Logout URL used by {@code POST /auth/logout} for OIDC
 *       sessions.
 * </ul>
 *
 * <p>Discovery is lazy and memoised: a provider that is still starting does not block server boot;
 * the first login / Bearer call retries it.
 */
public final class OidcController {

    private static final Logger log = LoggerFactory.getLogger(OidcController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final SecureRandom RANDOM = new SecureRandom();

    static final String STATE_COOKIE = "oidc_state";
    static final String COOKIE_PATH = "/api/v1/auth/oidc/";
    static final long FLOW_TTL_MS = 10 * 60_000L;

    /** Error codes appended as {@code ?oidc_error=} on the post-login redirect. */
    public static final String ERR_PROVIDER = "provider_error";

    public static final String ERR_STATE = "invalid_state";
    public static final String ERR_TOKEN = "invalid_token";
    public static final String ERR_USER_CONFLICT = "user_conflict";
    public static final String ERR_NO_ROLE = "no_role";
    public static final String ERR_UNAVAILABLE = "provider_unavailable";
    public static final String ERR_LINK_UNAUTHORIZED = "link_unauthorized";
    public static final String ERR_LINK_DISABLED = "link_disabled";
    public static final String ERR_RATE_LIMITED = "rate_limited";

    /** After a failed discovery, callers fail fast for this long instead of retrying (H3). */
    static final long DISCOVERY_BACKOFF_MS = 30_000L;

    /** Upper bound on unfinished login flows kept in memory; the oldest is evicted beyond it. */
    static final int MAX_PENDING_FLOWS = 10_000;

    /** Verified Bearer tokens are remembered (by hash) until they expire, at most this many. */
    static final int MAX_BEARER_CACHE = 1_000;

    /** Result of the authorization-code exchange. */
    public record TokenResponse(String idToken, String accessToken) {}

    /**
     * The token endpoint answered but refused the exchange (HTTP 4xx, or a 200 carrying an {@code
     * error} member) — a flow / configuration problem such as {@code invalid_grant}, distinct from
     * the provider being unreachable ({@link IOException}).
     */
    public static final class TokenExchangeException extends Exception {
        private static final long serialVersionUID = 1L;
        private final int status;
        private final String error;

        public TokenExchangeException(int status, String error) {
            super("token endpoint rejected the exchange: HTTP " + status + " " + error);
            this.status = status;
            this.error = error;
        }

        public int status() {
            return status;
        }

        public String error() {
            return error;
        }
    }

    /** Seam for the token-endpoint call (tests inject a fake). */
    @FunctionalInterface
    public interface TokenExchanger {
        TokenResponse exchange(OidcMetadata md, String code, String codeVerifier)
                throws IOException, TokenExchangeException;
    }

    /** Seam for discovery (tests inject a fixed document). */
    @FunctionalInterface
    public interface MetadataSource {
        OidcMetadata load(OidcConfig cfg) throws IOException;
    }

    /** Seam for building the verifier from discovered metadata. */
    @FunctionalInterface
    public interface VerifierFactory {
        OidcTokenVerifier create(OidcConfig cfg, OidcMetadata md) throws Exception;
    }

    /**
     * @param linkUserId when non-null this flow links the IdP identity to that already signed-in
     *     local account instead of logging in (see class doc)
     */
    private record PendingFlow(
            String nonce, String codeVerifier, long expiresAt, String linkUserId, long seq) {}

    /** Monotonic insertion order for {@link PendingFlow} eviction (clock ties are common). */
    private final java.util.concurrent.atomic.AtomicLong flowSeq =
            new java.util.concurrent.atomic.AtomicLong();

    private final OidcConfig cfg;
    private final UserRepository userRepo;
    private final AuthController authCtrl;
    private final OidcUserMapper mapper;
    private final MetadataSource metadataSource;
    private final TokenExchanger exchanger;
    private final VerifierFactory verifierFactory;
    private final LongSupplier clock;
    private final ConcurrentHashMap<String, PendingFlow> pending = new ConcurrentHashMap<>();

    /** Per-IP throttle on starting login flows (unauthenticated endpoint, M7). */
    private volatile RateLimiter loginLimiter = new RateLimiter(30, 60_000L);

    private record CachedBearer(Principal principal, long expiresAt) {}

    /** sha256(token) → principal, valid until the token's {@code exp} (M2). */
    private final ConcurrentHashMap<String, CachedBearer> bearerCache = new ConcurrentHashMap<>();

    private volatile OidcMetadata metadata;
    private volatile OidcTokenVerifier verifier;

    /** Clock time of the last failed discovery; 0 when none / cleared by success (H3). */
    private volatile long discoveryFailedAt;

    /**
     * Guards discovery + verifier construction. A plain monitor would make every caller queue
     * behind an in-flight network call while the provider is down; {@code tryLock} lets them fail
     * fast instead (H3).
     */
    private final java.util.concurrent.locks.ReentrantLock discoveryLock =
            new java.util.concurrent.locks.ReentrantLock();

    public OidcController(OidcConfig cfg, UserRepository userRepo, AuthController authCtrl) {
        this(
                cfg,
                userRepo,
                authCtrl,
                defaultMetadataSource(),
                defaultExchanger(cfg),
                defaultVerifier(),
                System::currentTimeMillis);
    }

    /** Fully injectable constructor for tests. */
    public OidcController(
            OidcConfig cfg,
            UserRepository userRepo,
            AuthController authCtrl,
            MetadataSource metadataSource,
            TokenExchanger exchanger,
            VerifierFactory verifierFactory,
            LongSupplier clock) {
        this.cfg = cfg;
        this.userRepo = userRepo;
        this.authCtrl = authCtrl;
        this.mapper = new OidcUserMapper(cfg);
        this.metadataSource = metadataSource;
        this.exchanger = exchanger;
        this.verifierFactory = verifierFactory;
        this.clock = clock;
    }

    public OidcConfig config() {
        return cfg;
    }

    /** Package-private for tests. */
    void setLoginLimiter(RateLimiter limiter) {
        this.loginLimiter = limiter;
    }

    /** Public path the SPA navigates to in order to start a login. */
    public static String loginPath() {
        return "/api/v1/auth/oidc/login";
    }

    // ── Discovery (lazy, memoised, retried on failure) ───────────────────────

    /** Best-effort warm-up at boot; failures are logged and retried on first use. */
    public void warmUp() {
        try {
            metadata();
            log.info("OIDC provider discovered: {}", cfg.issuer());
        } catch (IOException e) {
            log.warn(
                    "OIDC discovery failed at startup ({}); will retry on first login",
                    e.getMessage());
        }
    }

    OidcMetadata metadata() throws IOException {
        OidcMetadata md = metadata;
        if (md != null) return md;
        failFastIfBackingOff();
        if (!discoveryLock.tryLock()) {
            throw new IOException("OIDC discovery in progress — try again shortly");
        }
        try {
            if (metadata != null) return metadata;
            failFastIfBackingOff();
            try {
                metadata = metadataSource.load(cfg);
                discoveryFailedAt = 0;
                return metadata;
            } catch (IOException e) {
                discoveryFailedAt = clock.getAsLong();
                throw e;
            }
        } finally {
            discoveryLock.unlock();
        }
    }

    private void failFastIfBackingOff() throws IOException {
        long failedAt = discoveryFailedAt;
        if (failedAt != 0 && clock.getAsLong() - failedAt < DISCOVERY_BACKOFF_MS) {
            throw new IOException(
                    "OIDC discovery failed recently — retrying after "
                            + (DISCOVERY_BACKOFF_MS / 1000)
                            + "s");
        }
    }

    private OidcTokenVerifier verifier() throws IOException {
        OidcTokenVerifier v = verifier;
        if (v != null) return v;
        OidcMetadata md = metadata(); // outside the lock: has its own backoff / tryLock
        if (!discoveryLock.tryLock()) {
            throw new IOException("OIDC verifier initialisation in progress — try again shortly");
        }
        try {
            if (verifier == null) {
                try {
                    verifier = verifierFactory.create(cfg, md);
                } catch (IOException e) {
                    throw e;
                } catch (Exception e) {
                    throw new IOException(
                            "failed to initialise OIDC verifier: " + e.getMessage(), e);
                }
            }
            return verifier;
        } finally {
            discoveryLock.unlock();
        }
    }

    // ── Browser flow ─────────────────────────────────────────────────────────

    /**
     * GET /api/v1/auth/oidc/login[?link=1]
     *
     * <p>{@code link=1} turns the flow into an account-link request for the caller's current local
     * session (see class doc). Failures redirect to the SPA with {@code ?oidc_error=} like the
     * callback does — this endpoint is a browser navigation target, never a fetch.
     */
    public void login(Context ctx) {
        String ip = ctx.ip();
        if (!loginLimiter.isAllowed(ip == null ? "unknown" : ip)) {
            fail(ctx, ERR_RATE_LIMITED);
            return;
        }
        String linkUserId = null;
        if ("1".equals(ctx.queryParam("link")) || "true".equals(ctx.queryParam("link"))) {
            if (!cfg.linkLocalUsers()) {
                fail(ctx, ERR_LINK_DISABLED);
                return;
            }
            Principal current = authCtrl.resolveFromRequest(ctx);
            if (current.isAnonymous() || !Principal.PROVIDER_LOCAL.equals(current.provider())) {
                fail(ctx, ERR_LINK_UNAUTHORIZED);
                return;
            }
            linkUserId = current.userId();
        }
        OidcMetadata md;
        try {
            md = metadata();
        } catch (IOException e) {
            log.warn("OIDC login unavailable: {}", e.getMessage());
            fail(ctx, ERR_UNAVAILABLE);
            return;
        }
        evictExpiredFlows();
        String state = randomToken(32);
        String nonce = randomToken(32);
        String verifierStr = randomToken(48); // 64 base64url chars — within RFC 7636's 43..128
        pending.put(
                state,
                new PendingFlow(
                        nonce,
                        verifierStr,
                        clock.getAsLong() + FLOW_TTL_MS,
                        linkUserId,
                        flowSeq.incrementAndGet()));

        Cookie cookie = new Cookie(STATE_COOKIE, state);
        cookie.setMaxAge((int) (FLOW_TTL_MS / 1000));
        cookie.setHttpOnly(true);
        cookie.setSecure(AppConfig.secureCookies());
        cookie.setSameSite(io.javalin.http.SameSite.LAX);
        cookie.setPath(COOKIE_PATH);
        ctx.cookie(cookie);

        Map<String, String> q = new LinkedHashMap<>();
        q.put("response_type", "code");
        q.put("client_id", cfg.clientId());
        q.put("redirect_uri", cfg.redirectUri());
        q.put("scope", cfg.scopes());
        q.put("state", state);
        q.put("nonce", nonce);
        q.put("code_challenge", s256(verifierStr));
        q.put("code_challenge_method", "S256");
        ctx.redirect(md.authorizationEndpoint() + "?" + formEncode(q), HttpStatus.FOUND);
    }

    /** GET /api/v1/auth/oidc/callback */
    public void callback(Context ctx) {
        String providerError = ctx.queryParam("error");
        if (providerError != null) {
            log.warn(
                    "OIDC provider returned error={} description={}",
                    providerError,
                    ctx.queryParam("error_description"));
            fail(ctx, ERR_PROVIDER);
            return;
        }
        String state = ctx.queryParam("state");
        String code = ctx.queryParam("code");
        String cookieState = ctx.cookie(STATE_COOKIE);
        ctx.removeCookie(STATE_COOKIE, COOKIE_PATH);
        if (state == null || code == null || cookieState == null || !state.equals(cookieState)) {
            fail(ctx, ERR_STATE);
            return;
        }
        PendingFlow flow = pending.remove(state); // one-time use
        if (flow == null || clock.getAsLong() > flow.expiresAt()) {
            fail(ctx, ERR_STATE);
            return;
        }

        TokenResponse tokens;
        JWTClaimsSet claims;
        JWTClaimsSet roleClaims = null;
        try {
            tokens = exchanger.exchange(metadata(), code, flow.codeVerifier());
            if (tokens.idToken() == null) {
                log.warn("OIDC token response lacks id_token (scope 'openid' missing?)");
                fail(ctx, ERR_PROVIDER);
                return;
            }
            claims = verifier().verifyIdToken(tokens.idToken(), flow.nonce());
            roleClaims = accessTokenRoleSource(tokens.accessToken(), claims.getSubject());
        } catch (TokenExchangeException e) {
            // 4xx from the token endpoint: code reuse, PKCE / redirect_uri mismatch, bad client
            log.warn("OIDC code exchange rejected: {}", e.getMessage());
            fail(ctx, ERR_TOKEN);
            return;
        } catch (IOException e) {
            log.warn("OIDC code exchange failed: {}", e.getMessage());
            fail(ctx, ERR_UNAVAILABLE);
            return;
        } catch (OidcTokenVerifier.InvalidTokenException e) {
            log.warn("OIDC ID token rejected: {}", e.getMessage());
            fail(ctx, ERR_TOKEN);
            return;
        } catch (RuntimeException e) {
            // Never surface a JSON 500 to a navigating browser (M4)
            log.error("OIDC callback failed unexpectedly", e);
            fail(ctx, ERR_PROVIDER);
            return;
        }

        try {
            finishCallback(ctx, flow, tokens, claims, roleClaims);
        } catch (com.report.server.JsonBlobRepository.RepositoryException e) {
            log.error("OIDC login could not persist the account: {}", e.getMessage());
            fail(ctx, ERR_UNAVAILABLE);
        } catch (RuntimeException e) {
            log.error("OIDC callback failed unexpectedly", e);
            fail(ctx, ERR_PROVIDER);
        }
    }

    /** Link or sign-in + redirect; store failures propagate to {@link #callback}. */
    private void finishCallback(
            Context ctx,
            PendingFlow flow,
            TokenResponse tokens,
            JWTClaimsSet claims,
            JWTClaimsSet roleClaims) {
        OidcUserMapper.MappedUser mapped = mapper.map(claims, roleClaims);
        if (flow.linkUserId() != null) {
            String error = link(ctx, flow.linkUserId(), mapped);
            if (error != null) {
                fail(ctx, error);
                return;
            }
            String target = cfg.postLoginRedirect();
            ctx.redirect(
                    target + (target.contains("?") ? "&" : "?") + "oidc_linked=1",
                    HttpStatus.FOUND);
            return;
        }

        Provisioned p = provision(mapped);
        if (p.error() != null) {
            fail(ctx, p.error());
            return;
        }
        authCtrl.loginExternal(ctx, p.principal(), tokens.idToken());
        log.info(
                "User logged in via OIDC: {} (sub={})",
                p.principal().userId(),
                claims.getSubject());
        ctx.redirect(cfg.postLoginRedirect(), HttpStatus.FOUND);
    }

    /**
     * Attaches {@code mapped.externalId()} to the local account {@code userId}, which must still be
     * the caller's active local session (proof of ownership, H1). Returns an error code or null on
     * success. The existing session is left untouched.
     */
    private String link(Context ctx, String userId, OidcUserMapper.MappedUser mapped) {
        Principal current = authCtrl.resolveFromRequest(ctx);
        if (current.isAnonymous()
                || !userId.equals(current.userId())
                || !Principal.PROVIDER_LOCAL.equals(current.provider())) {
            log.warn("OIDC link for '{}' refused: local session no longer active", userId);
            return ERR_LINK_UNAUTHORIZED;
        }
        Optional<UserRecord> localOpt = userRepo.findById(userId);
        if (localOpt.isEmpty() || !localOpt.get().hasPassword()) {
            return ERR_LINK_UNAUTHORIZED;
        }
        UserRecord local = localOpt.get();
        boolean subTaken =
                userRepo.findByExternalId(mapped.externalId())
                        .map(u -> !u.userId().equals(userId))
                        .orElse(false);
        boolean alreadyLinkedElsewhere =
                local.externalId() != null && !local.externalId().equals(mapped.externalId());
        if (subTaken || alreadyLinkedElsewhere) {
            log.warn(
                    "OIDC link for '{}' refused: sub={} already bound to another account",
                    userId,
                    mapped.externalId());
            return ERR_USER_CONFLICT;
        }
        userRepo.saveOrThrow(
                new UserRecord(
                        local.userId(),
                        local.displayName(),
                        local.passwordHash(),
                        local.roles(),
                        local.provider(),
                        mapped.externalId()));
        log.info("Linked local user '{}' to OIDC sub={}", userId, mapped.externalId());
        return null;
    }

    /**
     * Keycloak's default "realm roles" mapper writes {@code realm_access} to the access token only
     * (not the ID token), so the callback also verifies the access token — same signature keys,
     * same issuer, {@code azp}/{@code aud} = this client, same {@code sub} — and lets the mapper
     * read roles from it. Anything short of a fully verified, subject-matching JWT is ignored
     * (roles then come from the ID token alone); it never fails the login.
     */
    private JWTClaimsSet accessTokenRoleSource(String accessToken, String expectedSub)
            throws IOException {
        if (!OidcTokenVerifier.looksLikeJwt(accessToken)) return null;
        try {
            JWTClaimsSet at = verifier().verifyAccessToken(accessToken);
            if (expectedSub != null && expectedSub.equals(at.getSubject())) return at;
            log.warn("OIDC access token subject differs from ID token — ignoring its roles");
        } catch (OidcTokenVerifier.InvalidTokenException e) {
            log.debug("OIDC access token not usable as role source: {}", e.getMessage());
        }
        return null;
    }

    private void fail(Context ctx, String code) {
        String target = cfg.postLoginRedirect();
        target += (target.contains("?") ? "&" : "?") + "oidc_error=" + code;
        ctx.redirect(target, HttpStatus.FOUND);
    }

    // ── Bearer access tokens (API / CLI) ─────────────────────────────────────

    /**
     * Resolve a principal from a Keycloak access token. Returns {@link Principal#ANONYMOUS} when
     * the header is absent, the token is not a JWT (PATs are opaque {@code rpat_…} strings), or
     * verification / mapping fails. Never throws — the before-filter turns ANONYMOUS into 401.
     */
    public Principal resolveFromBearer(Context ctx) {
        String header = ctx.header("Authorization");
        if (header == null || !header.startsWith("Bearer ")) return Principal.ANONYMOUS;
        String token = header.substring("Bearer ".length()).trim();
        if (!OidcTokenVerifier.looksLikeJwt(token)) return Principal.ANONYMOUS;
        String cacheKey = sha256(token);
        CachedBearer cached = bearerCache.get(cacheKey);
        if (cached != null) {
            if (clock.getAsLong() < cached.expiresAt()) return cached.principal();
            bearerCache.remove(cacheKey);
        }
        JWTClaimsSet claims;
        try {
            claims = verifier().verifyAccessToken(token);
        } catch (IOException e) {
            log.warn("OIDC Bearer auth unavailable: {}", e.getMessage());
            return Principal.ANONYMOUS;
        } catch (OidcTokenVerifier.InvalidTokenException e) {
            log.debug("OIDC Bearer token rejected: {}", e.getMessage());
            return Principal.ANONYMOUS;
        }
        OidcUserMapper.MappedUser m = mapper.map(claims);
        if (!m.allowed()) return Principal.ANONYMOUS;
        try {
            // Existing accounts only (H1): an API token never provisions or links — the user
            // must have signed in through the browser once (or been linked explicitly).
            Principal resolved =
                    userRepo.findByExternalId(m.externalId())
                            .map(
                                    rec ->
                                            new Principal(
                                                    rec.userId(),
                                                    rec.displayName(),
                                                    m.roles(),
                                                    Principal.PROVIDER_OIDC))
                            .orElse(Principal.ANONYMOUS);
            if (resolved.isAnonymous()) {
                log.debug("OIDC Bearer token for unknown sub={} (no account yet)", m.externalId());
            } else if (claims.getExpirationTime() != null) {
                if (bearerCache.size() >= MAX_BEARER_CACHE) bearerCache.clear();
                bearerCache.put(
                        cacheKey, new CachedBearer(resolved, claims.getExpirationTime().getTime()));
            }
            return resolved;
        } catch (RuntimeException e) {
            // Never propagate (the before-filter maps ANONYMOUS to 401); DB trouble = 401, not 500
            log.warn("OIDC Bearer resolution failed: {}", e.getMessage());
            return Principal.ANONYMOUS;
        }
    }

    // ── Provisioning ─────────────────────────────────────────────────────────

    private record Provisioned(Principal principal, String error) {}

    /**
     * Finds or creates the account for a mapped IdP user (browser login only).
     *
     * <ol>
     *   <li>Lookup by {@code externalId}: existing OIDC accounts are refreshed with the current
     *       display name and IdP roles (the IdP is authoritative); explicitly linked local accounts
     *       keep their stored record and only the session takes the IdP roles.
     *   <li>Otherwise an existing local account with the same {@code userId} is a conflict — never
     *       linked implicitly (H1); linking is an explicit, session-bound action ({@link #link}).
     *   <li>Otherwise a new password-less {@code provider=oidc} account is created.
     * </ol>
     */
    private Provisioned provision(OidcUserMapper.MappedUser m) {
        if (!m.allowed()) return new Provisioned(null, ERR_NO_ROLE);

        Optional<UserRecord> byExt = userRepo.findByExternalId(m.externalId());
        UserRecord rec;
        if (byExt.isPresent()) {
            rec = byExt.get();
            // The IdP owns the roles of provisioned accounts; the display name stays local so an
            // edit in the account settings is not silently rolled back at the next login (M6).
            if (rec.isOidc() && !rec.roles().equals(m.roles())) {
                rec =
                        new UserRecord(
                                rec.userId(),
                                rec.displayName(),
                                null,
                                m.roles(),
                                UserRecord.PROVIDER_OIDC,
                                m.externalId());
                userRepo.saveOrThrow(rec);
            }
        } else if (userRepo.findById(m.userId()).isPresent()) {
            log.warn(
                    "OIDC login refused: user id '{}' already exists locally (sub={}); link it"
                            + " explicitly from the account settings instead",
                    m.userId(),
                    m.externalId());
            return new Provisioned(null, ERR_USER_CONFLICT);
        } else {
            rec =
                    new UserRecord(
                            m.userId(),
                            m.displayName(),
                            null,
                            m.roles(),
                            UserRecord.PROVIDER_OIDC,
                            m.externalId());
            userRepo.saveOrThrow(rec);
            log.info("Provisioned OIDC user '{}' (sub={})", rec.userId(), m.externalId());
        }
        return new Provisioned(
                new Principal(rec.userId(), rec.displayName(), m.roles(), Principal.PROVIDER_OIDC),
                null);
    }

    // ── Logout ───────────────────────────────────────────────────────────────

    /**
     * RP-Initiated Logout URL for a session that was created via OIDC, or {@code null} when the
     * provider advertises no {@code end_session_endpoint} (or discovery is unavailable).
     */
    public String logoutUrl(String idTokenHint) {
        OidcMetadata md = metadata; // do not trigger discovery from logout
        if (md == null || md.endSessionEndpoint() == null) return null;
        Map<String, String> q = new LinkedHashMap<>();
        if (idTokenHint != null) q.put("id_token_hint", idTokenHint);
        q.put("client_id", cfg.clientId());
        q.put("post_logout_redirect_uri", cfg.postLogoutRedirect());
        return md.endSessionEndpoint() + "?" + formEncode(q);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** Drops expired flows and, past {@link #MAX_PENDING_FLOWS}, the oldest ones (M7). */
    private void evictExpiredFlows() {
        long now = clock.getAsLong();
        pending.entrySet().removeIf(e -> now > e.getValue().expiresAt());
        while (pending.size() >= MAX_PENDING_FLOWS) {
            String oldest = null;
            long oldestSeq = Long.MAX_VALUE;
            for (var e : pending.entrySet()) {
                if (e.getValue().seq() < oldestSeq) {
                    oldestSeq = e.getValue().seq();
                    oldest = e.getKey();
                }
            }
            if (oldest == null || pending.remove(oldest) == null) break;
        }
    }

    static String sha256(String input) {
        try {
            byte[] digest =
                    MessageDigest.getInstance("SHA-256")
                            .digest(input.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    static String randomToken(int bytes) {
        byte[] raw = new byte[bytes];
        RANDOM.nextBytes(raw);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    }

    static String s256(String verifier) {
        try {
            byte[] digest =
                    MessageDigest.getInstance("SHA-256")
                            .digest(verifier.getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    static String formEncode(Map<String, String> params) {
        StringBuilder sb = new StringBuilder();
        for (var e : params.entrySet()) {
            if (sb.length() > 0) sb.append('&');
            sb.append(URLEncoder.encode(e.getKey(), StandardCharsets.UTF_8))
                    .append('=')
                    .append(URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8));
        }
        return sb.toString();
    }

    private static MetadataSource defaultMetadataSource() {
        HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
        return c -> {
            try {
                return OidcMetadata.discover(http, c);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IOException("interrupted during OIDC discovery", e);
            }
        };
    }

    private static VerifierFactory defaultVerifier() {
        return (c, md) -> new OidcTokenVerifier(c.issuer(), c.clientId(), md.jwksUri());
    }

    /** Authorization-code exchange over {@code java.net.http} (form-encoded POST). */
    static TokenExchanger defaultExchanger(OidcConfig cfg) {
        HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
        return (md, code, codeVerifier) -> {
            Map<String, String> form = new LinkedHashMap<>();
            form.put("grant_type", "authorization_code");
            form.put("code", code);
            form.put("redirect_uri", cfg.redirectUri());
            form.put("client_id", cfg.clientId());
            form.put("code_verifier", codeVerifier);
            if (cfg.clientSecret() != null) form.put("client_secret", cfg.clientSecret());
            HttpRequest req =
                    HttpRequest.newBuilder(URI.create(md.tokenEndpoint()))
                            .timeout(Duration.ofSeconds(10))
                            .header("Content-Type", "application/x-www-form-urlencoded")
                            .header("Accept", "application/json")
                            .POST(HttpRequest.BodyPublishers.ofString(formEncode(form)))
                            .build();
            HttpResponse<String> res;
            try {
                res = http.send(req, HttpResponse.BodyHandlers.ofString());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IOException("interrupted during token exchange", e);
            }
            int status = res.statusCode();
            JsonNode body;
            try {
                body = MAPPER.readTree(res.body() == null ? "" : res.body());
            } catch (IOException e) {
                body = MAPPER.createObjectNode();
            }
            String error = body.path("error").asText(null);
            if (status >= 400 && status < 500) {
                // The provider answered and refused: not an outage (M3)
                throw new TokenExchangeException(status, error == null ? "http_" + status : error);
            }
            if (status != 200) {
                throw new IOException("token endpoint returned HTTP " + status);
            }
            if (error != null) throw new TokenExchangeException(status, error);
            return new TokenResponse(
                    body.path("id_token").asText(null), body.path("access_token").asText(null));
        };
    }
}

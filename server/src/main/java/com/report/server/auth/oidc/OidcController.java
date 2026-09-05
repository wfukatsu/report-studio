package com.report.server.auth.oidc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nimbusds.jwt.JWTClaimsSet;
import com.report.server.ApiError;
import com.report.server.AppConfig;
import com.report.server.auth.AuthController;
import com.report.server.auth.Principal;
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
 *   <li>{@link #resolveFromBearer} — verifies a Keycloak access token presented as {@code
 *       Authorization: Bearer} (called by the auth before-filter after the PAT lookup misses).
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

    /** Result of the authorization-code exchange. */
    public record TokenResponse(String idToken, String accessToken) {}

    /** Seam for the token-endpoint call (tests inject a fake). */
    @FunctionalInterface
    public interface TokenExchanger {
        TokenResponse exchange(OidcMetadata md, String code, String codeVerifier)
                throws IOException;
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

    private record PendingFlow(String nonce, String codeVerifier, long expiresAt) {}

    private final OidcConfig cfg;
    private final UserRepository userRepo;
    private final AuthController authCtrl;
    private final OidcUserMapper mapper;
    private final MetadataSource metadataSource;
    private final TokenExchanger exchanger;
    private final VerifierFactory verifierFactory;
    private final LongSupplier clock;
    private final ConcurrentHashMap<String, PendingFlow> pending = new ConcurrentHashMap<>();

    private volatile OidcMetadata metadata;
    private volatile OidcTokenVerifier verifier;

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
        synchronized (this) {
            if (metadata == null) metadata = metadataSource.load(cfg);
            return metadata;
        }
    }

    private OidcTokenVerifier verifier() throws IOException {
        OidcTokenVerifier v = verifier;
        if (v != null) return v;
        synchronized (this) {
            if (verifier == null) {
                try {
                    verifier = verifierFactory.create(cfg, metadata());
                } catch (IOException e) {
                    throw e;
                } catch (Exception e) {
                    throw new IOException(
                            "failed to initialise OIDC verifier: " + e.getMessage(), e);
                }
            }
            return verifier;
        }
    }

    // ── Browser flow ─────────────────────────────────────────────────────────

    /** GET /api/v1/auth/oidc/login */
    public void login(Context ctx) {
        OidcMetadata md;
        try {
            md = metadata();
        } catch (IOException e) {
            log.warn("OIDC login unavailable: {}", e.getMessage());
            ApiError.respond(
                    ctx,
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "OIDC_UNAVAILABLE",
                    "OIDC provider is not reachable");
            return;
        }
        evictExpiredFlows();
        String state = randomToken(32);
        String nonce = randomToken(32);
        String verifierStr = randomToken(48); // 64 base64url chars — within RFC 7636's 43..128
        pending.put(state, new PendingFlow(nonce, verifierStr, clock.getAsLong() + FLOW_TTL_MS));

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
        try {
            tokens = exchanger.exchange(metadata(), code, flow.codeVerifier());
            if (tokens.idToken() == null) throw new IOException("token response lacks id_token");
            claims = verifier().verifyIdToken(tokens.idToken(), flow.nonce());
        } catch (IOException e) {
            log.warn("OIDC code exchange failed: {}", e.getMessage());
            fail(ctx, ERR_UNAVAILABLE);
            return;
        } catch (OidcTokenVerifier.InvalidTokenException e) {
            log.warn("OIDC ID token rejected: {}", e.getMessage());
            fail(ctx, ERR_TOKEN);
            return;
        }

        Provisioned p = provision(mapper.map(claims));
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
        Provisioned p = provision(mapper.map(claims));
        if (p.error() != null) {
            log.debug("OIDC Bearer token mapped to no usable account: {}", p.error());
            return Principal.ANONYMOUS;
        }
        return p.principal();
    }

    // ── Provisioning ─────────────────────────────────────────────────────────

    private record Provisioned(Principal principal, String error) {}

    /**
     * Finds or creates the local account for a mapped IdP user.
     *
     * <ol>
     *   <li>Lookup by {@code externalId}: existing OIDC accounts are refreshed with the current
     *       display name and IdP roles (the IdP is authoritative); linked local accounts keep their
     *       stored record and only the session takes the IdP roles.
     *   <li>Otherwise lookup by {@code userId}: an existing local account is linked only when
     *       {@code OIDC_LINK_LOCAL_USERS=true}, else {@code user_conflict}.
     *   <li>Otherwise a new password-less {@code provider=oidc} account is created.
     * </ol>
     */
    private Provisioned provision(OidcUserMapper.MappedUser m) {
        if (!m.allowed()) return new Provisioned(null, ERR_NO_ROLE);

        Optional<UserRecord> byExt =
                userRepo.findByExternalId(UserRecord.PROVIDER_OIDC, m.externalId());
        if (byExt.isEmpty()) {
            byExt = userRepo.findByExternalId(UserRecord.PROVIDER_LOCAL, m.externalId());
        }
        UserRecord rec;
        if (byExt.isPresent()) {
            rec = byExt.get();
            if (rec.isOidc()
                    && (!rec.displayName().equals(m.displayName())
                            || !rec.roles().equals(m.roles()))) {
                rec =
                        new UserRecord(
                                rec.userId(),
                                m.displayName(),
                                null,
                                m.roles(),
                                UserRecord.PROVIDER_OIDC,
                                m.externalId());
                userRepo.save(rec);
            }
        } else {
            Optional<UserRecord> byId = userRepo.findById(m.userId());
            if (byId.isPresent()) {
                UserRecord local = byId.get();
                if (local.externalId() != null || !cfg.linkLocalUsers()) {
                    log.warn(
                            "OIDC login refused: user id '{}' already exists locally (sub={})",
                            m.userId(),
                            m.externalId());
                    return new Provisioned(null, ERR_USER_CONFLICT);
                }
                rec =
                        new UserRecord(
                                local.userId(),
                                local.displayName(),
                                local.passwordHash(),
                                local.roles(),
                                local.provider(),
                                m.externalId());
                userRepo.save(rec);
                log.info("Linked local user '{}' to OIDC sub={}", rec.userId(), m.externalId());
            } else {
                rec =
                        new UserRecord(
                                m.userId(),
                                m.displayName(),
                                null,
                                m.roles(),
                                UserRecord.PROVIDER_OIDC,
                                m.externalId());
                userRepo.save(rec);
                log.info("Provisioned OIDC user '{}' (sub={})", rec.userId(), m.externalId());
            }
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

    private void evictExpiredFlows() {
        long now = clock.getAsLong();
        pending.entrySet().removeIf(e -> now > e.getValue().expiresAt());
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
            if (res.statusCode() != 200) {
                throw new IOException(
                        "token endpoint returned HTTP " + res.statusCode() + ": " + res.body());
            }
            JsonNode body = MAPPER.readTree(res.body());
            return new TokenResponse(
                    body.path("id_token").asText(null), body.path("access_token").asText(null));
        };
    }
}

package com.report.server.auth;

import at.favre.lib.crypto.bcrypt.BCrypt;
import com.report.server.ApiError;
import com.report.server.AppConfig;
import io.javalin.http.Context;
import io.javalin.http.Cookie;
import io.javalin.http.HttpStatus;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;
import java.util.function.LongSupplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Authentication controller with session-based login/logout. Sessions are stored in-memory
 * (suitable for local development).
 */
public final class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);
    private static final String SESSION_COOKIE = "session_id";

    /**
     * Dummy hash used for constant-time comparison when user doesn't exist (timing attack
     * prevention).
     */
    private static final String DUMMY_HASH =
            BCrypt.withDefaults().hashToString(12, "dummy".toCharArray());

    private static final long SESSION_TTL_MS = 86_400_000L; // 24 hours

    /** Evict expired sessions every 30 minutes regardless of login traffic. */
    private static final long EVICTION_INTERVAL_MINUTES = 30;

    private final UserRepository userRepo;
    private static final int LOGIN_MAX_ATTEMPTS;
    private static final long LOGIN_WINDOW_MS;

    static {
        String envMax = System.getenv("LOGIN_RATE_LIMIT_MAX");
        String envMs = System.getenv("LOGIN_RATE_LIMIT_WINDOW_MS");
        LOGIN_MAX_ATTEMPTS = (envMax != null && !envMax.isBlank()) ? Integer.parseInt(envMax) : 5;
        LOGIN_WINDOW_MS =
                (envMs != null && !envMs.isBlank()) ? Long.parseLong(envMs) : 5 * 60 * 1000L;
    }

    private final RateLimiter loginRateLimiter =
            new RateLimiter(LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
    private final ConcurrentHashMap<String, SessionEntry> sessions = new ConcurrentHashMap<>();
    private final ScheduledExecutorService evictionScheduler;
    private final LongSupplier clock;

    /**
     * @param idTokenHint the OIDC ID token of a Keycloak-initiated session (used for RP-Initiated
     *     Logout, #499); {@code null} for password logins
     */
    private record SessionEntry(Principal principal, long expiresAt, String idTokenHint) {}

    /** {@code AUTH_MODE} (#499): when local login is off, {@link #login} answers 403. */
    private final AuthMode authMode;

    /** Set when an OIDC provider is configured — advertised to the SPA via {@link #me}. */
    private volatile boolean oidcEnabled;

    /** Builds the provider logout URL for an OIDC session (null → no provider logout). */
    private volatile Function<String, String> oidcLogoutUrlBuilder;

    public AuthController(UserRepository userRepo) {
        this(userRepo, System::currentTimeMillis, AuthMode.LOCAL);
    }

    /** Package-private for tests — inject a controllable clock. */
    AuthController(UserRepository userRepo, LongSupplier clock) {
        this(userRepo, clock, AuthMode.LOCAL);
    }

    public AuthController(UserRepository userRepo, LongSupplier clock, AuthMode authMode) {
        this.userRepo = userRepo;
        this.clock = clock;
        this.authMode = authMode;
        evictionScheduler =
                Executors.newSingleThreadScheduledExecutor(
                        r -> {
                            Thread t = Thread.ofVirtual().unstarted(r);
                            t.setName("session-eviction");
                            t.setDaemon(true);
                            return t;
                        });
        evictionScheduler.scheduleAtFixedRate(
                this::evictExpiredSessions,
                EVICTION_INTERVAL_MINUTES,
                EVICTION_INTERVAL_MINUTES,
                TimeUnit.MINUTES);
    }

    /**
     * Whether signed-in local users may link their IdP identity ({@code OIDC_LINK_LOCAL_USERS}).
     */
    private volatile boolean oidcLinkEnabled;

    /** Human-readable IdP name for the UI ({@code OIDC_PROVIDER_NAME}, default "Keycloak"). */
    private volatile String oidcProviderName = "Keycloak";

    /** Wire the OIDC provider (#499): advertise it and enable provider logout. */
    public void enableOidc(Function<String, String> logoutUrlBuilder) {
        enableOidc(logoutUrlBuilder, false, "Keycloak");
    }

    /**
     * @param linkEnabled advertise the explicit account-link flow ({@code /oidc/login?link=1}) to
     *     signed-in local users
     * @param providerName label the UI shows for the IdP ("Keycloak でログイン" etc.)
     */
    public void enableOidc(
            Function<String, String> logoutUrlBuilder, boolean linkEnabled, String providerName) {
        this.oidcEnabled = true;
        this.oidcLogoutUrlBuilder = logoutUrlBuilder;
        this.oidcLinkEnabled = linkEnabled;
        this.oidcProviderName = providerName;
    }

    public boolean isLocalLoginEnabled() {
        return authMode.localLoginEnabled();
    }

    public AuthMode authMode() {
        return authMode;
    }

    /** Graceful shutdown — call from AppWiring.shutdown(). */
    public void shutdown() {
        evictionScheduler.shutdown();
        try {
            if (!evictionScheduler.awaitTermination(5, TimeUnit.SECONDS)) {
                evictionScheduler.shutdownNow();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            evictionScheduler.shutdownNow();
        }
    }

    private void evictExpiredSessions() {
        long now = clock.getAsLong();
        int removed = 0;
        for (var it = sessions.entrySet().iterator(); it.hasNext(); ) {
            if (now > it.next().getValue().expiresAt()) {
                it.remove();
                removed++;
            }
        }
        if (removed > 0) {
            log.debug(
                    "Session eviction: removed {} expired sessions ({} active)",
                    removed,
                    sessions.size());
        }
    }

    /**
     * Resolve the principal for the current request from the session cookie. Returns ANONYMOUS if
     * no valid session exists.
     */
    public Principal resolveFromRequest(Context ctx) {
        String sessionId = ctx.cookie(SESSION_COOKIE);
        if (sessionId == null) return Principal.ANONYMOUS;
        SessionEntry entry = sessions.get(sessionId);
        if (entry == null) return Principal.ANONYMOUS;
        if (clock.getAsLong() > entry.expiresAt()) {
            sessions.remove(sessionId);
            return Principal.ANONYMOUS;
        }
        return entry.principal();
    }

    /**
     * POST /api/v1/auth/login — authenticate with userId + password.
     *
     * <p><b>Rate limiting:</b> attempts are throttled per client IP. A successful login clears that
     * IP's counter (see {@link RateLimiter#reset}), so the limit targets failed attempts and does
     * not throttle genuine repeat logins — including several users behind a shared/NAT IP.
     *
     * <p><b>Single active session (intentional):</b> a successful login invalidates every existing
     * session of the same user. This is a deliberate security posture — one active session per user
     * — and therefore does <em>not</em> support the same account being signed in on multiple
     * devices simultaneously; the most recent login always wins.
     */
    public void login(Context ctx) {
        if (!authMode.localLoginEnabled()) {
            ApiError.respond(
                    ctx,
                    HttpStatus.FORBIDDEN,
                    "LOCAL_LOGIN_DISABLED",
                    "Password login is disabled; sign in with the identity provider");
            return;
        }
        // Rate limit by IP
        String clientIp = ctx.ip();
        if (!loginRateLimiter.isAllowed(clientIp)) {
            ApiError.respond(
                    ctx,
                    HttpStatus.TOO_MANY_REQUESTS,
                    "RATE_LIMITED",
                    "Too many login attempts. Please try again later.");
            return;
        }

        var body = ctx.bodyAsClass(Map.class);
        String userId = (String) body.get("userId");
        String password = (String) body.get("password");

        if (userId == null || password == null) {
            ApiError.respond(
                    ctx,
                    HttpStatus.BAD_REQUEST,
                    "VALIDATION_ERROR",
                    "userId and password required");
            return;
        }

        Optional<UserRecord> userOpt = userRepo.findById(userId);
        if (userOpt.isEmpty()) {
            BCrypt.verifyer().verify(password.toCharArray(), DUMMY_HASH);
            ApiError.respond(ctx, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Invalid credentials");
            return;
        }

        UserRecord user = userOpt.get();
        // OIDC-provisioned accounts have no password (#499) — indistinguishable from a wrong one.
        if (!user.hasPassword()) {
            BCrypt.verifyer().verify(password.toCharArray(), DUMMY_HASH);
            ApiError.respond(ctx, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Invalid credentials");
            return;
        }
        if (!BCrypt.verifyer().verify(password.toCharArray(), user.passwordHash()).verified) {
            ApiError.respond(ctx, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Invalid credentials");
            return;
        }

        // Successful auth — forgive this IP's rate-limit counter so repeat/genuine
        // logins (incl. shared-IP users) are not throttled by earlier attempts.
        loginRateLimiter.reset(clientIp);

        // Single-session policy: invalidate any existing sessions for this user
        // (intentional — see method Javadoc; most recent login wins).
        invalidateSessionsFor(userId);

        Principal principal =
                new Principal(
                        user.userId(), user.displayName(), user.roles(), Principal.PROVIDER_LOCAL);
        issueSession(ctx, principal, null);
        ctx.json(meBody(principal, user));

        log.info("User logged in: {}", userId);
    }

    /**
     * Establish a cookie session for a principal authenticated by an external provider (#499).
     * Applies the same single-session policy as {@link #login}.
     */
    public void loginExternal(Context ctx, Principal principal, String idTokenHint) {
        invalidateSessionsFor(principal.userId());
        issueSession(ctx, principal, idTokenHint);
    }

    /** Remove every active session belonging to the given user. */
    private void invalidateSessionsFor(String userId) {
        sessions.entrySet().removeIf(e -> userId.equals(e.getValue().principal().userId()));
    }

    /** Create a fresh session for {@code principal} and set the session cookie on the response. */
    private void issueSession(Context ctx, Principal principal, String idTokenHint) {
        String sessionId = UUID.randomUUID().toString();
        sessions.put(
                sessionId,
                new SessionEntry(principal, clock.getAsLong() + SESSION_TTL_MS, idTokenHint));

        Cookie cookie = new Cookie(SESSION_COOKIE, sessionId);
        cookie.setMaxAge(86400);
        cookie.setHttpOnly(true);
        cookie.setSecure(AppConfig.secureCookies());
        cookie.setSameSite(io.javalin.http.SameSite.LAX);
        cookie.setPath("/api/");
        ctx.cookie(cookie);
    }

    /**
     * POST /api/v1/auth/logout — clear session.
     *
     * <p>For a session created via OIDC the response also carries {@code logoutUrl}: the provider's
     * RP-Initiated Logout URL the SPA should navigate to so the Keycloak SSO session ends as well
     * (#499). Password sessions get {@code {status: logged_out}} only, as before.
     */
    public void logout(Context ctx) {
        String sessionId = ctx.cookie(SESSION_COOKIE);
        SessionEntry entry = sessionId != null ? sessions.remove(sessionId) : null;
        ctx.removeCookie(SESSION_COOKIE, "/api/");
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("status", "logged_out");
        Function<String, String> builder = oidcLogoutUrlBuilder;
        if (entry != null
                && Principal.PROVIDER_OIDC.equals(entry.principal().provider())
                && builder != null) {
            String url = builder.apply(entry.idTokenHint());
            if (url != null) body.put("logoutUrl", url);
        }
        ctx.json(body);
    }

    /**
     * POST /api/v1/auth/change-profile — update displayName and/or password. Body: { displayName?:
     * string, currentPassword?: string, newPassword?: string } If newPassword is provided,
     * currentPassword is required.
     */
    public void changeProfile(Context ctx) {
        // Resolve session directly (auth middleware sets principal=ANONYMOUS for /api/v1/auth/*)
        Principal principal = resolveFromRequest(ctx);
        if (principal == null || principal.isAnonymous()) {
            ApiError.respond(
                    ctx, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Authentication required");
            return;
        }

        Optional<UserRecord> userOpt = userRepo.findById(principal.userId());
        if (userOpt.isEmpty()) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "User not found");
            return;
        }
        UserRecord user = userOpt.get();

        var body = ctx.bodyAsClass(Map.class);
        String newDisplayName = (String) body.get("displayName");
        String currentPassword = (String) body.get("currentPassword");
        String newPassword = (String) body.get("newPassword");

        String updatedDisplayName =
                (newDisplayName != null && !newDisplayName.isBlank())
                        ? newDisplayName.strip()
                        : user.displayName();

        String updatedHash = user.passwordHash();
        boolean passwordChanged = false;
        if (newPassword != null && !newPassword.isBlank()) {
            if (!user.hasPassword()) {
                // Account is managed by the identity provider (#499)
                ApiError.respond(
                        ctx,
                        HttpStatus.FORBIDDEN,
                        "FORBIDDEN",
                        "Password is managed by the identity provider",
                        Map.of("detailCode", "PASSWORD_MANAGED_EXTERNALLY"));
                return;
            }
            if (currentPassword == null || currentPassword.isBlank()) {
                ApiError.respond(
                        ctx,
                        HttpStatus.BAD_REQUEST,
                        "VALIDATION_ERROR",
                        "currentPassword required to change password");
                return;
            }
            if (!BCrypt.verifyer()
                    .verify(currentPassword.toCharArray(), user.passwordHash())
                    .verified) {
                ApiError.respond(
                        ctx,
                        HttpStatus.UNAUTHORIZED,
                        "UNAUTHORIZED",
                        "Current password is incorrect");
                return;
            }
            updatedHash = BCrypt.withDefaults().hashToString(12, newPassword.toCharArray());
            passwordChanged = true;
        }

        UserRecord updated =
                new UserRecord(
                        user.userId(),
                        updatedDisplayName,
                        updatedHash,
                        user.roles(),
                        user.provider(),
                        user.externalId());
        userRepo.save(updated);

        Principal refreshed =
                new Principal(
                        updated.userId(),
                        updated.displayName(),
                        updated.roles(),
                        principal.provider());
        if (passwordChanged) {
            // A password change must revoke every existing session for this user so a stolen or
            // older cookie can no longer be used (#202); then re-issue a fresh session for this
            // caller so they stay logged in. (PATs are separate — revoke them via the token API.)
            invalidateSessionsFor(updated.userId());
            issueSession(ctx, refreshed, null);
        }

        ctx.json(meBody(refreshed, updated));
        log.info(
                "User {} updated profile{}",
                principal.userId(),
                passwordChanged ? " (password changed — sessions reset)" : "");
    }

    /**
     * GET /api/v1/auth/me — return the current session user.
     *
     * <p>Note: the auth middleware exempts all /api/v1/auth/ paths and sets principal = ANONYMOUS.
     * This endpoint must resolve the session itself to return the actual logged-in user.
     */
    public void me(Context ctx) {
        // Resolve from session cookie directly (not from middleware-set attribute)
        Principal principal = resolveFromRequest(ctx);
        UserRecord user =
                principal.isAnonymous() ? null : userRepo.findById(principal.userId()).orElse(null);
        ctx.json(meBody(principal, user));
    }

    /**
     * Response shape shared by login / change-profile / me (#499): the pre-existing fields plus
     * {@code provider} (how this session authenticated), {@code hasPassword} (whether the account
     * can change a password) and the {@code auth} block the login modal uses to decide which
     * sign-in methods to offer — also present for the anonymous response.
     */
    Map<String, Object> meBody(Principal principal, UserRecord user) {
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("userId", principal.userId());
        body.put("displayName", principal.displayName());
        body.put("roles", principal.roles());
        body.put("anonymous", principal.isAnonymous());
        body.put("provider", principal.provider());
        body.put("hasPassword", user != null && user.hasPassword());
        // A *local* account that has been explicitly linked to an IdP identity (H1 link flow);
        // provisioned OIDC accounts are bound by nature and report false here
        body.put("oidcLinked", user != null && !user.isOidc() && user.externalId() != null);
        Map<String, Object> auth = new java.util.LinkedHashMap<>();
        auth.put("mode", authMode.id());
        auth.put("localLoginEnabled", authMode.localLoginEnabled());
        auth.put("oidcEnabled", oidcEnabled);
        if (oidcEnabled) {
            auth.put("oidcLoginUrl", com.report.server.auth.oidc.OidcController.loginPath());
            auth.put("oidcLinkEnabled", oidcLinkEnabled);
            auth.put("oidcProviderName", oidcProviderName);
        }
        body.put("auth", auth);
        return body;
    }
}

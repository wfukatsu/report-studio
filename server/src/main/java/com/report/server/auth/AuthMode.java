package com.report.server.auth;

import com.report.server.auth.oidc.OidcConfig;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Which sign-in methods the server offers (#499), chosen with the {@code AUTH_MODE} environment
 * variable:
 *
 * <ul>
 *   <li>{@code local} — id / password only. OIDC endpoints are not registered and Keycloak Bearer
 *       tokens are ignored even if {@code OIDC_*} variables are present.
 *   <li>{@code oidc} — Keycloak only. Password login answers 403 {@code LOCAL_LOGIN_DISABLED} and
 *       the login modal hides the id / password form. Requires a complete {@code OIDC_*}
 *       configuration; otherwise the server falls back to {@code local} with an error log so nobody
 *       is locked out.
 *   <li>{@code both} — Keycloak and id / password side by side (same fallback rule).
 * </ul>
 *
 * <p>When {@code AUTH_MODE} is unset the mode is inferred: {@code both} if {@code OIDC_ISSUER} is
 * configured, {@code local} otherwise — so an existing deployment keeps working unchanged.
 */
public enum AuthMode {
    LOCAL(true, false),
    OIDC(false, true),
    BOTH(true, true);

    private static final Logger log = LoggerFactory.getLogger(AuthMode.class);

    public static final String ENV = "AUTH_MODE";

    private final boolean localLogin;
    private final boolean oidcLogin;

    AuthMode(boolean localLogin, boolean oidcLogin) {
        this.localLogin = localLogin;
        this.oidcLogin = oidcLogin;
    }

    public boolean localLoginEnabled() {
        return localLogin;
    }

    public boolean oidcEnabled() {
        return oidcLogin;
    }

    /** Wire-format name ({@code local} / {@code oidc} / {@code both}), also used in /auth/me. */
    public String id() {
        return name().toLowerCase(Locale.ROOT);
    }

    /**
     * Resolves the effective mode from the environment and the (possibly absent) OIDC
     * configuration.
     *
     * @throws IllegalStateException when an explicit {@code oidc} / {@code both} lacks the OIDC
     *     configuration it needs (fail-closed)
     */
    public static AuthMode resolve(Map<String, String> env, OidcConfig oidc) {
        String raw = env.get(ENV);
        raw = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        boolean oidcConfigured = oidc != null;

        AuthMode requested;
        switch (raw) {
            case "" -> {
                return oidcConfigured ? BOTH : LOCAL;
            }
            case "local" -> requested = LOCAL;
            case "oidc", "keycloak" -> requested = OIDC;
            case "both" -> requested = BOTH;
            default -> {
                log.error(
                        "Unknown {}={} (expected local | oidc | both) — using {}",
                        ENV,
                        raw,
                        oidcConfigured ? "both" : "local");
                return oidcConfigured ? BOTH : LOCAL;
            }
        }
        if (requested.oidcEnabled() && !oidcConfigured) {
            throw new IllegalStateException(
                    ENV
                            + "="
                            + requested.id()
                            + " requires OIDC_ISSUER and OIDC_CLIENT_ID; refusing to start rather"
                            + " than falling back to password login");
        }
        return requested;
    }
}

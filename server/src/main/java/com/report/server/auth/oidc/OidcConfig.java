package com.report.server.auth.oidc;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * OpenID Connect (Keycloak) settings read from the environment (#499). {@code OIDC_ISSUER} unset
 * means the whole OIDC feature is off and the server behaves exactly as before.
 *
 * <table>
 * <caption>Environment variables</caption>
 * <tr><th>Variable</th><th>Meaning</th></tr>
 * <tr><td>{@code OIDC_ISSUER}</td><td>Issuer URL as it appears in tokens, e.g. {@code
 * https://keycloak.example.com/realms/report-studio}. Required to enable OIDC.</td></tr>
 * <tr><td>{@code OIDC_INTERNAL_ISSUER}</td><td>Optional server-side base URL used for discovery,
 * the token endpoint and JWKS (e.g. {@code http://keycloak:8080/realms/report-studio} inside
 * docker compose) when the server cannot reach the public issuer URL. Browser-facing endpoints
 * (authorization / end-session) keep the public host.</td></tr>
 * <tr><td>{@code OIDC_CLIENT_ID}</td><td>Client id registered in Keycloak. Required.</td></tr>
 * <tr><td>{@code OIDC_CLIENT_SECRET}</td><td>Optional — omit for a public client (PKCE is always
 * used).</td></tr>
 * <tr><td>{@code OIDC_REDIRECT_URI}</td><td>Absolute callback URL. Default: {@code
 * <ALLOWED_ORIGIN or http://localhost:8080>/api/v1/auth/oidc/callback}.</td></tr>
 * <tr><td>{@code OIDC_POST_LOGIN_REDIRECT}</td><td>Where the browser lands after a successful
 * callback (default {@code /}).</td></tr>
 * <tr><td>{@code OIDC_POST_LOGOUT_REDIRECT}</td><td>Absolute URL Keycloak redirects to after
 * RP-initiated logout (default: origin of the redirect URI + {@code /}).</td></tr>
 * <tr><td>{@code OIDC_ADMIN_ROLE}</td><td>IdP role mapped to {@code admin} (default {@code
 * report-studio-admin}).</td></tr>
 * <tr><td>{@code OIDC_USER_ROLE}</td><td>IdP role required for {@code user}. Empty (default)
 * means every authenticated IdP user gets {@code user}.</td></tr>
 * <tr><td>{@code OIDC_ROLE_CLAIM}</td><td>Dot path of the roles array in the token (default
 * {@code realm_access.roles}; e.g. {@code resource_access.report-studio.roles} for client
 * roles).</td></tr>
 * <tr><td>{@code OIDC_LINK_LOCAL_USERS}</td><td>{@code true} lets a user who is signed in with a
 * local password link their IdP identity from the account settings ({@code
 * /oidc/login?link=1}). Linking is never implicit: a plain IdP login whose user id collides with a
 * local account is refused ({@code user_conflict}) regardless of this flag.</td></tr>
 * <tr><td>{@code OIDC_SCOPES}</td><td>Requested scopes (default {@code openid profile email}).
 * </td></tr>
 * <tr><td>{@code OIDC_PROVIDER_NAME}</td><td>Label the UI shows for the IdP ("Keycloak でログイン",
 * badges, messages). Default {@code Keycloak}.</td></tr>
 * </table>
 *
 * <p>Which of local / OIDC login is <em>offered</em> is a separate switch, {@code AUTH_MODE} — see
 * {@link com.report.server.auth.AuthMode}.
 */
public record OidcConfig(
        String issuer,
        String internalIssuer,
        String clientId,
        String clientSecret,
        String redirectUri,
        String postLoginRedirect,
        String postLogoutRedirect,
        String adminRole,
        String userRole,
        String roleClaim,
        boolean linkLocalUsers,
        String scopes,
        String providerName) {

    private static final Logger log = LoggerFactory.getLogger(OidcConfig.class);

    public static final String DEFAULT_ADMIN_ROLE = "report-studio-admin";
    public static final String DEFAULT_ROLE_CLAIM = "realm_access.roles";
    public static final String CALLBACK_PATH = "/api/v1/auth/oidc/callback";

    /** Reads the process environment. Returns {@code null} when OIDC is not configured. */
    public static OidcConfig fromEnv() {
        return fromEnv(System.getenv());
    }

    /** Testable overload. Returns {@code null} when {@code OIDC_ISSUER} is unset or invalid. */
    public static OidcConfig fromEnv(Map<String, String> env) {
        String issuer = trimToNull(env.get("OIDC_ISSUER"));
        if (issuer == null) return null;
        issuer = stripTrailingSlash(issuer);
        if (!isHttpUrl(issuer)) {
            log.error("OIDC_ISSUER={} is not an http(s) URL — OIDC login disabled", issuer);
            return null;
        }
        String clientId = trimToNull(env.get("OIDC_CLIENT_ID"));
        if (clientId == null) {
            log.error("OIDC_ISSUER is set but OIDC_CLIENT_ID is missing — OIDC login disabled");
            return null;
        }
        String internal = trimToNull(env.get("OIDC_INTERNAL_ISSUER"));
        internal = internal == null ? issuer : stripTrailingSlash(internal);
        if (!isHttpUrl(internal)) {
            log.error(
                    "OIDC_INTERNAL_ISSUER={} is not an http(s) URL — OIDC login disabled",
                    internal);
            return null;
        }

        String redirectUri = trimToNull(env.get("OIDC_REDIRECT_URI"));
        if (redirectUri == null) {
            String origin = trimToNull(env.get("ALLOWED_ORIGIN"));
            redirectUri =
                    (origin == null ? "http://localhost:8080" : stripTrailingSlash(origin))
                            + CALLBACK_PATH;
        }
        String postLogin = trimToNull(env.get("OIDC_POST_LOGIN_REDIRECT"));
        String postLogout = trimToNull(env.get("OIDC_POST_LOGOUT_REDIRECT"));
        if (postLogout == null) postLogout = originOf(redirectUri) + "/";

        String adminRole = trimToNull(env.get("OIDC_ADMIN_ROLE"));
        String userRole = trimToNull(env.get("OIDC_USER_ROLE"));
        String roleClaim = trimToNull(env.get("OIDC_ROLE_CLAIM"));
        String scopes = trimToNull(env.get("OIDC_SCOPES"));
        String providerName = trimToNull(env.get("OIDC_PROVIDER_NAME"));

        return new OidcConfig(
                issuer,
                internal,
                clientId,
                trimToNull(env.get("OIDC_CLIENT_SECRET")),
                redirectUri,
                postLogin == null ? "/" : postLogin,
                postLogout,
                adminRole == null ? DEFAULT_ADMIN_ROLE : adminRole,
                userRole,
                roleClaim == null ? DEFAULT_ROLE_CLAIM : roleClaim,
                "true".equalsIgnoreCase(trimToNull(env.get("OIDC_LINK_LOCAL_USERS"))),
                scopes == null ? "openid profile email" : scopes,
                providerName == null ? "Keycloak" : providerName);
    }

    /** Records print every component; keep the client secret out of logs and error messages. */
    @Override
    public String toString() {
        return "OidcConfig[issuer="
                + issuer
                + ", internalIssuer="
                + internalIssuer
                + ", clientId="
                + clientId
                + ", clientSecret="
                + (clientSecret == null ? "<none>" : "<redacted>")
                + ", redirectUri="
                + redirectUri
                + ", providerName="
                + providerName
                + ", linkLocalUsers="
                + linkLocalUsers
                + "]";
    }

    /** {@code http(s)://host…} with a parseable host — anything else would blow up at first use. */
    static boolean isHttpUrl(String s) {
        try {
            java.net.URI u = java.net.URI.create(s);
            String scheme = u.getScheme();
            return ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))
                    && u.getHost() != null;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    /** Whether the user-role gate is active (an IdP role is required to get {@code user}). */
    public boolean requiresUserRole() {
        return userRole != null && !userRole.isBlank();
    }

    /** Discovery document URL, resolved against the server-side (internal) issuer. */
    public String discoveryUrl() {
        return internalIssuer + "/.well-known/openid-configuration";
    }

    static String originOf(String url) {
        try {
            java.net.URI u = java.net.URI.create(url);
            if (u.getScheme() == null || u.getHost() == null) return "";
            return u.getPort() == -1
                    ? u.getScheme() + "://" + u.getHost()
                    : u.getScheme() + "://" + u.getHost() + ":" + u.getPort();
        } catch (Exception e) {
            return "";
        }
    }

    private static String stripTrailingSlash(String s) {
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}

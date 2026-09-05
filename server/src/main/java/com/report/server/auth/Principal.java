package com.report.server.auth;

import java.util.Set;

/**
 * Represents an authenticated user. Stored as a request attribute via the auth before-filter. All
 * handlers can access it via {@code ctx.attribute("principal")}.
 *
 * <p>{@code provider} records <em>how this principal was authenticated</em> (#499): {@link
 * #PROVIDER_LOCAL} for password / PAT logins of a locally managed account, {@link #PROVIDER_OIDC}
 * for a Keycloak (OpenID Connect) session or Bearer access token. It is informational — role checks
 * are provider-independent.
 */
public record Principal(String userId, String displayName, Set<String> roles, String provider) {
    public static final String PROVIDER_LOCAL = "local";
    public static final String PROVIDER_OIDC = "oidc";
    public static final String PROVIDER_NONE = "none";

    public static final Principal ANONYMOUS =
            new Principal("anonymous", "Anonymous User", Set.of(), PROVIDER_NONE);

    /** Local-provider principal (the pre-#499 shape). */
    public Principal(String userId, String displayName, Set<String> roles) {
        this(userId, displayName, roles, PROVIDER_LOCAL);
    }

    public boolean hasRole(String role) {
        return roles.contains(role);
    }

    public boolean isAnonymous() {
        return "anonymous".equals(userId);
    }
}

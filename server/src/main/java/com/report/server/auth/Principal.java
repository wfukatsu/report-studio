package com.report.server.auth;

import java.util.Set;

/**
 * Represents an authenticated user. Stored as a request attribute via the auth before-filter. All
 * handlers can access it via {@code ctx.attribute("principal")}.
 *
 * <p>{@code provider} records the <em>origin of the account behind this principal</em> (#499):
 * {@link #PROVIDER_LOCAL} for a locally managed (password) account — whether it signed in with a
 * password or a PAT — and {@link #PROVIDER_OIDC} for an account provisioned by, or a session /
 * Bearer token issued by, the OpenID Connect provider. It is informational — role checks are
 * provider-independent.
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

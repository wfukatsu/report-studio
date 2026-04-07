package com.report.server.auth;

import java.util.Set;

/**
 * Represents an authenticated user. Stored as a request attribute
 * via the auth before-filter. All handlers can access it via
 * {@code ctx.attribute("principal")}.
 */
public record Principal(
        String userId,
        String displayName,
        Set<String> roles
) {
    public static final Principal ANONYMOUS = new Principal(
            "anonymous", "Anonymous User", Set.of()
    );

    public boolean hasRole(String role) {
        return roles.contains(role);
    }

    public boolean isAnonymous() {
        return "anonymous".equals(userId);
    }
}

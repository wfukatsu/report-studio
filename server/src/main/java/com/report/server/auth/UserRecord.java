package com.report.server.auth;

import java.util.Set;

/**
 * Immutable user record for authentication.
 * Password is stored as a bcrypt hash.
 */
public record UserRecord(
    String userId,
    String displayName,
    String passwordHash,
    Set<String> roles
) {}

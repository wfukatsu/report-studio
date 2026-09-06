package com.report.server.auth;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonIgnore;
import java.util.Set;

/**
 * Immutable user record for authentication. Password is stored as a bcrypt hash.
 *
 * <p>{@code provider} says where the account originates (#499): {@code local} accounts are managed
 * in the admin UI and carry a bcrypt hash; {@code oidc} accounts are auto-provisioned on first
 * Keycloak login, have <b>no</b> password ({@code passwordHash == null}) and are keyed by {@code
 * externalId} (the IdP {@code sub} claim). A local account that was linked to an IdP identity
 * ({@code OIDC_LINK_LOCAL_USERS=true}) keeps {@code provider=local} and its password, but gains an
 * {@code externalId}. Records written before #499 have neither field; the compact constructor
 * normalises a missing provider to {@code local}.
 */
public record UserRecord(
        String userId,
        String displayName,
        String passwordHash,
        Set<String> roles,
        String provider,
        String externalId) {

    public static final String PROVIDER_LOCAL = Principal.PROVIDER_LOCAL;
    public static final String PROVIDER_OIDC = Principal.PROVIDER_OIDC;

    @JsonCreator
    public UserRecord {
        if (provider == null || provider.isBlank()) provider = PROVIDER_LOCAL;
        if (roles == null) roles = Set.of();
    }

    /** Local account (the pre-#499 shape). */
    public UserRecord(String userId, String displayName, String passwordHash, Set<String> roles) {
        this(userId, displayName, passwordHash, roles, PROVIDER_LOCAL, null);
    }

    /** True when the account can authenticate with a password (local accounts only). */
    public boolean hasPassword() {
        return passwordHash != null && !passwordHash.isBlank();
    }

    @JsonIgnore
    public boolean isOidc() {
        return PROVIDER_OIDC.equals(provider);
    }
}

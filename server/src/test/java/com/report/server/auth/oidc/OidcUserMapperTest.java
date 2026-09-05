package com.report.server.auth.oidc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.nimbusds.jwt.JWTClaimsSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class OidcUserMapperTest {

    private static JWTClaimsSet.Builder base() {
        return new JWTClaimsSet.Builder().subject("uuid-1").claim("preferred_username", "alice");
    }

    @Test
    void mapsAdminRoleFromRealmAccess() {
        OidcUserMapper m = new OidcUserMapper(OidcTestKeys.config(Map.of()));
        var out =
                m.map(
                        base().claim(
                                        "realm_access",
                                        Map.of("roles", List.of("report-studio-admin", "x")))
                                .claim("name", "Alice A.")
                                .build());
        assertEquals("uuid-1", out.externalId());
        assertEquals("alice", out.userId());
        assertEquals("Alice A.", out.displayName());
        assertEquals(Set.of("admin", "user"), out.roles());
        assertTrue(out.allowed());
    }

    @Test
    void everyoneIsUserWhenNoUserRoleConfigured() {
        OidcUserMapper m = new OidcUserMapper(OidcTestKeys.config(Map.of()));
        var out = m.map(base().build());
        assertEquals(Set.of("user"), out.roles());
        assertTrue(out.allowed());
        assertEquals("alice", out.displayName());
    }

    @Test
    void userRoleGateRefusesUnmappedUsers() {
        OidcUserMapper m =
                new OidcUserMapper(OidcTestKeys.config(Map.of("OIDC_USER_ROLE", "rs-user")));
        assertFalse(m.map(base().build()).allowed());
        var ok = m.map(base().claim("realm_access", Map.of("roles", List.of("rs-user"))).build());
        assertTrue(ok.allowed());
        assertEquals(Set.of("user"), ok.roles());
    }

    @Test
    void clientRolesViaResourceAccessPath() {
        OidcUserMapper m =
                new OidcUserMapper(
                        OidcTestKeys.config(
                                Map.of(
                                        "OIDC_ROLE_CLAIM",
                                        "resource_access.report-studio.roles",
                                        "OIDC_ADMIN_ROLE",
                                        "admin")));
        var out =
                m.map(
                        base().claim(
                                        "resource_access",
                                        Map.of("report-studio", Map.of("roles", List.of("admin"))))
                                .build());
        assertEquals(Set.of("admin", "user"), out.roles());
    }

    @Test
    void fallsBackToSubWhenUsernameIsNotALocalUserId() {
        OidcUserMapper m = new OidcUserMapper(OidcTestKeys.config(Map.of()));
        var out = m.map(base().claim("preferred_username", "山田 太郎").build());
        assertEquals("uuid-1", out.userId());
        assertEquals("山田 太郎", out.displayName());
    }

    @Test
    void extractRolesToleratesStringsAndMissingPaths() {
        assertEquals(Set.of(), OidcUserMapper.extractRoles(Map.of(), "realm_access.roles"));
        assertEquals(
                Set.of("a", "b"),
                OidcUserMapper.extractRoles(Map.of("roles", "a b,c".replace(",c", "")), "roles"));
    }
}

package com.report.server.auth.oidc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;
import org.junit.jupiter.api.Test;

class OidcConfigTest {

    @Test
    void disabledWithoutIssuer() {
        assertNull(OidcConfig.fromEnv(Map.of()));
        assertNull(OidcConfig.fromEnv(Map.of("OIDC_ISSUER", "  ")));
    }

    @Test
    void disabledWithoutClientId() {
        assertNull(OidcConfig.fromEnv(Map.of("OIDC_ISSUER", "https://kc.example/realms/r")));
    }

    @Test
    void defaultsAndTrailingSlashHandling() {
        OidcConfig c =
                OidcConfig.fromEnv(
                        Map.of(
                                "OIDC_ISSUER", "https://kc.example/realms/r/",
                                "OIDC_CLIENT_ID", "app",
                                "ALLOWED_ORIGIN", "https://app.example"));
        assertEquals("https://kc.example/realms/r", c.issuer());
        assertEquals(c.issuer(), c.internalIssuer());
        assertEquals("https://app.example/api/v1/auth/oidc/callback", c.redirectUri());
        assertEquals("https://app.example/", c.postLogoutRedirect());
        assertEquals("/", c.postLoginRedirect());
        assertEquals(OidcConfig.DEFAULT_ADMIN_ROLE, c.adminRole());
        assertEquals(OidcConfig.DEFAULT_ROLE_CLAIM, c.roleClaim());
        assertFalse(c.requiresUserRole());
        assertFalse(c.linkLocalUsers());
        assertEquals("openid profile email", c.scopes());
        assertEquals(
                "https://kc.example/realms/r/.well-known/openid-configuration", c.discoveryUrl());
    }

    @Test
    void internalIssuerDrivesDiscoveryUrl() {
        OidcConfig c =
                OidcConfig.fromEnv(
                        Map.of(
                                "OIDC_ISSUER", "http://localhost:8180/realms/r",
                                "OIDC_INTERNAL_ISSUER", "http://keycloak:8080/realms/r",
                                "OIDC_CLIENT_ID", "app",
                                "OIDC_USER_ROLE", "report-studio-user",
                                "OIDC_LINK_LOCAL_USERS", "TRUE"));
        assertEquals(
                "http://keycloak:8080/realms/r/.well-known/openid-configuration", c.discoveryUrl());
        assertTrue(c.requiresUserRole());
        assertTrue(c.linkLocalUsers());
        assertEquals("http://localhost:8080/api/v1/auth/oidc/callback", c.redirectUri());
    }

    @Test
    void localLoginCannotBeDisabledWithoutOidc() {
        assertTrue(OidcConfig.localLoginEnabled(Map.of("LOCAL_LOGIN_ENABLED", "false"), null));
        OidcConfig c = OidcTestKeys.config(Map.of());
        assertFalse(OidcConfig.localLoginEnabled(Map.of("LOCAL_LOGIN_ENABLED", "false"), c));
        assertTrue(OidcConfig.localLoginEnabled(Map.of(), c));
    }
}

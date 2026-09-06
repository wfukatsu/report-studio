package com.report.server.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.report.server.auth.oidc.OidcConfig;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** {@code AUTH_MODE} resolution (#499). */
class AuthModeTest {

    private static final OidcConfig OIDC =
            OidcConfig.fromEnv(
                    Map.of(
                            "OIDC_ISSUER", "http://kc.test/realms/r",
                            "OIDC_CLIENT_ID", "app"));

    @Test
    void unsetInfersFromOidcConfiguration() {
        assertEquals(AuthMode.LOCAL, AuthMode.resolve(Map.of(), null));
        assertEquals(AuthMode.BOTH, AuthMode.resolve(Map.of(), OIDC));
    }

    @Test
    void explicitModesAreHonouredWhenSatisfiable() {
        assertEquals(AuthMode.LOCAL, AuthMode.resolve(Map.of("AUTH_MODE", "local"), OIDC));
        assertEquals(AuthMode.OIDC, AuthMode.resolve(Map.of("AUTH_MODE", "oidc"), OIDC));
        assertEquals(AuthMode.OIDC, AuthMode.resolve(Map.of("AUTH_MODE", " Keycloak "), OIDC));
        assertEquals(AuthMode.BOTH, AuthMode.resolve(Map.of("AUTH_MODE", "BOTH"), OIDC));
    }

    @Test
    void oidcModesFallBackToLocalWithoutOidcConfiguration() {
        assertEquals(AuthMode.LOCAL, AuthMode.resolve(Map.of("AUTH_MODE", "oidc"), null));
        assertEquals(AuthMode.LOCAL, AuthMode.resolve(Map.of("AUTH_MODE", "both"), null));
    }

    @Test
    void unknownValueFallsBackToInferredMode() {
        assertEquals(AuthMode.LOCAL, AuthMode.resolve(Map.of("AUTH_MODE", "sso"), null));
        assertEquals(AuthMode.BOTH, AuthMode.resolve(Map.of("AUTH_MODE", "sso"), OIDC));
    }

    @Test
    void flagsAndIds() {
        assertTrue(AuthMode.LOCAL.localLoginEnabled());
        assertFalse(AuthMode.LOCAL.oidcEnabled());
        assertFalse(AuthMode.OIDC.localLoginEnabled());
        assertTrue(AuthMode.OIDC.oidcEnabled());
        assertTrue(AuthMode.BOTH.localLoginEnabled());
        assertTrue(AuthMode.BOTH.oidcEnabled());
        assertEquals("oidc", AuthMode.OIDC.id());
    }
}

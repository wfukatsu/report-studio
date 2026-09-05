package com.report.server.auth.oidc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.Map;
import org.junit.jupiter.api.Test;

class OidcMetadataTest {

    private static final ObjectMapper M = new ObjectMapper();

    private static String doc(String issuer) {
        return "{\"issuer\":\""
                + issuer
                + "\",\"authorization_endpoint\":\""
                + issuer
                + "/protocol/openid-connect/auth\",\"token_endpoint\":\""
                + issuer
                + "/protocol/openid-connect/token\",\"jwks_uri\":\""
                + issuer
                + "/protocol/openid-connect/certs\",\"end_session_endpoint\":\""
                + issuer
                + "/protocol/openid-connect/logout\"}";
    }

    @Test
    void rewritesServerSideEndpointsToInternalIssuer() throws Exception {
        OidcConfig cfg =
                OidcTestKeys.config(
                        Map.of(
                                "OIDC_INTERNAL_ISSUER",
                                "http://keycloak:8080/realms/report-studio"));
        OidcMetadata md = OidcMetadata.parse(M.readTree(doc(OidcTestKeys.ISSUER)), cfg);
        assertEquals(
                OidcTestKeys.ISSUER + "/protocol/openid-connect/auth", md.authorizationEndpoint());
        assertEquals(
                OidcTestKeys.ISSUER + "/protocol/openid-connect/logout", md.endSessionEndpoint());
        assertEquals(
                "http://keycloak:8080/realms/report-studio/protocol/openid-connect/token",
                md.tokenEndpoint());
        assertEquals(
                "http://keycloak:8080/realms/report-studio/protocol/openid-connect/certs",
                md.jwksUri());
    }

    @Test
    void keepsPublicUrlsWhenNoInternalIssuer() throws Exception {
        OidcMetadata md =
                OidcMetadata.parse(
                        M.readTree(doc(OidcTestKeys.ISSUER)), OidcTestKeys.config(Map.of()));
        assertEquals(OidcTestKeys.ISSUER + "/protocol/openid-connect/token", md.tokenEndpoint());
    }

    @Test
    void rejectsIssuerMismatchAndMissingEndpoints() throws Exception {
        OidcConfig cfg = OidcTestKeys.config(Map.of());
        assertThrows(
                IOException.class,
                () -> OidcMetadata.parse(M.readTree(doc("http://evil.test/realms/x")), cfg));
        assertThrows(
                IOException.class,
                () ->
                        OidcMetadata.parse(
                                M.readTree("{\"issuer\":\"" + OidcTestKeys.ISSUER + "\"}"), cfg));
    }

    @Test
    void endSessionIsOptional() throws Exception {
        String d =
                "{\"issuer\":\""
                        + OidcTestKeys.ISSUER
                        + "\",\"authorization_endpoint\":\"a\",\"token_endpoint\":\"t\",\"jwks_uri\":\"j\"}";
        OidcMetadata md = OidcMetadata.parse(M.readTree(d), OidcTestKeys.config(Map.of()));
        assertNull(md.endSessionEndpoint());
    }
}

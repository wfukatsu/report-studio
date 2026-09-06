package com.report.server.auth.oidc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.nimbusds.jwt.JWTClaimsSet;
import java.util.Date;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** ID / access token verification against an in-memory JWKS (#499). */
class OidcTokenVerifierTest {

    private OidcTestKeys keys;
    private OidcTokenVerifier verifier;
    private final long now = System.currentTimeMillis();

    @BeforeEach
    void setUp() throws Exception {
        keys = new OidcTestKeys();
        verifier = keys.verifier();
    }

    @Test
    void acceptsValidIdTokenWithMatchingNonce() throws Exception {
        String jwt = keys.sign(OidcTestKeys.claims("alice", now).claim("nonce", "n1").build());
        JWTClaimsSet c = verifier.verifyIdToken(jwt, "n1");
        assertEquals("alice", c.getSubject());
    }

    @Test
    void rejectsNonceMismatch() throws Exception {
        String jwt = keys.sign(OidcTestKeys.claims("alice", now).claim("nonce", "n1").build());
        assertThrows(
                OidcTokenVerifier.InvalidTokenException.class,
                () -> verifier.verifyIdToken(jwt, "other"));
    }

    @Test
    void rejectsWrongSignature() throws Exception {
        String jwt =
                keys.sign(
                        OidcTestKeys.claims("alice", now).claim("nonce", "n1").build(), keys.rogue);
        assertThrows(
                OidcTokenVerifier.InvalidTokenException.class,
                () -> verifier.verifyIdToken(jwt, "n1"));
        assertThrows(
                OidcTokenVerifier.InvalidTokenException.class,
                () -> verifier.verifyAccessToken(jwt));
    }

    @Test
    void rejectsExpiredToken() throws Exception {
        JWTClaimsSet expired =
                OidcTestKeys.claims("alice", now - 600_000L)
                        .expirationTime(new Date(now - 300_000L))
                        .claim("nonce", "n1")
                        .build();
        String jwt = keys.sign(expired);
        assertThrows(
                OidcTokenVerifier.InvalidTokenException.class,
                () -> verifier.verifyIdToken(jwt, "n1"));
        assertThrows(
                OidcTokenVerifier.InvalidTokenException.class,
                () -> verifier.verifyAccessToken(jwt));
    }

    @Test
    void rejectsIssuerMismatch() throws Exception {
        String jwt =
                keys.sign(
                        OidcTestKeys.claims("alice", now)
                                .issuer("http://other.test/realms/x")
                                .claim("nonce", "n1")
                                .build());
        assertThrows(
                OidcTokenVerifier.InvalidTokenException.class,
                () -> verifier.verifyIdToken(jwt, "n1"));
    }

    @Test
    void idTokenRequiresClientInAudience() throws Exception {
        String jwt =
                keys.sign(
                        OidcTestKeys.claims("alice", now)
                                .audience("someone-else")
                                .claim("nonce", "n1")
                                .build());
        assertThrows(
                OidcTokenVerifier.InvalidTokenException.class,
                () -> verifier.verifyIdToken(jwt, "n1"));
    }

    @Test
    void accessTokenAcceptsKeycloakAzpShape() throws Exception {
        // Keycloak: aud=["account"], azp=<client>
        String jwt =
                keys.sign(
                        OidcTestKeys.claims("alice", now)
                                .audience(List.of("account"))
                                .claim("azp", OidcTestKeys.CLIENT)
                                .build());
        assertEquals("alice", verifier.verifyAccessToken(jwt).getSubject());
    }

    @Test
    void accessTokenForAnotherClientIsRejected() throws Exception {
        String jwt =
                keys.sign(
                        OidcTestKeys.claims("alice", now)
                                .audience(List.of("account"))
                                .claim("azp", "other-app")
                                .build());
        assertThrows(
                OidcTokenVerifier.InvalidTokenException.class,
                () -> verifier.verifyAccessToken(jwt));
    }

    @Test
    void accessTokenRejectsKeycloakIdAndRefreshTokens() throws Exception {
        // H2: an ID token (aud = client) must not double as an API credential
        String idTok =
                keys.sign(
                        OidcTestKeys.claims("alice", now)
                                .claim("typ", "ID")
                                .claim("nonce", "n")
                                .build());
        assertThrows(
                OidcTokenVerifier.InvalidTokenException.class,
                () -> verifier.verifyAccessToken(idTok));
        String refresh =
                keys.sign(
                        OidcTestKeys.claims("alice", now)
                                .claim("typ", "Refresh")
                                .claim("azp", OidcTestKeys.CLIENT)
                                .build());
        assertThrows(
                OidcTokenVerifier.InvalidTokenException.class,
                () -> verifier.verifyAccessToken(refresh));
        // Keycloak access tokens carry typ=Bearer; absent typ stays accepted for other IdPs
        String bearer =
                keys.sign(
                        OidcTestKeys.claims("alice", now)
                                .claim("typ", "Bearer")
                                .claim("azp", OidcTestKeys.CLIENT)
                                .build());
        assertEquals("alice", verifier.verifyAccessToken(bearer).getSubject());
    }

    @Test
    void idTokenRejectsAccessTokenTyp() throws Exception {
        String at =
                keys.sign(
                        OidcTestKeys.claims("alice", now)
                                .claim("typ", "Bearer")
                                .claim("nonce", "n1")
                                .build());
        assertThrows(
                OidcTokenVerifier.InvalidTokenException.class,
                () -> verifier.verifyIdToken(at, "n1"));
        String id =
                keys.sign(
                        OidcTestKeys.claims("alice", now)
                                .claim("typ", "ID")
                                .claim("nonce", "n1")
                                .build());
        assertEquals("alice", verifier.verifyIdToken(id, "n1").getSubject());
    }

    @Test
    void remoteJwksToleratesASlowEndpoint() throws Exception {
        // H4: nimbus' 500 ms default retriever timeout fails against a slow Keycloak
        com.sun.net.httpserver.HttpServer server =
                com.sun.net.httpserver.HttpServer.create(
                        new java.net.InetSocketAddress("127.0.0.1", 0), 0);
        byte[] body =
                new com.nimbusds.jose.jwk.JWKSet(keys.key.toPublicJWK())
                        .toString()
                        .getBytes(java.nio.charset.StandardCharsets.UTF_8);
        server.createContext(
                "/certs",
                ex -> {
                    try {
                        Thread.sleep(1_200);
                    } catch (InterruptedException ignored) {
                        Thread.currentThread().interrupt();
                    }
                    ex.getResponseHeaders().add("Content-Type", "application/json");
                    ex.sendResponseHeaders(200, body.length);
                    try (var os = ex.getResponseBody()) {
                        os.write(body);
                    }
                });
        server.start();
        try {
            String jwksUri = "http://127.0.0.1:" + server.getAddress().getPort() + "/certs";
            OidcTokenVerifier remote =
                    new OidcTokenVerifier(OidcTestKeys.ISSUER, OidcTestKeys.CLIENT, jwksUri);
            String at =
                    keys.sign(
                            OidcTestKeys.claims("alice", now)
                                    .claim("azp", OidcTestKeys.CLIENT)
                                    .build());
            assertEquals("alice", remote.verifyAccessToken(at).getSubject());
        } finally {
            server.stop(0);
        }
    }

    @Test
    void looksLikeJwtRoutesOnlyThreeSegmentTokens() {
        assertTrue(OidcTokenVerifier.looksLikeJwt("aaa.bbb.ccc"));
        assertFalse(OidcTokenVerifier.looksLikeJwt("rpat_abcdef"));
        assertFalse(OidcTokenVerifier.looksLikeJwt("a.b"));
        assertFalse(OidcTokenVerifier.looksLikeJwt("a.b.c.d"));
        assertFalse(OidcTokenVerifier.looksLikeJwt(null));
    }
}

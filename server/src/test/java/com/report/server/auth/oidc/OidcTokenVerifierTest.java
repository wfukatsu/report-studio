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
    void looksLikeJwtRoutesOnlyThreeSegmentTokens() {
        assertTrue(OidcTokenVerifier.looksLikeJwt("aaa.bbb.ccc"));
        assertFalse(OidcTokenVerifier.looksLikeJwt("rpat_abcdef"));
        assertFalse(OidcTokenVerifier.looksLikeJwt("a.b"));
        assertFalse(OidcTokenVerifier.looksLikeJwt("a.b.c.d"));
        assertFalse(OidcTokenVerifier.looksLikeJwt(null));
    }
}

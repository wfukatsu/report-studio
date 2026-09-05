package com.report.server.auth.oidc;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.jwk.source.JWKSourceBuilder;
import com.nimbusds.jose.proc.DefaultJOSEObjectTypeVerifier;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.proc.DefaultJWTClaimsVerifier;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;
import java.net.URI;
import java.util.List;
import java.util.Set;

/**
 * Verifies Keycloak-issued JWTs (#499): signature against the provider JWKS (cached, refreshed on
 * unknown {@code kid}), {@code iss}, {@code exp}/{@code nbf} (60 s clock skew), plus the
 * token-kind-specific audience / nonce rules below.
 *
 * <ul>
 *   <li><b>ID token</b> (login callback): {@code aud} must contain the client id, {@code nonce}
 *       must equal the value bound to the login flow.
 *   <li><b>Access token</b> (Bearer API calls): Keycloak puts the client in {@code azp} and often
 *       only {@code account} in {@code aud}, so either {@code aud} containing the client id or
 *       {@code azp} equal to it is accepted.
 * </ul>
 */
public final class OidcTokenVerifier {

    /** Signing algorithms Keycloak can be configured with for realm keys. */
    private static final Set<JWSAlgorithm> ALGS =
            Set.of(
                    JWSAlgorithm.RS256,
                    JWSAlgorithm.RS384,
                    JWSAlgorithm.RS512,
                    JWSAlgorithm.PS256,
                    JWSAlgorithm.PS384,
                    JWSAlgorithm.PS512,
                    JWSAlgorithm.ES256,
                    JWSAlgorithm.ES384,
                    JWSAlgorithm.ES512);

    private final String clientId;
    private final DefaultJWTProcessor<SecurityContext> processor;

    /**
     * Production constructor — remote JWKS with nimbus' default cache / rate-limit / outage TTLs.
     */
    public OidcTokenVerifier(String issuer, String clientId, String jwksUri) throws Exception {
        this(
                issuer,
                clientId,
                JWKSourceBuilder.<SecurityContext>create(URI.create(jwksUri).toURL()).build());
    }

    /** Injectable key source (tests use an in-memory {@code ImmutableJWKSet}). */
    public OidcTokenVerifier(String issuer, String clientId, JWKSource<SecurityContext> jwks) {
        this.clientId = clientId;
        processor = new DefaultJWTProcessor<>();
        // Keycloak sets typ=JWT; accept the RFC 9068 "at+jwt" media type and absent typ too.
        processor.setJWSTypeVerifier(
                new DefaultJOSEObjectTypeVerifier<>(
                        JOSEObjectType.JWT, new JOSEObjectType("at+jwt"), null));
        processor.setJWSKeySelector(new JWSVerificationKeySelector<>(ALGS, jwks));
        processor.setJWTClaimsSetVerifier(
                new DefaultJWTClaimsVerifier<>(
                        null, // audience checked per token kind below
                        new JWTClaimsSet.Builder().issuer(issuer).build(),
                        Set.of("sub", "exp", "iat")));
    }

    /** Thrown for any verification failure; the message is safe to log, not to show to users. */
    public static final class InvalidTokenException extends Exception {
        public InvalidTokenException(String message) {
            super(message);
        }

        public InvalidTokenException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    /** Verifies an ID token from the authorization-code exchange. */
    public JWTClaimsSet verifyIdToken(String idToken, String expectedNonce)
            throws InvalidTokenException {
        JWTClaimsSet claims = process(idToken);
        List<String> aud = claims.getAudience();
        if (aud == null || !aud.contains(clientId)) {
            throw new InvalidTokenException("ID token audience does not contain client id");
        }
        if (aud.size() > 1) {
            Object azp = claims.getClaim("azp");
            if (!clientId.equals(azp)) {
                throw new InvalidTokenException("ID token azp mismatch with multiple audiences");
            }
        }
        Object nonce = claims.getClaim("nonce");
        if (expectedNonce == null || !expectedNonce.equals(nonce)) {
            throw new InvalidTokenException("ID token nonce mismatch");
        }
        return claims;
    }

    /** Verifies an access token presented as {@code Authorization: Bearer}. */
    public JWTClaimsSet verifyAccessToken(String accessToken) throws InvalidTokenException {
        JWTClaimsSet claims = process(accessToken);
        List<String> aud = claims.getAudience();
        boolean audOk = aud != null && aud.contains(clientId);
        boolean azpOk = clientId.equals(claims.getClaim("azp"));
        if (!audOk && !azpOk) {
            throw new InvalidTokenException("access token is not issued for this client");
        }
        return claims;
    }

    private JWTClaimsSet process(String token) throws InvalidTokenException {
        try {
            return processor.process(token, null);
        } catch (Exception e) {
            throw new InvalidTokenException("token verification failed: " + e.getMessage(), e);
        }
    }

    /** Cheap structural check: three base64url segments — used to route Bearer tokens. */
    public static boolean looksLikeJwt(String token) {
        if (token == null) return false;
        int first = token.indexOf('.');
        if (first <= 0) return false;
        int second = token.indexOf('.', first + 1);
        return second > first + 1
                && second < token.length() - 1
                && token.indexOf('.', second + 1) < 0;
    }
}

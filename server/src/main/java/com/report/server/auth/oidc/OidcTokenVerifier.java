package com.report.server.auth.oidc;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.jwk.source.JWKSourceBuilder;
import com.nimbusds.jose.proc.DefaultJOSEObjectTypeVerifier;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jose.util.DefaultResourceRetriever;
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
 *
 * <p>Token-kind confusion: Keycloak stamps a {@code typ} <em>claim</em> ({@code ID} / {@code
 * Bearer} / {@code Refresh}). An ID token satisfies the audience rule too, and it leaks more easily
 * (it is carried as {@code id_token_hint} in the logout URL), so when the claim is present an
 * access token must say {@code Bearer} and an ID token must say {@code ID}. A missing claim is
 * tolerated for providers that do not emit it.
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
    /** HTTP connect / read timeout for JWKS fetches (nimbus' default is a too-tight 500 ms). */
    static final int JWKS_HTTP_TIMEOUT_MS = 5_000;

    /**
     * Production constructor — remote JWKS with a 5 min cache, rate-limited refresh on unknown
     * {@code kid}, retries, and outage tolerance (the cached key set keeps verifying while the
     * provider is briefly unreachable). Nimbus' defaults (500 ms timeouts, no retry, no outage
     * tolerance) suit a same-host provider only and fail against a remote / containerised Keycloak,
     * so they are overridden here (H4).
     */
    public OidcTokenVerifier(String issuer, String clientId, String jwksUri) throws Exception {
        this(
                issuer,
                clientId,
                JWKSourceBuilder.<SecurityContext>create(
                                URI.create(jwksUri).toURL(),
                                new DefaultResourceRetriever(
                                        JWKS_HTTP_TIMEOUT_MS,
                                        JWKS_HTTP_TIMEOUT_MS,
                                        JWKSourceBuilder.DEFAULT_HTTP_SIZE_LIMIT))
                        .retrying(true)
                        .outageTolerant(true)
                        .build());
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
        requireTypClaim(claims, "ID");
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
        requireTypClaim(claims, "Bearer");
        List<String> aud = claims.getAudience();
        boolean audOk = aud != null && aud.contains(clientId);
        boolean azpOk = clientId.equals(claims.getClaim("azp"));
        if (!audOk && !azpOk) {
            throw new InvalidTokenException("access token is not issued for this client");
        }
        return claims;
    }

    /** Rejects a token whose Keycloak {@code typ} claim names another token kind. */
    private static void requireTypClaim(JWTClaimsSet claims, String expected)
            throws InvalidTokenException {
        Object typ = claims.getClaim("typ");
        if (typ == null) return; // provider does not stamp the claim
        if (!(typ instanceof String t) || !t.equalsIgnoreCase(expected)) {
            throw new InvalidTokenException(
                    "token typ claim is '" + typ + "' but a " + expected + " token is required");
        }
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

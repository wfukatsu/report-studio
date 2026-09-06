package com.report.server.auth.oidc;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.util.Date;
import java.util.List;
import java.util.Map;

/** Shared fixtures: an in-memory realm key pair and a Keycloak-shaped token builder. */
final class OidcTestKeys {

    static final String ISSUER = "http://keycloak.test/realms/report-studio";
    static final String CLIENT = "report-studio";

    final RSAKey key;
    final RSAKey rogue;

    OidcTestKeys() throws Exception {
        key = new RSAKeyGenerator(2048).keyID("realm-key").generate();
        rogue = new RSAKeyGenerator(2048).keyID("rogue-key").generate();
    }

    JWKSource<SecurityContext> jwks() {
        return new ImmutableJWKSet<>(new JWKSet(key.toPublicJWK()));
    }

    OidcTokenVerifier verifier() {
        return new OidcTokenVerifier(ISSUER, CLIENT, jwks());
    }

    static OidcConfig config(Map<String, String> extra) {
        Map<String, String> env = new java.util.HashMap<>();
        env.put("OIDC_ISSUER", ISSUER);
        env.put("OIDC_CLIENT_ID", CLIENT);
        env.put("OIDC_REDIRECT_URI", "http://app.test/api/v1/auth/oidc/callback");
        env.putAll(extra);
        return OidcConfig.fromEnv(env);
    }

    static JWTClaimsSet.Builder claims(String sub, long nowMs) {
        return new JWTClaimsSet.Builder()
                .issuer(ISSUER)
                .subject(sub)
                .audience(CLIENT)
                .issueTime(new Date(nowMs))
                .expirationTime(new Date(nowMs + 300_000L))
                .claim("preferred_username", sub)
                .claim("name", "Test " + sub)
                .claim("realm_access", Map.of("roles", List.of("offline_access")));
    }

    String sign(JWTClaimsSet claims) throws Exception {
        return sign(claims, key);
    }

    String sign(JWTClaimsSet claims, RSAKey with) throws Exception {
        SignedJWT jwt =
                new SignedJWT(
                        new JWSHeader.Builder(JWSAlgorithm.RS256)
                                .keyID(with.getKeyID())
                                .type(JOSEObjectType.JWT)
                                .build(),
                        claims);
        jwt.sign(new RSASSASigner(with));
        return jwt.serialize();
    }
}

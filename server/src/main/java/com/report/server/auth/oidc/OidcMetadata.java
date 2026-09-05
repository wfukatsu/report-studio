package com.report.server.auth.oidc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * Provider endpoints from the OpenID discovery document (#499).
 *
 * <p>{@code tokenEndpoint} and {@code jwksUri} are the <em>server-side</em> URLs: when {@code
 * OIDC_INTERNAL_ISSUER} differs from the public issuer, their public prefix is rewritten so the
 * backend can reach Keycloak over the internal network while the browser keeps using the public
 * {@code authorizationEndpoint} / {@code endSessionEndpoint}.
 */
public record OidcMetadata(
        String issuer,
        String authorizationEndpoint,
        String tokenEndpoint,
        String jwksUri,
        String endSessionEndpoint) {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** Fetches and parses the discovery document. */
    public static OidcMetadata discover(HttpClient http, OidcConfig cfg)
            throws IOException, InterruptedException {
        HttpRequest req =
                HttpRequest.newBuilder(URI.create(cfg.discoveryUrl()))
                        .timeout(Duration.ofSeconds(10))
                        .header("Accept", "application/json")
                        .GET()
                        .build();
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() != 200) {
            throw new IOException(
                    "OIDC discovery failed: HTTP "
                            + res.statusCode()
                            + " from "
                            + cfg.discoveryUrl());
        }
        return parse(MAPPER.readTree(res.body()), cfg);
    }

    /** Pure parser (unit-testable). Validates the advertised issuer against {@code OIDC_ISSUER}. */
    public static OidcMetadata parse(JsonNode doc, OidcConfig cfg) throws IOException {
        String issuer = doc.path("issuer").asText("");
        if (!cfg.issuer().equals(stripSlash(issuer))) {
            throw new IOException(
                    "OIDC discovery issuer mismatch: expected "
                            + cfg.issuer()
                            + " but document says "
                            + issuer);
        }
        String authz = required(doc, "authorization_endpoint");
        String token = required(doc, "token_endpoint");
        String jwks = required(doc, "jwks_uri");
        String endSession = doc.path("end_session_endpoint").asText(null);
        return new OidcMetadata(
                cfg.issuer(), authz, internalize(token, cfg), internalize(jwks, cfg), endSession);
    }

    private static String required(JsonNode doc, String field) throws IOException {
        String v = doc.path(field).asText(null);
        if (v == null || v.isBlank()) {
            throw new IOException("OIDC discovery document lacks " + field);
        }
        return v;
    }

    /** Rewrites the public issuer prefix to the internal one for server-to-server calls. */
    static String internalize(String url, OidcConfig cfg) {
        if (cfg.internalIssuer().equals(cfg.issuer())) return url;
        if (url.startsWith(cfg.issuer())) {
            return cfg.internalIssuer() + url.substring(cfg.issuer().length());
        }
        return url;
    }

    private static String stripSlash(String s) {
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }
}

package com.report.server;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.InetAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

/**
 * Sends Webhook POST requests with SSRF protection and HMAC-SHA256 signature.
 *
 * <p>Security:
 * <ul>
 *   <li>https:// only</li>
 *   <li>Private IPs, loopback, cloud metadata blocked</li>
 *   <li>Redirect following disabled</li>
 *   <li>X-Webhook-Signature header with HMAC-SHA256</li>
 *   <li>Payload body NOT logged (PII protection)</li>
 * </ul>
 */
public final class WebhookDispatcher {

    private static final Logger log = LoggerFactory.getLogger(WebhookDispatcher.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Duration TIMEOUT = Duration.ofSeconds(5);

    private final HttpClient httpClient = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NEVER)
            .connectTimeout(TIMEOUT)
            .build();

    /**
     * Validate the URL and dispatch a POST. Does NOT retry on failure.
     * Failure is logged (without body) and silently swallowed — caller's response is unaffected.
     */
    public void dispatch(String url, String secret, String payloadJson) {
        try {
            validateUrl(url);
            String timestamp = String.valueOf(System.currentTimeMillis() / 1000);
            String signatureInput = timestamp + "." + payloadJson;
            String signature = "sha256=" + hmacSha256(signatureInput, secret != null ? secret : "");

            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(TIMEOUT)
                    .header("Content-Type", "application/json")
                    .header("X-Timestamp", timestamp)
                    .header("X-Webhook-Signature", signature)
                    .POST(HttpRequest.BodyPublishers.ofString(payloadJson, StandardCharsets.UTF_8));

            HttpResponse<Void> response = httpClient.send(builder.build(),
                    HttpResponse.BodyHandlers.discarding());

            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                log.info("Webhook delivered to {} status={}", url, response.statusCode());
            } else {
                log.warn("Webhook delivery failed: url={} status={}", url, response.statusCode());
            }
        } catch (Exception e) {
            // Never log the payload (may contain PII)
            log.warn("Webhook delivery failed: url={} reason={}", url, e.getMessage());
        }
    }

    /**
     * Validate that the URL is safe to call (https, public IP, not metadata endpoint).
     * @throws IllegalArgumentException if the URL is unsafe
     */
    public static void validateUrl(String url) throws Exception {
        if (url == null || url.isBlank()) throw new IllegalArgumentException("URL is required");

        URI uri = URI.create(url);
        if (!"https".equalsIgnoreCase(uri.getScheme())) {
            throw new IllegalArgumentException("Only https:// URLs are allowed");
        }

        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            throw new IllegalArgumentException("Invalid host");
        }

        // Cloud metadata endpoints
        List<String> blockedHosts = List.of("169.254.169.254", "metadata.google.internal");
        if (blockedHosts.stream().anyMatch(h -> h.equalsIgnoreCase(host))) {
            throw new IllegalArgumentException("Blocked metadata endpoint");
        }
        if (host.endsWith(".internal") || host.endsWith(".local")) {
            throw new IllegalArgumentException("Internal hostnames are not allowed");
        }

        // Resolve and check IP
        InetAddress addr;
        try { addr = InetAddress.getByName(host); }
        catch (Exception e) { throw new IllegalArgumentException("Cannot resolve host: " + host); }

        if (addr.isLoopbackAddress() || addr.isLinkLocalAddress() || addr.isSiteLocalAddress()
                || addr.isAnyLocalAddress() || addr.isMulticastAddress()) {
            throw new IllegalArgumentException("Private/loopback IPs are not allowed");
        }
        // Block 0.0.0.0
        if ("0.0.0.0".equals(addr.getHostAddress()) || "::".equals(addr.getHostAddress())) {
            throw new IllegalArgumentException("Zero address is not allowed");
        }
    }

    private static String hmacSha256(String data, String secret) throws Exception {
        if (secret == null || secret.isBlank()) return "unsigned";
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return HexFormat.of().formatHex(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
    }
}

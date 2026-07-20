package com.report.server;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.List;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Sends Webhook POST requests with SSRF protection and HMAC-SHA256 signature.
 *
 * <p>Security:
 *
 * <ul>
 *   <li>https:// only
 *   <li>Private IPs, loopback, cloud metadata blocked
 *   <li>Redirect following disabled (a 3xx is logged, never followed)
 *   <li><b>DNS pinning (issue #200):</b> the host is resolved <em>once</em>; every resolved address
 *       is validated, and the TLS connection is made to that exact validated IP while SNI and
 *       certificate hostname verification still target the original hostname. This closes the
 *       DNS-rebinding TOCTOU where a host resolved to a public IP at validation time and to {@code
 *       169.254.169.254} (or another internal address) at send time.
 *   <li>X-Webhook-Signature header with HMAC-SHA256
 *   <li>Payload body NOT logged (PII protection)
 * </ul>
 */
public final class WebhookDispatcher {

    private static final Logger log = LoggerFactory.getLogger(WebhookDispatcher.class);
    private static final int TIMEOUT_MS = 5_000;

    /** Cap the status-line read so a hostile endpoint cannot stream unbounded data. */
    private static final int MAX_STATUS_LINE = 512;

    /**
     * Validate the URL and dispatch a POST to the pre-validated IP. Does NOT retry on failure.
     * Failure is logged (without body) and silently swallowed — the caller's response is
     * unaffected.
     */
    public void dispatch(String url, String secret, String payloadJson) {
        try {
            // Resolve + validate once, and remember the exact address we vetted so the socket
            // connects to it directly — no second, unvalidated DNS lookup at send time (#200).
            ResolvedTarget target = validateAndResolve(url);

            String timestamp = String.valueOf(System.currentTimeMillis() / 1000);
            String signatureInput = timestamp + "." + payloadJson;
            String signature = "sha256=" + hmacSha256(signatureInput, secret != null ? secret : "");

            int status = sendPinned(target, timestamp, signature, payloadJson);
            if (status >= 200 && status < 300) {
                log.info("Webhook delivered to {} status={}", url, status);
            } else {
                log.warn("Webhook delivery failed: url={} status={}", url, status);
            }
        } catch (Exception e) {
            // Never log the payload (may contain PII)
            log.warn("Webhook delivery failed: url={} reason={}", url, e.getMessage());
        }
    }

    /**
     * Validate that the URL is safe to call (https, public IP, not a metadata endpoint) and return
     * the vetted connection target. Every address the host resolves to is checked, and the returned
     * pinned address is one of those checked addresses.
     *
     * @throws IllegalArgumentException if the URL is unsafe
     */
    public static void validateUrl(String url) throws Exception {
        validateAndResolve(url); // resolves + validates; result discarded (input-time check only)
    }

    /** A resolved, validated webhook target: original host/port/path plus the pinned IP. */
    private record ResolvedTarget(
            String host, int port, String requestTarget, InetAddress pinnedIp) {}

    private static ResolvedTarget validateAndResolve(String url) throws Exception {
        if (url == null || url.isBlank()) throw new IllegalArgumentException("URL is required");

        URI uri = URI.create(url);
        if (!"https".equalsIgnoreCase(uri.getScheme())) {
            throw new IllegalArgumentException("Only https:// URLs are allowed");
        }

        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            throw new IllegalArgumentException("Invalid host");
        }

        // Cloud metadata endpoints / internal hostnames (defense in depth on top of IP checks)
        List<String> blockedHosts = List.of("169.254.169.254", "metadata.google.internal");
        if (blockedHosts.stream().anyMatch(h -> h.equalsIgnoreCase(host))) {
            throw new IllegalArgumentException("Blocked metadata endpoint");
        }
        if (host.endsWith(".internal") || host.endsWith(".local")) {
            throw new IllegalArgumentException("Internal hostnames are not allowed");
        }

        // Resolve ONCE. Validate every address so a multi-record host cannot slip an internal
        // IP past us, and pin to the first (all are vetted) so send() reuses this exact result.
        InetAddress[] addrs;
        try {
            addrs = InetAddress.getAllByName(host);
        } catch (Exception e) {
            throw new IllegalArgumentException("Cannot resolve host: " + host);
        }
        if (addrs.length == 0) throw new IllegalArgumentException("Cannot resolve host: " + host);
        for (InetAddress addr : addrs) {
            assertPublicAddress(addr);
        }

        int port = uri.getPort() == -1 ? 443 : uri.getPort();
        String rawPath = uri.getRawPath();
        String requestTarget = (rawPath == null || rawPath.isBlank()) ? "/" : rawPath;
        if (uri.getRawQuery() != null) requestTarget += "?" + uri.getRawQuery();

        return new ResolvedTarget(host, port, requestTarget, addrs[0]);
    }

    /** Reject loopback / private / link-local / metadata / zero addresses. */
    private static void assertPublicAddress(InetAddress addr) {
        if (addr.isLoopbackAddress()
                || addr.isLinkLocalAddress()
                || addr.isSiteLocalAddress()
                || addr.isAnyLocalAddress()
                || addr.isMulticastAddress()) {
            throw new IllegalArgumentException("Private/loopback IPs are not allowed");
        }
        String ip = addr.getHostAddress();
        if ("0.0.0.0".equals(ip) || "::".equals(ip)) {
            throw new IllegalArgumentException("Zero address is not allowed");
        }
        // Explicit metadata IP guard (in case a hostname resolves to it)
        if ("169.254.169.254".equals(ip)) {
            throw new IllegalArgumentException("Blocked metadata endpoint");
        }
    }

    /**
     * Open a TLS connection to the pinned IP (no re-resolution), verifying the certificate against
     * the original hostname, write the signed POST, and return the HTTP status code.
     */
    private static int sendPinned(
            ResolvedTarget target, String timestamp, String signature, String payloadJson)
            throws Exception {
        byte[] body = payloadJson.getBytes(StandardCharsets.UTF_8);
        String requestHead =
                "POST "
                        + target.requestTarget()
                        + " HTTP/1.1\r\n"
                        + "Host: "
                        + target.host()
                        + "\r\n"
                        + "Content-Type: application/json\r\n"
                        + "X-Timestamp: "
                        + timestamp
                        + "\r\n"
                        + "X-Webhook-Signature: "
                        + signature
                        + "\r\n"
                        + "Content-Length: "
                        + body.length
                        + "\r\n"
                        + "Connection: close\r\n"
                        + "User-Agent: ReportStudio-Webhook/1\r\n"
                        + "\r\n";

        SSLSocketFactory factory = (SSLSocketFactory) SSLSocketFactory.getDefault();
        // Connect a plain socket to the vetted IP, then layer TLS over it passing the original
        // hostname so SNI and (with endpoint identification enabled) certificate verification
        // target the hostname, not the IP. This is the piece java.net.http.HttpClient can't do:
        // it would re-resolve the hostname itself.
        Socket plain = new Socket();
        try {
            plain.connect(new InetSocketAddress(target.pinnedIp(), target.port()), TIMEOUT_MS);
            try (SSLSocket ssl =
                    (SSLSocket) factory.createSocket(plain, target.host(), target.port(), true)) {
                ssl.setSoTimeout(TIMEOUT_MS);
                SSLParameters params = ssl.getSSLParameters();
                params.setEndpointIdentificationAlgorithm(
                        "HTTPS"); // verify cert against target.host()
                ssl.setSSLParameters(params);
                ssl.startHandshake();

                OutputStream out = ssl.getOutputStream();
                out.write(requestHead.getBytes(StandardCharsets.US_ASCII));
                out.write(body);
                out.flush();

                return readStatusCode(ssl.getInputStream());
            }
        } finally {
            if (!plain.isClosed()) {
                try {
                    plain.close();
                } catch (Exception ignored) {
                }
            }
        }
    }

    /** Read only the HTTP status line (e.g. {@code HTTP/1.1 200 OK}) and return the code. */
    private static int readStatusCode(InputStream in) throws Exception {
        BufferedReader reader =
                new BufferedReader(new InputStreamReader(in, StandardCharsets.US_ASCII));
        char[] buf = new char[MAX_STATUS_LINE];
        int read = 0;
        int c;
        while (read < MAX_STATUS_LINE && (c = reader.read()) != -1) {
            if (c == '\n') break;
            buf[read++] = (char) c;
        }
        String statusLine = new String(buf, 0, read).trim();
        // Format: HTTP/1.1 <code> <reason>
        String[] parts = statusLine.split(" ");
        if (parts.length < 2) throw new IllegalStateException("Malformed HTTP status line");
        return Integer.parseInt(parts[1]);
    }

    private static String hmacSha256(String data, String secret) throws Exception {
        if (secret == null || secret.isBlank()) return "unsigned";
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return HexFormat.of().formatHex(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
    }
}

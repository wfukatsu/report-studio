package com.report.server;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit tests for {@link WebhookDispatcher#validateUrl} — SSRF input validation.
 *
 * <p>All cases use IP literals or hostname-shape rules that are decided without a real DNS
 * lookup, so the suite is network-independent. The send path pins to the exact address vetted
 * here (issue #199), closing the DNS-rebinding TOCTOU; that pinning is structural (the socket
 * connects to {@code ResolvedTarget.pinnedIp} from this single resolution) and is not exercised
 * over a live TLS server here.
 */
class WebhookDispatcherTest {

    @Test
    void rejectsNonHttps() {
        Exception e = assertThrows(IllegalArgumentException.class,
                () -> WebhookDispatcher.validateUrl("http://8.8.8.8/hook"));
        assertTrue(e.getMessage().contains("https"));
    }

    @Test
    void rejectsBlankUrl() {
        assertThrows(IllegalArgumentException.class, () -> WebhookDispatcher.validateUrl(""));
        assertThrows(IllegalArgumentException.class, () -> WebhookDispatcher.validateUrl(null));
    }

    @Test
    void rejectsMetadataIpLiteral() {
        assertThrows(IllegalArgumentException.class,
                () -> WebhookDispatcher.validateUrl("https://169.254.169.254/latest/meta-data/"));
    }

    @Test
    void rejectsMetadataHostname() {
        assertThrows(IllegalArgumentException.class,
                () -> WebhookDispatcher.validateUrl("https://metadata.google.internal/computeMetadata/"));
    }

    @Test
    void rejectsInternalAndLocalHostnames() {
        assertThrows(IllegalArgumentException.class,
                () -> WebhookDispatcher.validateUrl("https://db.internal/hook"));
        assertThrows(IllegalArgumentException.class,
                () -> WebhookDispatcher.validateUrl("https://printer.local/hook"));
    }

    @Test
    void rejectsLoopback() {
        assertThrows(IllegalArgumentException.class,
                () -> WebhookDispatcher.validateUrl("https://127.0.0.1/hook"));
    }

    @Test
    void rejectsPrivateRanges() {
        assertThrows(IllegalArgumentException.class,
                () -> WebhookDispatcher.validateUrl("https://10.0.0.5/hook"));
        assertThrows(IllegalArgumentException.class,
                () -> WebhookDispatcher.validateUrl("https://192.168.1.10/hook"));
        assertThrows(IllegalArgumentException.class,
                () -> WebhookDispatcher.validateUrl("https://172.16.5.5/hook"));
    }

    @Test
    void rejectsLinkLocal() {
        assertThrows(IllegalArgumentException.class,
                () -> WebhookDispatcher.validateUrl("https://169.254.10.10/hook"));
    }

    @Test
    void rejectsZeroAddress() {
        assertThrows(IllegalArgumentException.class,
                () -> WebhookDispatcher.validateUrl("https://0.0.0.0/hook"));
    }

    @Test
    void acceptsPublicIpLiteral() {
        assertDoesNotThrow(() -> WebhookDispatcher.validateUrl("https://8.8.8.8/hook"));
    }
}

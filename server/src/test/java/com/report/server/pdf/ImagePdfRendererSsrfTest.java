package com.report.server.pdf;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

/**
 * Unit tests for the SSRF guard in {@link ImagePdfRenderer#isSafeUrl(String)} (issue #59; hardening
 * tracked in issue #58).
 *
 * <p>Hosts are given as IP literals or hosts-file names so the tests never depend on external DNS.
 * Note the known TOCTOU gap (#58): {@code isSafeUrl} resolves DNS separately from the subsequent
 * fetch, so these tests cover the check itself, not rebinding between check and use.
 */
class ImagePdfRendererSsrfTest {

    // ── Scheme filtering ────────────────────────────────────────────────

    @Test
    void blocksNonHttpSchemes() {
        assertFalse(ImagePdfRenderer.isSafeUrl("file:///etc/passwd"));
        assertFalse(ImagePdfRenderer.isSafeUrl("ftp://8.8.8.8/image.png"));
        assertFalse(ImagePdfRenderer.isSafeUrl("gopher://8.8.8.8/"));
        assertFalse(ImagePdfRenderer.isSafeUrl("jar:http://8.8.8.8/a.jar!/img.png"));
    }

    @Test
    void blocksSchemelessAndMalformedUrls() {
        assertFalse(ImagePdfRenderer.isSafeUrl("//8.8.8.8/image.png"));
        assertFalse(ImagePdfRenderer.isSafeUrl("not a url at all"));
        assertFalse(ImagePdfRenderer.isSafeUrl(""));
        assertFalse(ImagePdfRenderer.isSafeUrl("http://"));
    }

    // ── Cloud metadata / internal hostnames ─────────────────────────────

    @Test
    void blocksCloudMetadataEndpoints() {
        assertFalse(ImagePdfRenderer.isSafeUrl("http://169.254.169.254/latest/meta-data/"));
        assertFalse(
                ImagePdfRenderer.isSafeUrl("http://metadata.google.internal/computeMetadata/v1/"));
    }

    // ── Private / special IP ranges ─────────────────────────────────────

    @Test
    void blocksLoopback() {
        assertFalse(ImagePdfRenderer.isSafeUrl("http://127.0.0.1/img.png"));
        assertFalse(ImagePdfRenderer.isSafeUrl("http://localhost/img.png"));
        assertFalse(ImagePdfRenderer.isSafeUrl("http://[::1]/img.png"));
    }

    @Test
    void blocksRfc1918Ranges() {
        assertFalse(ImagePdfRenderer.isSafeUrl("http://10.0.0.5/img.png"));
        assertFalse(ImagePdfRenderer.isSafeUrl("http://172.16.0.1/img.png"));
        assertFalse(ImagePdfRenderer.isSafeUrl("http://172.31.255.254/img.png"));
        assertFalse(ImagePdfRenderer.isSafeUrl("http://192.168.1.1/img.png"));
    }

    @Test
    void blocksLinkLocalAndMulticast() {
        assertFalse(ImagePdfRenderer.isSafeUrl("http://169.254.1.1/img.png"));
        assertFalse(ImagePdfRenderer.isSafeUrl("http://224.0.0.1/img.png"));
    }

    // ── Public addresses pass ───────────────────────────────────────────

    @Test
    void allowsPublicIpLiterals() {
        assertTrue(ImagePdfRenderer.isSafeUrl("http://8.8.8.8/img.png"));
        assertTrue(ImagePdfRenderer.isSafeUrl("https://1.1.1.1/img.png"));
    }

    @Test
    void allowsAddressesJustOutsidePrivateRanges() {
        // 172.16.0.0/12 boundary: 172.15.x and 172.32.x are public
        assertTrue(ImagePdfRenderer.isSafeUrl("http://172.15.0.1/img.png"));
        assertTrue(ImagePdfRenderer.isSafeUrl("http://172.32.0.1/img.png"));
    }
}

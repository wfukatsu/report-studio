package com.report.server.pdf;

import static com.report.server.pdf.PdfUtils.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Renders image elements to PDF. Supports Base64 data URI and HTTP/HTTPS URL images. Falls back to
 * placeholder for unsupported formats or fetch failures.
 */
public final class ImagePdfRenderer implements ElementPdfRenderer {

    private static final Logger log = LoggerFactory.getLogger(ImagePdfRenderer.class);
    private static final int MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB limit

    /** Per-render image cache. Access via {@link #clearImageCache()} — do not use directly. */
    static final ThreadLocal<Map<String, byte[]>> IMAGE_CACHE =
            ThreadLocal.withInitial(java.util.HashMap::new);

    /**
     * Clear and remove the per-render image cache for the current thread. Call at template
     * boundaries.
     */
    public static void clearImageCache() {
        IMAGE_CACHE.get().clear();
        IMAGE_CACHE.remove();
    }

    private static final Duration FETCH_TIMEOUT = Duration.ofSeconds(10);
    private static final HttpClient HTTP_CLIENT =
            HttpClient.newBuilder()
                    .connectTimeout(FETCH_TIMEOUT)
                    .followRedirects(
                            HttpClient.Redirect
                                    .NEVER) // SSRF: never follow redirects to internal hosts
                    .build();

    @Override
    public String kind() {
        return "image";
    }

    @Override
    public void render(
            PDPageContentStream cs,
            JsonNode el,
            float x,
            float y,
            float w,
            float h,
            float pageHeight,
            PDDocument doc,
            Map<String, PDFont> fontCache)
            throws IOException {
        JsonNode props = el.get("props");
        String src = props != null ? textOf(props, "src", "") : "";
        String objectFit = elementTextOf(el, "objectFit", "contain");
        float opacity = elementFloatOf(el, "opacity", 1f);

        byte[] imageBytes = resolveImageBytes(src);
        if (imageBytes != null) {
            try {
                drawImage(cs, x, y, w, h, doc, imageBytes, objectFit, opacity);
                return;
            } catch (Exception e) {
                log.warn("Failed to render image: {}", e.getMessage());
            }
        }

        // Fallback: placeholder
        renderPlaceholder(cs, x, y, w, h);
    }

    /**
     * Resolve an image source — Base64 data URI or SSRF-guarded HTTP/HTTPS URL — to raw bytes. URL
     * fetches go through the per-render {@link #IMAGE_CACHE}. Returns {@code null} (never throws)
     * when the source is unsupported, blocked, or fails to load, so callers can fall back without
     * aborting the whole PDF. Shared with {@link ApprovalStampRowPdfRenderer} for {@code stampSrc}
     * images.
     */
    static byte[] resolveImageBytes(String src) {
        if (src == null || src.isEmpty()) return null;

        if (src.startsWith("data:image/")) {
            try {
                return decodeDataUri(src);
            } catch (Exception e) {
                log.warn("Failed to decode image data URI: {}", e.getMessage());
                return null;
            }
        }
        if (src.startsWith("http://") || src.startsWith("https://")) {
            if (!isSafeUrl(src)) {
                log.warn("Blocked unsafe image URL (SSRF protection): {}", src);
                return null;
            }
            try {
                // Use per-render cache to avoid duplicate fetches of the same URL
                Map<String, byte[]> cache = IMAGE_CACHE.get();
                byte[] imageBytes = cache.get(src);
                if (imageBytes == null) {
                    imageBytes = fetchUrl(src);
                    cache.put(src, imageBytes);
                }
                return imageBytes;
            } catch (Exception e) {
                log.warn("Failed to fetch image from URL {}: {}", src, e.getMessage());
                return null;
            }
        }
        return null;
    }

    private static byte[] decodeDataUri(String dataUri) throws IOException {
        int commaIdx = dataUri.indexOf(',');
        if (commaIdx < 0) throw new IOException("Invalid data URI: no comma separator");

        String base64Data = dataUri.substring(commaIdx + 1);
        byte[] imageBytes = Base64.getDecoder().decode(base64Data);

        if (imageBytes.length > MAX_IMAGE_BYTES) {
            throw new IOException("Image too large: " + imageBytes.length + " bytes");
        }
        return imageBytes;
    }

    private static byte[] fetchUrl(String url) throws IOException {
        try {
            HttpRequest request =
                    HttpRequest.newBuilder()
                            .uri(URI.create(url))
                            .timeout(FETCH_TIMEOUT)
                            .GET()
                            .build();

            HttpResponse<InputStream> response =
                    HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofInputStream());

            if (response.statusCode() != 200) {
                throw new IOException("HTTP " + response.statusCode() + " fetching image");
            }

            try (InputStream is = response.body()) {
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int totalRead = 0;
                int n;
                while ((n = is.read(buf)) != -1) {
                    totalRead += n;
                    if (totalRead > MAX_IMAGE_BYTES) {
                        throw new IOException("Image too large (>10MB) from URL: " + url);
                    }
                    baos.write(buf, 0, n);
                }
                return baos.toByteArray();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Image fetch interrupted", e);
        }
    }

    /**
     * Draw {@code imageBytes} aspect-fit ({@code contain}), centred in the box whose top-left is
     * ({@code x}, {@code y}=top). For callers that don't specify object-fit (e.g. approvalStampRow,
     * which manages its own opacity).
     */
    static void drawImage(
            PDPageContentStream cs,
            float x,
            float y,
            float w,
            float h,
            PDDocument doc,
            byte[] imageBytes)
            throws IOException {
        drawImage(cs, x, y, w, h, doc, imageBytes, "contain", 1f);
    }

    /**
     * Draw {@code imageBytes} in the box at ({@code x}, {@code y}=top) per {@code objectFit} and
     * {@code opacity}, mirroring the frontend {@code <img>} (#366).
     *
     * <ul>
     *   <li>{@code contain} (default) / {@code none} — scale to fit, preserve aspect, centred
     *   <li>{@code cover} — scale to fill, preserve aspect, centred and clipped to the box
     *   <li>{@code fill} — stretch to the box, ignoring aspect
     * </ul>
     *
     * {@code opacity} &lt; 1 is applied via a non-stroking alpha graphics state.
     */
    static void drawImage(
            PDPageContentStream cs,
            float x,
            float y,
            float w,
            float h,
            PDDocument doc,
            byte[] imageBytes,
            String objectFit,
            float opacity)
            throws IOException {
        PDImageXObject image =
                PDImageXObject.createFromByteArray(doc, imageBytes, "embedded-image");

        float imgAspect = (float) image.getWidth() / image.getHeight();
        float boxAspect = w / h;
        float drawW;
        float drawH;
        boolean clip = false;
        switch (objectFit) {
            case "fill" -> {
                drawW = w;
                drawH = h;
            }
            case "cover" -> {
                // fill the box on the constraining axis; the other axis overflows and is clipped
                if (imgAspect > boxAspect) {
                    drawH = h;
                    drawW = h * imgAspect;
                } else {
                    drawW = w;
                    drawH = w / imgAspect;
                }
                clip = true;
            }
            default -> { // contain / none / unknown
                if (imgAspect > boxAspect) {
                    drawW = w;
                    drawH = w / imgAspect;
                } else {
                    drawH = h;
                    drawW = h * imgAspect;
                }
            }
        }
        float drawX = x + (w - drawW) / 2;
        float drawY = y - h + (h - drawH) / 2;

        boolean needState = clip || opacity < 1f;
        if (needState) cs.saveGraphicsState();
        try {
            if (opacity < 1f) {
                PDExtendedGraphicsState alpha = new PDExtendedGraphicsState();
                alpha.setNonStrokingAlphaConstant(Math.max(0f, opacity));
                cs.setGraphicsStateParameters(alpha);
            }
            if (clip) {
                cs.addRect(x, y - h, w, h);
                cs.clip();
            }
            cs.drawImage(image, drawX, drawY, drawW, drawH);
        } finally {
            if (needState) cs.restoreGraphicsState();
        }
    }

    /**
     * SSRF protection: block dangerous schemes and private/internal network addresses. Validates
     * EVERY resolved address ({@code getAllByName}) so a host with mixed public/private records is
     * rejected outright, and is re-run inside {@link #fetchUrl} right before the request — combined
     * with the JVM's positive DNS cache (default 30s) this closes the practical DNS-rebinding
     * window between check and use (issue #58).
     */
    static boolean isSafeUrl(String url) {
        try {
            URI uri = URI.create(url);

            // Block dangerous schemes
            String scheme = uri.getScheme();
            if (scheme == null) return false;
            if (!"http".equals(scheme) && !"https".equals(scheme)) {
                return false; // blocks file://, gopher://, ftp://, jar://, etc.
            }

            String host = uri.getHost();
            if (host == null || host.isBlank()) return false;

            // Block cloud metadata endpoint (check before DNS resolution)
            if ("169.254.169.254".equals(host) || host.endsWith(".internal")) {
                return false;
            }

            // Every A/AAAA record must be safe — not just the first
            for (InetAddress addr : InetAddress.getAllByName(host)) {
                if (isForbiddenAddress(addr)) return false;
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private static boolean isForbiddenAddress(InetAddress addr) {
        if (addr.isLoopbackAddress()
                || addr.isLinkLocalAddress()
                || addr.isSiteLocalAddress()
                || addr.isMulticastAddress()
                || addr.isAnyLocalAddress()) {
            return true;
        }
        byte[] addrBytes = addr.getAddress();
        if (addrBytes.length == 4) {
            int b0 = addrBytes[0] & 0xFF;
            int b1 = addrBytes[1] & 0xFF;
            // 10.0.0.0/8
            if (b0 == 10) return true;
            // 172.16.0.0/12
            if (b0 == 172 && b1 >= 16 && b1 <= 31) return true;
            // 192.168.0.0/16
            if (b0 == 192 && b1 == 168) return true;
            // 169.254.0.0/16 (link-local, includes metadata endpoint)
            if (b0 == 169 && b1 == 254) return true;
        }
        return false;
    }

    private static void renderPlaceholder(
            PDPageContentStream cs, float x, float y, float w, float h) throws IOException {
        cs.setStrokingColor(Color.LIGHT_GRAY);
        cs.setLineWidth(0.5f);
        cs.addRect(x, y - h, w, h);
        cs.stroke();
        cs.moveTo(x, y);
        cs.lineTo(x + w, y - h);
        cs.stroke();
        cs.moveTo(x + w, y);
        cs.lineTo(x, y - h);
        cs.stroke();
    }
}

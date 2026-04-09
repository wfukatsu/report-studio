package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

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

import static com.report.server.pdf.PdfUtils.*;

/**
 * Renders image elements to PDF.
 * Supports Base64 data URI and HTTP/HTTPS URL images.
 * Falls back to placeholder for unsupported formats or fetch failures.
 */
public final class ImagePdfRenderer implements ElementPdfRenderer {

    private static final Logger log = LoggerFactory.getLogger(ImagePdfRenderer.class);
    private static final int MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB limit

    /** Per-render image cache. Access via {@link #clearImageCache()} — do not use directly. */
    static final ThreadLocal<Map<String, byte[]>> IMAGE_CACHE = ThreadLocal.withInitial(java.util.HashMap::new);

    /** Clear and remove the per-render image cache for the current thread. Call at template boundaries. */
    public static void clearImageCache() {
        IMAGE_CACHE.get().clear();
        IMAGE_CACHE.remove();
    }
    private static final Duration FETCH_TIMEOUT = Duration.ofSeconds(10);
    private static final HttpClient HTTP_CLIENT = HttpClient.newBuilder()
            .connectTimeout(FETCH_TIMEOUT)
            .followRedirects(HttpClient.Redirect.NEVER) // SSRF: never follow redirects to internal hosts
            .build();

    @Override
    public String kind() {
        return "image";
    }

    @Override
    public void render(PDPageContentStream cs, JsonNode el, float x, float y,
                       float w, float h, float pageHeight, PDDocument doc,
                       Map<String, PDFont> fontCache) throws IOException {
        JsonNode props = el.get("props");
        String src = props != null ? textOf(props, "src", "") : "";

        if (src.startsWith("data:image/")) {
            try {
                byte[] imageBytes = decodeDataUri(src);
                drawImage(cs, x, y, w, h, doc, imageBytes);
                return;
            } catch (Exception e) {
                log.warn("Failed to render image from data URI: {}", e.getMessage());
            }
        } else if (src.startsWith("http://") || src.startsWith("https://")) {
            if (!isSafeUrl(src)) {
                log.warn("Blocked unsafe image URL (SSRF protection): {}", src);
            } else {
                try {
                    // Use per-render cache to avoid duplicate fetches of the same URL
                    Map<String, byte[]> cache = IMAGE_CACHE.get();
                    byte[] imageBytes = cache.get(src);
                    if (imageBytes == null) {
                        imageBytes = fetchUrl(src);
                        cache.put(src, imageBytes);
                    }
                    drawImage(cs, x, y, w, h, doc, imageBytes);
                    return;
                } catch (Exception e) {
                    log.warn("Failed to fetch image from URL {}: {}", src, e.getMessage());
                }
            }
        }

        // Fallback: placeholder
        renderPlaceholder(cs, x, y, w, h);
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
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(FETCH_TIMEOUT)
                    .GET()
                    .build();

            HttpResponse<InputStream> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofInputStream());

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

    private static void drawImage(PDPageContentStream cs, float x, float y,
                                  float w, float h, PDDocument doc, byte[] imageBytes) throws IOException {
        PDImageXObject image = PDImageXObject.createFromByteArray(doc, imageBytes, "embedded-image");

        // Draw with aspect ratio preservation
        float imgAspect = (float) image.getWidth() / image.getHeight();
        float boxAspect = w / h;
        float drawW, drawH;
        if (imgAspect > boxAspect) {
            drawW = w;
            drawH = w / imgAspect;
        } else {
            drawH = h;
            drawW = h * imgAspect;
        }
        float drawX = x + (w - drawW) / 2;
        float drawY = y - h + (h - drawH) / 2;

        cs.drawImage(image, drawX, drawY, drawW, drawH);
    }

    /** SSRF protection: block dangerous schemes and private/internal network addresses. */
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

            InetAddress addr = InetAddress.getByName(host);
            if (addr.isLoopbackAddress() || addr.isLinkLocalAddress()
                    || addr.isSiteLocalAddress() || addr.isMulticastAddress()) {
                return false;
            }

            // Double-check private IP ranges after resolution
            byte[] addrBytes = addr.getAddress();
            if (addrBytes.length == 4) {
                int b0 = addrBytes[0] & 0xFF;
                int b1 = addrBytes[1] & 0xFF;
                // 10.0.0.0/8
                if (b0 == 10) return false;
                // 172.16.0.0/12
                if (b0 == 172 && b1 >= 16 && b1 <= 31) return false;
                // 192.168.0.0/16
                if (b0 == 192 && b1 == 168) return false;
                // 169.254.0.0/16 (link-local, includes metadata endpoint)
                if (b0 == 169 && b1 == 254) return false;
            }

            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private static void renderPlaceholder(PDPageContentStream cs, float x, float y, float w, float h) throws IOException {
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

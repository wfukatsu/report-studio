package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * GET /api/v2/templates/{id}/thumbnail
 *
 * <p>Renders the template with empty test data, generates a JPEG thumbnail (400px wide) via {@link
 * ThumbnailGenerator}, and returns it with ETag-based cache headers.
 *
 * <p>Renders the V2 definition natively like {@link PdfController}, but always passes empty test
 * data so placeholders show as blank — suitable for a preview image.
 */
public final class ThumbnailController {

    private static final Logger log = LoggerFactory.getLogger(ThumbnailController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final long TIMEOUT_SECONDS = 20;

    private final JsonBlobRepository definitionsRepo;
    private final ExecutorService pdfExecutor;

    public ThumbnailController(JsonBlobRepository definitionsRepo, ExecutorService pdfExecutor) {
        this.definitionsRepo = definitionsRepo;
        this.pdfExecutor = pdfExecutor;
    }

    public void get(Context ctx) throws Exception {
        String templateId = RequestValidator.validateId(ctx);
        if (templateId == null) return;

        var stored = definitionsRepo.get(templateId);
        if (stored.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Template not found"));
            return;
        }

        JsonNode envelope;
        try {
            envelope = MAPPER.readTree(stored.get());
        } catch (Exception e) {
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Failed to read template"));
            return;
        }

        JsonNode definition = envelope.path("definition");
        if (definition.isMissingNode()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Template has no definition"));
            return;
        }

        // Prepare the V2 definition with empty test data — thumbnails show structure, not live
        // values
        String definitionJson;
        try {
            definitionJson = V2RenderSupport.prepare(definition, MAPPER.createObjectNode(), null);
        } catch (Exception e) {
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Failed to prepare definition"));
            return;
        }

        // ETag based on the definition JSON (changes when the template changes)
        String etag = ThumbnailGenerator.computeETag(definitionJson);
        if (etag.equals(ctx.header("If-None-Match"))) {
            ctx.status(304);
            return;
        }

        // Render PDF + generate thumbnail off the main thread
        final String finalDefinition = definitionJson;
        CompletableFuture<byte[]> future =
                CompletableFuture.supplyAsync(
                        () -> {
                            try {
                                byte[] pdfBytes = PdfRenderer.renderDefinition(finalDefinition);
                                return ThumbnailGenerator.generate(pdfBytes);
                            } catch (Exception e) {
                                throw new RuntimeException("Thumbnail render failed", e);
                            }
                        },
                        pdfExecutor);

        byte[] thumbnail;
        try {
            thumbnail = future.get(TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (TimeoutException e) {
            future.cancel(true);
            ctx.status(504);
            ctx.json(Map.of("error", "Thumbnail generation timed out"));
            return;
        } catch (Exception e) {
            log.warn("Thumbnail generation failed for {}: {}", templateId, e.getMessage());
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Thumbnail generation failed"));
            return;
        }

        if (thumbnail.length == 0) {
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Thumbnail generation produced empty output"));
            return;
        }

        ctx.contentType("image/jpeg");
        ctx.header("ETag", etag);
        ctx.header("Cache-Control", "private, max-age=3600, must-revalidate");
        ctx.result(thumbnail);
        log.debug("Served thumbnail for {}", templateId);
    }
}

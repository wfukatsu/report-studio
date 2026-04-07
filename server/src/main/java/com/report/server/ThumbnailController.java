package com.report.server;

import io.javalin.http.Context;
import io.javalin.http.HttpStatus;

import java.util.Map;

/**
 * Handles GET /api/v1/templates/{id}/thumbnail.
 *
 * <p>Generates a JPEG thumbnail from the stored projection via PDFBox (150 DPI, 85% quality).
 * Uses ETag-based caching to avoid redundant re-generation when the projection hasn't changed.
 */
public final class ThumbnailController {

    private final ProjectionRepository projRepo;

    public ThumbnailController(ProjectionRepository projRepo) {
        this.projRepo = projRepo;
    }

    public void get(Context ctx) throws Exception {
        String id = RequestValidator.validateId(ctx);
        if (id == null) return;

        var projOpt = projRepo.getProjection(id);
        if (projOpt.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            return;
        }

        String projJson = projOpt.get();
        String etag = ThumbnailGenerator.computeETag(projJson);
        if (etag.equals(ctx.header("If-None-Match"))) {
            ctx.status(304);
            return;
        }

        byte[] pdfBytes = PdfRenderer.render(projJson);
        byte[] thumbnail = ThumbnailGenerator.generate(pdfBytes);
        if (thumbnail.length == 0) {
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Thumbnail generation failed"));
            return;
        }

        ctx.header("Content-Type", "image/jpeg");
        ctx.header("ETag", etag);
        ctx.header("Cache-Control", "private, max-age=3600, must-revalidate");
        ctx.result(thumbnail);
    }
}

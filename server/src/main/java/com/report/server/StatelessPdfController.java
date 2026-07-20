package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.javalin.http.Context;
import java.io.IOException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Stateless PDF generation endpoint — accepts template + data inline.
 *
 * <p>POST /api/v2/pdf/generate
 *
 * <pre>
 * Body: { "template": { V2 ReportDefinition }, "data": { key-value pairs } }
 * Response: 200 application/pdf | 400/413/429/500/504 JSON error
 * </pre>
 *
 * <p>Pipeline:
 *
 * <ol>
 *   <li>Parse and validate request body (size, depth, required fields)
 *   <li>Render the V2 definition natively (issue #52)
 *   <li>Enrich with {@link CalculationEngine} (best-effort)
 *   <li>Render PDF with 30-second timeout
 * </ol>
 */
public final class StatelessPdfController {

    private static final Logger log = LoggerFactory.getLogger(StatelessPdfController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int TIMEOUT_SECONDS = 30;
    private static final int MAX_BODY_BYTES = 512 * 1024; // 512KB

    private final ExecutorService pdfExecutor;

    public StatelessPdfController(ExecutorService pdfExecutor) {
        this.pdfExecutor = pdfExecutor;
    }

    /**
     * POST /api/v2/pdf/generate Body: {@code { template: ReportDefinition, data?: {key: value} }}
     * Returns: PDF bytes or JSON error.
     */
    public void generate(Context ctx) throws Exception {
        // Size check
        String body = ctx.body();
        if (body == null || body.isBlank()) {
            ApiError.respond(ctx, 400, "VALIDATION_ERROR", "Request body is required");
            return;
        }
        if (body.length() > MAX_BODY_BYTES) {
            ApiError.respond(ctx, 413, "PAYLOAD_TOO_LARGE", "Request body too large (max 512KB)");
            return;
        }

        // Parse JSON
        JsonNode root;
        try {
            root = MAPPER.readTree(body);
        } catch (Exception e) {
            ApiError.respond(ctx, 400, "VALIDATION_ERROR", "Invalid JSON");
            return;
        }

        // Validate structure
        String validationError = RequestValidator.validatePdfGenerateRequest(root);
        if (validationError != null) {
            ApiError.respond(ctx, 400, "VALIDATION_ERROR", validationError);
            return;
        }

        JsonNode templateNode = root.get("template");
        JsonNode dataNode =
                root.has("data") && !root.get("data").isNull() ? root.get("data") : null;

        // Prepare the V2 definition for native rendering (issue #52)
        String definitionJson;
        try {
            definitionJson = V2RenderSupport.prepare(templateNode, dataNode, null);
        } catch (Exception e) {
            log.error("Failed to prepare V2 definition for stateless PDF: {}", e.getMessage());
            ApiError.respond(ctx, 500, "INTERNAL_ERROR", "Failed to prepare definition");
            return;
        }

        // Render PDF with timeout
        renderAndRespond(ctx, definitionJson);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private void renderAndRespond(Context ctx, String definitionJson) {
        final String defJson = definitionJson;
        try {
            byte[] pdfBytes =
                    CompletableFuture.supplyAsync(
                                    () -> {
                                        try {
                                            return PdfRenderer.renderDefinition(defJson);
                                        } catch (IOException e) {
                                            throw new RuntimeException(e);
                                        }
                                    },
                                    pdfExecutor)
                            .get(TIMEOUT_SECONDS, TimeUnit.SECONDS);
            ctx.contentType("application/pdf");
            ctx.header("Content-Disposition", "attachment; filename=\"generated.pdf\"");
            ctx.result(pdfBytes);
            log.info("Generated stateless PDF ({} bytes)", pdfBytes.length);
        } catch (TimeoutException e) {
            log.error("Stateless PDF generation timed out");
            ApiError.respond(ctx, 504, "TIMEOUT", "PDF generation timed out (30s limit)");
        } catch (Exception e) {
            log.error("Stateless PDF generation failed", e);
            ApiError.respond(ctx, 500, "INTERNAL_ERROR", "PDF generation failed");
        }
    }
}

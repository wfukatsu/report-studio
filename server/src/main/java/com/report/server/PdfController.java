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
 * Handles POST /api/v2/templates/{id}/pdf.
 *
 * <p>Pipeline:
 *
 * <ol>
 *   <li>Load V2 template definition from {@code v2_definitions} repository
 *   <li>Parse optional request body for {@code testData} + {@code variantId}
 *   <li>Validate {@code variantId} against {@code outputVariants} if provided
 *   <li>Prepare the V2 definition ({@link V2RenderSupport}) — enrich data via {@link
 *       CalculationEngine}, attach control keys
 *   <li>Render the definition natively ({@link PdfRenderer#renderDefinition}) with a 30-second
 *       timeout
 * </ol>
 */
public final class PdfController {

    private static final Logger log = LoggerFactory.getLogger(PdfController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int TIMEOUT_SECONDS = 30;

    private final JsonBlobRepository definitionsRepo;
    private final ExecutorService pdfExecutor;

    public PdfController(JsonBlobRepository definitionsRepo, ExecutorService pdfExecutor) {
        this.definitionsRepo = definitionsRepo;
        this.pdfExecutor = pdfExecutor;
    }

    /**
     * POST /api/v2/templates/{id}/pdf Body (optional JSON): {@code { testData?: {key: value},
     * variantId?: string }} Returns: PDF bytes with {@code Content-Disposition: attachment}.
     */
    public void generate(Context ctx) throws Exception {
        String templateId = RequestValidator.validateId(ctx);
        if (templateId == null) return;

        // Load definition envelope
        var stored = definitionsRepo.get(templateId);
        if (stored.isEmpty()) {
            ApiError.respond(ctx, 404, "NOT_FOUND", "Template not found");
            return;
        }

        JsonNode envelope;
        try {
            envelope = MAPPER.readTree(stored.get());
        } catch (Exception e) {
            ApiError.respond(ctx, 500, "INTERNAL_ERROR", "Failed to read template");
            return;
        }

        JsonNode definition = envelope.path("definition");
        if (definition.isMissingNode()) {
            ApiError.respond(ctx, 404, "NOT_FOUND", "Template not found");
            return;
        }

        // Parse optional request body
        JsonNode testData = null;
        String variantId = null;
        String body = ctx.body();
        if (body != null && !body.isBlank()) {
            JsonNode req;
            try {
                req = MAPPER.readTree(body);
            } catch (Exception e) {
                ApiError.respond(ctx, 400, "VALIDATION_ERROR", "Invalid JSON in request body");
                return;
            }
            JsonNode td = req.path("testData");
            if (!td.isMissingNode() && !td.isNull()) testData = td;
            String vid = req.path("variantId").asText(null);
            if (vid != null && !vid.isBlank()) variantId = vid;
        }

        // Validate variantId if provided
        if (variantId != null) {
            boolean found = false;
            JsonNode variants = definition.path("outputVariants");
            if (variants.isArray()) {
                for (JsonNode v : variants) {
                    if (variantId.equals(v.path("id").asText(null))) {
                        found = true;
                        break;
                    }
                }
            }
            if (!found) {
                ApiError.respond(ctx, 400, "VALIDATION_ERROR", "Unknown variantId: " + variantId);
                return;
            }
        }

        // Prepare the V2 definition for native rendering (issue #52)
        String definitionJson;
        try {
            definitionJson = V2RenderSupport.prepare(definition, testData, variantId);
        } catch (Exception e) {
            log.error(
                    "Failed to prepare V2 definition for template {}: {}",
                    templateId,
                    e.getMessage());
            ApiError.respond(ctx, 500, "INTERNAL_ERROR", "Failed to prepare definition");
            return;
        }

        renderAndRespond(ctx, templateId, definitionJson);
    }

    // ── private helpers ────────────────────────────────────────────────────────

    private void renderAndRespond(Context ctx, String templateId, String definitionJson) {
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
            ctx.header(
                    "Content-Disposition",
                    "attachment; filename=\"template-" + templateId + ".pdf\"");
            ctx.result(pdfBytes);
            log.info("Generated V2 PDF for template {} ({} bytes)", templateId, pdfBytes.length);
        } catch (TimeoutException e) {
            log.error("V2 PDF generation timed out for template {}", templateId);
            ApiError.respond(ctx, 504, "TIMEOUT", "PDF generation timed out (30s limit)");
        } catch (Exception e) {
            log.error("V2 PDF generation failed for template {}", templateId, e);
            ApiError.respond(ctx, 500, "INTERNAL_ERROR", "PDF generation failed");
        }
    }
}

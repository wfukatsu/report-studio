package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.javalin.http.Context;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Handles POST /api/v2/templates/{id}/pdf.
 *
 * <p>Pipeline:
 * <ol>
 *   <li>Load V2 template definition from {@code v2_definitions} repository</li>
 *   <li>Parse optional request body for {@code testData} + {@code variantId}</li>
 *   <li>Validate {@code variantId} against {@code outputVariants} if provided</li>
 *   <li>Convert V2 definition to V1 projection format via {@link V2ProjectionBuilder}</li>
 *   <li>Enrich {@code _formData} via {@link CalculationEngine} (falls back on error)</li>
 *   <li>Render PDF asynchronously with 30-second timeout</li>
 * </ol>
 */
public final class V2PdfController {

    private static final Logger log = LoggerFactory.getLogger(V2PdfController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int TIMEOUT_SECONDS = 30;

    private final JsonBlobRepository definitionsRepo;
    private final ExecutorService pdfExecutor;

    public V2PdfController(JsonBlobRepository definitionsRepo, ExecutorService pdfExecutor) {
        this.definitionsRepo = definitionsRepo;
        this.pdfExecutor = pdfExecutor;
    }

    /**
     * POST /api/v2/templates/{id}/pdf
     * Body (optional JSON): {@code { testData?: {key: value}, variantId?: string }}
     * Returns: PDF bytes with {@code Content-Disposition: attachment}.
     */
    public void generate(Context ctx) throws Exception {
        String templateId = RequestValidator.validateId(ctx);
        if (templateId == null) return;

        // Load definition envelope
        var stored = definitionsRepo.get(templateId);
        if (stored.isEmpty()) {
            ctx.status(404);
            ctx.json(Map.of("error", "Template not found"));
            return;
        }

        JsonNode envelope;
        try {
            envelope = MAPPER.readTree(stored.get());
        } catch (Exception e) {
            ctx.status(500);
            ctx.json(Map.of("error", "Failed to read template"));
            return;
        }

        JsonNode definition = envelope.path("definition");
        if (definition.isMissingNode()) {
            ctx.status(404);
            ctx.json(Map.of("error", "Template not found"));
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
                ctx.status(400);
                ctx.json(Map.of("error", "Invalid JSON in request body"));
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
                ctx.status(400);
                ctx.json(Map.of("error", "Unknown variantId: " + variantId));
                return;
            }
        }

        // Build V1 projection from V2 definition
        String projectionJson;
        try {
            projectionJson = V2ProjectionBuilder.build(templateId, definition, testData, variantId);
        } catch (Exception e) {
            log.error("V2ProjectionBuilder failed for template {}: {}", templateId, e.getMessage());
            ctx.status(500);
            ctx.json(Map.of("error", "Failed to build projection"));
            return;
        }

        // Enrich with CalculationEngine (best-effort; falls back on error)
        projectionJson = enrichWithCalculations(templateId, projectionJson);

        renderAndRespond(ctx, templateId, projectionJson);
    }

    // ── private helpers ────────────────────────────────────────────────────────

    private String enrichWithCalculations(String templateId, String projectionJson) {
        try {
            ObjectNode projNode = (ObjectNode) MAPPER.readTree(projectionJson);
            JsonNode formDataNode = projNode.path("_formData");
            Map<String, Object> enriched = CalculationEngine.apply(
                    projNode, formDataNode.isMissingNode() ? null : formDataNode);
            projNode.set("_formData", MAPPER.valueToTree(enriched));
            return MAPPER.writeValueAsString(projNode);
        } catch (CircularDependencyException e) {
            log.warn("Circular dependency in V2 PDF calculation for template {}: {}", templateId, e.getMessage());
            return projectionJson;
        } catch (Exception e) {
            log.warn("CalculationEngine enrichment failed for V2 template {}: {}", templateId, e.getMessage());
            return projectionJson;
        }
    }

    private void renderAndRespond(Context ctx, String templateId, String projectionJson) {
        final String projJson = projectionJson;
        try {
            byte[] pdfBytes = CompletableFuture
                    .supplyAsync(() -> {
                        try {
                            return PdfRenderer.render(projJson);
                        } catch (IOException e) {
                            throw new RuntimeException(e);
                        }
                    }, pdfExecutor)
                    .get(TIMEOUT_SECONDS, TimeUnit.SECONDS);
            ctx.contentType("application/pdf");
            ctx.header("Content-Disposition",
                    "attachment; filename=\"template-" + templateId + ".pdf\"");
            ctx.result(pdfBytes);
            log.info("Generated V2 PDF for template {} ({} bytes)", templateId, pdfBytes.length);
        } catch (TimeoutException e) {
            log.error("V2 PDF generation timed out for template {}", templateId);
            ctx.status(504);
            ctx.json(Map.of("error", "PDF generation timed out (30s limit)"));
        } catch (Exception e) {
            log.error("V2 PDF generation failed for template {}", templateId, e);
            ctx.status(500);
            ctx.json(Map.of("error", "PDF generation failed"));
        }
    }
}

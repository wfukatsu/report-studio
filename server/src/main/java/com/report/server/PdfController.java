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
 * Handles POST /api/v1/templates/{id}/pdf.
 *
 * <p>Pipeline:
 * <ol>
 *   <li>Parse + validate request body (optional projection override)</li>
 *   <li>Validate variantId if provided</li>
 *   <li>Enrich _formData via CalculationEngine</li>
 *   <li>Pre-flight FieldConstraint validation via ValidationEngine</li>
 *   <li>Render PDF asynchronously with 30-second timeout</li>
 * </ol>
 */
public final class PdfController {

    private static final Logger log = LoggerFactory.getLogger(PdfController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int TIMEOUT_SECONDS = 30;

    private final ProjectionRepository projRepo;
    private final ExecutorService pdfExecutor;

    public PdfController(ProjectionRepository projRepo, ExecutorService pdfExecutor) {
        this.projRepo = projRepo;
        this.pdfExecutor = pdfExecutor;
    }

    public void generate(Context ctx) throws Exception {
        String templateId = RequestValidator.validateId(ctx);
        if (templateId == null) return;

        String projectionJson = resolveProjection(ctx, templateId);
        if (projectionJson == null) return; // error already written

        projectionJson = applyVariantId(ctx, projectionJson);
        if (projectionJson == null) return;

        projectionJson = enrichWithCalculations(ctx, templateId, projectionJson);
        if (projectionJson == null) return;

        if (!validateConstraints(ctx, projectionJson)) return;

        renderAndRespond(ctx, templateId, projectionJson);
    }

    // ── private helpers ────────────────────────────────────────────────────────

    /** Returns the projection JSON to use: request body override or stored projection. */
    private String resolveProjection(Context ctx, String templateId) throws Exception {
        String body = ctx.body();
        if (body != null && !body.isBlank() && body.startsWith("{")) {
            try {
                var parsed = MAPPER.readTree(body);
                if (!parsed.has("templates") || !parsed.get("templates").isArray()) {
                    ctx.status(400);
                    ctx.json(Map.of("error", "Invalid projection: 'templates' array required"));
                    return null;
                }
            } catch (Exception e) {
                ctx.status(400);
                ctx.json(Map.of("error", "Invalid JSON in request body"));
                return null;
            }
            return body;
        }
        return projRepo.getProjection(templateId).orElse("{\"templates\":[]}");
    }

    /** Validates variantId query param and injects _variantId into the projection. */
    private String applyVariantId(Context ctx, String projectionJson) throws Exception {
        String variantId = ctx.queryParam("variantId");
        if (variantId == null || variantId.isBlank()) return projectionJson;

        try {
            var parsed = MAPPER.readTree(projectionJson);
            boolean found = false;
            outer:
            for (JsonNode variantTmpl : parsed.path("templates")) {
                for (JsonNode v : variantTmpl.path("variants")) {
                    if (variantId.equals(v.path("variantId").asText(null))) {
                        found = true;
                        break outer;
                    }
                }
            }
            if (!found) {
                ctx.status(400);
                ctx.json(Map.of("error", "Unknown variantId: " + variantId));
                return null;
            }
            var rootNode = (ObjectNode) MAPPER.readTree(projectionJson);
            rootNode.put("_variantId", variantId);
            return rootNode.toString();
        } catch (Exception e) {
            ctx.status(400);
            ctx.json(Map.of("error", "Invalid projection JSON during variant validation"));
            return null;
        }
    }

    /** Enriches _formData with CalculationRule results. Falls back on failure. */
    private String enrichWithCalculations(Context ctx, String templateId, String projectionJson) {
        try {
            var projNode = (ObjectNode) MAPPER.readTree(projectionJson);
            JsonNode formDataNode = projNode.path("_formData");
            var enriched = CalculationEngine.apply(
                projNode, formDataNode.isMissingNode() ? null : formDataNode);
            projNode.set("_formData", MAPPER.valueToTree(enriched));
            return MAPPER.writeValueAsString(projNode);
        } catch (CircularDependencyException e) {
            ctx.status(422);
            ctx.json(Map.of("error", "circular_dependency", "cycle", e.getCycle()));
            return null;
        } catch (Exception e) {
            log.warn("CalculationEngine enrichment failed for template {}: {}", templateId, e.getMessage());
            return projectionJson; // fall back to unenriched
        }
    }

    /** Returns false (and writes error) if there are error-severity validation violations. */
    private boolean validateConstraints(Context ctx, String projectionJson) {
        var violations = ValidationEngine.validate(projectionJson);
        var errors = violations.stream()
                .filter(v -> "error".equals(v.severity()))
                .toList();
        if (!errors.isEmpty()) {
            ctx.status(422);
            ctx.json(Map.of("error", "Validation failed", "violations", errors));
            return false;
        }
        return true;
    }

    /** Renders PDF asynchronously and writes result to response. */
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
            log.info("Generated PDF for template: {} ({} bytes)", templateId, pdfBytes.length);
        } catch (TimeoutException e) {
            log.error("PDF generation timed out for template {}", templateId);
            ctx.status(504);
            ctx.json(Map.of("error", "PDF generation timed out (30s limit)"));
        } catch (Exception e) {
            log.error("PDF generation failed for template {}", templateId, e);
            ctx.status(500);
            ctx.json(Map.of("error", "PDF generation failed"));
        }
    }
}

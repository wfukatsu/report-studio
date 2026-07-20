package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.report.server.auth.Principal;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Generates a PDF for a single V2 form response by rendering the response's data through the
 * template's actual layout.
 *
 * <p>GET /api/v2/templates/{id}/responses/{rid}/pdf
 *
 * <p>Uses the same native renderer as {@link PdfController} / {@link BatchPdfController} ({@link
 * V2RenderSupport#prepare} + {@link PdfRenderer#renderDefinition}) with the response's {@code data}
 * as the form data. Previously this endpoint rendered a bespoke ASCII-only key-value dump that
 * stripped all Japanese and ignored the template design entirely (#153).
 *
 * <p>Template definition is loaded server-side; the client cannot supply a projection (prevents
 * SSRF / injection via crafted projection). PDF generation runs on the {@code pdfExecutor} thread
 * pool with a 30-second timeout.
 */
public final class ResponsePdfController {

    private static final Logger log = LoggerFactory.getLogger(ResponsePdfController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int TIMEOUT_SECONDS = 30;

    private final JsonBlobRepository responseRepo;
    private final JsonBlobRepository definitionsRepo;
    private final ExecutorService pdfExecutor;

    public ResponsePdfController(
            JsonBlobRepository responseRepo,
            JsonBlobRepository definitionsRepo,
            ExecutorService pdfExecutor) {
        this.responseRepo = responseRepo;
        this.definitionsRepo = definitionsRepo;
        this.pdfExecutor = pdfExecutor;
    }

    /** GET /api/v2/templates/{id}/responses/{rid}/pdf */
    public void generatePdf(Context ctx) throws Exception {
        String templateId = RequestValidator.validateId(ctx);
        String responseId = RequestValidator.validateId(ctx, "rid");
        if (templateId == null || responseId == null) return;

        Principal principal = ctx.attribute("principal");

        // Load template envelope
        Optional<String> defBlob = definitionsRepo.get(templateId);
        if (defBlob.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Template not found"));
            return;
        }

        JsonNode envelope;
        try {
            envelope = MAPPER.readTree(defBlob.get());
        } catch (Exception e) {
            log.error("V2 response PDF: failed to parse template {}", templateId, e);
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Failed to load template"));
            return;
        }

        // Ownership check
        String createdBy = envelope.path("created_by").asText("");
        if (!createdBy.isEmpty() && principal != null && !principal.userId().equals(createdBy)) {
            ctx.status(HttpStatus.FORBIDDEN);
            ctx.json(Map.of("error", "Access denied"));
            return;
        }

        // The stored blob is an envelope {created_by, definition:{pages,...}}. The
        // renderer reads `pages` from the root, so unwrap `.definition` (#153).
        // Fall back to the node itself for bare-definition blobs.
        JsonNode definition = envelope.has("definition") ? envelope.path("definition") : envelope;

        // Load response
        Optional<String> responseBlob = responseRepo.get(responseId);
        if (responseBlob.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Response not found"));
            return;
        }

        JsonNode responseNode;
        try {
            responseNode = MAPPER.readTree(responseBlob.get());
        } catch (Exception e) {
            log.error("V2 response PDF: failed to parse response {}", responseId, e);
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Failed to read response"));
            return;
        }

        // Verify response belongs to this template
        if (!templateId.equals(responseNode.path("templateId").asText(""))) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Response not found"));
            return;
        }

        // The response's form data drives the render (may be absent → template
        // sample data is used, same as an empty testData on /pdf).
        JsonNode formData = responseNode.path("data");
        final JsonNode finalFormData =
                formData.isMissingNode() || formData.isNull() ? null : formData;
        final JsonNode finalDefinition = definition;

        try {
            byte[] pdf =
                    CompletableFuture.supplyAsync(
                                    () -> {
                                        try {
                                            String prepared =
                                                    V2RenderSupport.prepare(
                                                            finalDefinition, finalFormData, null);
                                            return PdfRenderer.renderDefinition(prepared);
                                        } catch (Exception e) {
                                            throw new RuntimeException(e);
                                        }
                                    },
                                    pdfExecutor)
                            .get(TIMEOUT_SECONDS, TimeUnit.SECONDS);

            ctx.contentType("application/pdf");
            ctx.header(
                    "Content-Disposition",
                    "attachment; filename=\"response-" + responseId + ".pdf\"");
            ctx.result(pdf);
            log.info(
                    "Generated V2 response PDF for response {} ({} bytes)", responseId, pdf.length);
        } catch (TimeoutException e) {
            log.warn("V2 response PDF generation timed out for response {}", responseId);
            ctx.status(504);
            ctx.json(Map.of("error", "PDF generation timed out"));
        } catch (Exception e) {
            log.error("V2 response PDF generation failed for response {}", responseId, e);
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "PDF generation failed"));
        }
    }
}

package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.report.server.auth.RateLimiter;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.w3c.dom.Document;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * SubmissionExportController — generates e-Tax XML for legal form templates.
 *
 * <p>Phase 4 scope: 源泉徴収票 (withholding tax slip) only.
 * Additional form types trigger abstraction when they arrive (YAGNI).
 *
 * <p>Rate-limited: 5 requests / 5 minutes / IP (same policy as importRateLimiter).
 */
public final class SubmissionExportController {

    private static final Logger log = LoggerFactory.getLogger(SubmissionExportController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final ProjectionRepository projRepo;
    private final RateLimiter rateLimiter = new RateLimiter();

    public SubmissionExportController(ProjectionRepository projRepo) {
        this.projRepo = projRepo;
    }

    /**
     * POST /api/v1/templates/{id}/export-submission
     *
     * <p>Body: {@code { "_formData": { ... } }}  (formData optional)
     * <p>Response: XML file attachment
     */
    public void export(Context ctx) {
        String templateId = RequestValidator.validateId(ctx);
        if (templateId == null) return;

        // Rate limit: 5/5min/IP
        String ip = ctx.ip();
        if (!rateLimiter.isAllowed(ip)) {
            ctx.status(HttpStatus.TOO_MANY_REQUESTS);
            ctx.json(Map.of("error", "Rate limit exceeded. Try again in 5 minutes."));
            return;
        }

        // Resolve projection
        String projectionJson = projRepo.getProjection(templateId).orElse(null);
        if (projectionJson == null) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Template not found"));
            return;
        }

        // Parse projection
        JsonNode projection;
        try {
            projection = MAPPER.readTree(projectionJson);
        } catch (Exception e) {
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Failed to parse template projection"));
            return;
        }

        // Parse request body for formData override
        JsonNode formData = null;
        String body = ctx.body();
        if (body != null && !body.isBlank()) {
            try {
                JsonNode bodyNode = MAPPER.readTree(body);
                JsonNode fd = bodyNode.path("_formData");
                if (!fd.isMissingNode() && !fd.isNull()) {
                    formData = fd;
                }
            } catch (Exception e) {
                ctx.status(HttpStatus.BAD_REQUEST);
                ctx.json(Map.of("error", "Invalid JSON in request body"));
                return;
            }
        }

        // Build XML
        byte[] xmlBytes;
        try {
            Document doc = WithholdingTaxXmlBuilder.build(projection, formData);
            xmlBytes = WithholdingTaxXmlBuilder.toXmlBytes(doc);
        } catch (Exception e) {
            log.error("XML generation failed for template {}", templateId, e);
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "XML generation failed"));
            return;
        }

        String filename = "withholding-tax-" + templateId + ".xml";
        String encodedFilename = URLEncoder.encode(filename, StandardCharsets.UTF_8)
                .replace("+", "%20");

        ctx.contentType("application/xml");
        ctx.header("Content-Disposition",
                "attachment; filename=\"" + filename + "\"; filename*=UTF-8''" + encodedFilename);
        ctx.result(xmlBytes);
        log.info("Generated submission XML for template: {} ({} bytes)", templateId, xmlBytes.length);
    }
}

package com.report.server;

import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.Optional;

/**
 * HTTP handlers for designer-projection endpoints.
 *
 * GET  /api/v1/templates/{id}/designer-projection — fetch projection
 * PUT  /api/v1/templates/{id}/designer-projection — save projection (upsert)
 */
public final class ProjectionController {

    private static final Logger log = LoggerFactory.getLogger(ProjectionController.class);

    private final ProjectionRepository repo;
    private final VersionRepository versionRepo;

    public ProjectionController(ProjectionRepository repo, VersionRepository versionRepo) {
        this.repo = repo;
        this.versionRepo = versionRepo;
    }

    /** GET /api/v1/templates/{id}/designer-projection */
    public void get(Context ctx) {
        String templateId = RequestValidator.validateId(ctx);
        if (templateId == null) return;

        Optional<String> json = repo.getProjection(templateId);
        if (json.isEmpty()) {
            // Return default empty projection for new templates
            ctx.status(HttpStatus.OK);
            ctx.contentType("application/json");
            ctx.result("{\"templates\":[]}");
            return;
        }

        ctx.status(HttpStatus.OK);
        ctx.contentType("application/json");
        ctx.result(json.get());
    }

    /** PUT /api/v1/templates/{id}/designer-projection */
    public void put(Context ctx) {
        String templateId = RequestValidator.validateId(ctx);
        if (templateId == null) return;

        String body = ctx.body();
        if (!RequestValidator.validateProjectionStructure(ctx, body)) return;

        repo.putProjection(templateId, body);
        log.info("Saved projection for template: {}", templateId);

        // Create auto-snapshot if enough time has passed
        try {
            versionRepo.createAutoVersionIfNeeded(templateId, body);
        } catch (Exception e) {
            log.warn("Failed to create auto-version for {}: {}", templateId, e.getMessage());
        }

        ctx.status(HttpStatus.OK);
        ctx.json(Map.of("status", "saved", "templateId", templateId));
    }
}

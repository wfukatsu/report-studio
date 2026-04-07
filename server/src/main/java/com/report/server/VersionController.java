package com.report.server;

import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.Optional;

/**
 * HTTP handlers for template version management endpoints.
 *
 * GET    /api/v1/templates/{id}/versions          — list versions
 * POST   /api/v1/templates/{id}/versions          — create manual version
 * GET    /api/v1/templates/{id}/versions/{vid}     — get version JSON
 * PATCH  /api/v1/templates/{id}/versions/{vid}     — update label
 * DELETE /api/v1/templates/{id}/versions/{vid}     — delete version
 * POST   /api/v1/templates/{id}/versions/{vid}/restore — restore version
 */
public final class VersionController {

    private static final Logger log = LoggerFactory.getLogger(VersionController.class);

    private final VersionRepository versionRepo;
    private final ProjectionRepository projRepo;

    public VersionController(VersionRepository versionRepo, ProjectionRepository projRepo) {
        this.versionRepo = versionRepo;
        this.projRepo = projRepo;
    }

    /** GET /api/v1/templates/{id}/versions */
    public void list(Context ctx) {
        String templateId = RequestValidator.validateId(ctx);
        if (templateId == null) return;

        var versions = versionRepo.listVersions(templateId);
        ctx.json(versions);
    }

    /** POST /api/v1/templates/{id}/versions — create manual snapshot */
    public void create(Context ctx) {
        String templateId = RequestValidator.validateId(ctx);
        if (templateId == null) return;

        // Get current projection as snapshot content
        Optional<String> projJson = projRepo.getProjection(templateId);
        if (projJson.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Template projection not found"));
            return;
        }

        // Extract label from request body
        String label = "";
        try {
            var body = ctx.bodyAsClass(Map.class);
            Object rawLabel = body.get("label");
            if (rawLabel instanceof String s) label = s.strip();
        } catch (Exception ignored) {
            // Empty body is fine — label defaults to ""
        }

        String versionId = versionRepo.createVersion(templateId, projJson.get(), label, false);
        ctx.status(HttpStatus.CREATED);
        ctx.json(Map.of("versionId", versionId, "templateId", templateId));
    }

    /** GET /api/v1/templates/{id}/versions/{vid} */
    public void get(Context ctx) {
        String vid = RequestValidator.validateId(ctx, "vid");
        if (vid == null) return;
        Optional<String> json = versionRepo.getVersion(vid);
        if (json.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Version not found"));
            return;
        }
        ctx.contentType("application/json");
        ctx.result(json.get());
    }

    /** PATCH /api/v1/templates/{id}/versions/{vid} */
    public void updateLabel(Context ctx) {
        String vid = RequestValidator.validateId(ctx, "vid");
        if (vid == null) return;
        try {
            var body = ctx.bodyAsClass(Map.class);
            Object rawLabel = body.get("label");
            if (!(rawLabel instanceof String label)) {
                ctx.status(HttpStatus.BAD_REQUEST);
                ctx.json(Map.of("error", "label is required"));
                return;
            }
            versionRepo.updateLabel(vid, label.strip());
            ctx.json(Map.of("status", "updated", "versionId", vid));
        } catch (Exception e) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Invalid request body"));
        }
    }

    /** DELETE /api/v1/templates/{id}/versions/{vid} */
    public void delete(Context ctx) {
        String vid = RequestValidator.validateId(ctx, "vid");
        if (vid == null) return;
        versionRepo.deleteVersion(vid);
        ctx.json(Map.of("deleted", true, "versionId", vid));
    }

    /** POST /api/v1/templates/{id}/versions/{vid}/restore */
    public void restore(Context ctx) {
        String templateId = RequestValidator.validateId(ctx);
        if (templateId == null) return;
        String vid = RequestValidator.validateId(ctx, "vid");
        if (vid == null) return;

        Optional<String> json = versionRepo.getVersion(vid);
        if (json.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Version not found"));
            return;
        }

        // Save current state as auto-version before restoring
        Optional<String> currentJson = projRepo.getProjection(templateId);
        if (currentJson.isPresent()) {
            versionRepo.createVersion(templateId, currentJson.get(), "auto-save before restore", true);
        }

        // Restore the version
        projRepo.putProjection(templateId, json.get());
        log.info("Restored template {} from version {}", templateId, vid);

        ctx.json(Map.of("status", "restored", "templateId", templateId, "versionId", vid));
    }
}

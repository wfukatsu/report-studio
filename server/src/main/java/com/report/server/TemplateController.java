package com.report.server;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.javalin.http.Context;

import java.util.Map;

/**
 * Handles template CRUD endpoints:
 * <ul>
 *   <li>GET  /api/v1/templates</li>
 *   <li>POST /api/v1/templates</li>
 *   <li>PATCH /api/v1/templates/{id}</li>
 *   <li>DELETE /api/v1/templates/{id}</li>
 * </ul>
 */
public final class TemplateController {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final TemplateListRepository templateList;
    private final ProjectionRepository projRepo;
    private final JsonBlobRepository schemaRepo;
    private final JsonBlobRepository bindingTreeRepo;

    public TemplateController(
            TemplateListRepository templateList,
            ProjectionRepository projRepo,
            JsonBlobRepository schemaRepo,
            JsonBlobRepository bindingTreeRepo) {
        this.templateList = templateList;
        this.projRepo = projRepo;
        this.schemaRepo = schemaRepo;
        this.bindingTreeRepo = bindingTreeRepo;
    }

    public void list(Context ctx) {
        ctx.json(templateList.list());
    }

    public void create(Context ctx) throws Exception {
        String name = RequestValidator.validateTemplateName(ctx, "新しいテンプレート");
        if (name == null) return;
        var meta = templateList.create(name);
        // Auto-create default A4 projection so the editor shows a page immediately
        projRepo.putProjection(meta.id(), buildDefaultProjection(meta.id(), name));
        ctx.status(201);
        ctx.json(meta);
    }

    public void patch(Context ctx) throws Exception {
        String id = RequestValidator.validateId(ctx);
        if (id == null) return;

        var body = ctx.bodyAsClass(java.util.Map.class);

        // Handle formSettings update
        Object rawFormSettings = body.get("formSettings");
        if (rawFormSettings instanceof java.util.Map<?, ?> fsMap) {
            boolean published = Boolean.TRUE.equals(fsMap.get("published"));
            String passwordHash = fsMap.get("passwordHash") instanceof String s ? s : null;
            String defaultMode = fsMap.get("defaultMode") instanceof String s ? s : "standard";
            var settings = new TemplateListRepository.FormSettings(published, passwordHash, defaultMode);
            templateList.updateFormSettings(id, settings);
        }

        // Handle name update
        Object rawName = body.get("name");
        if (rawName instanceof String name && !name.isBlank()) {
            if (name.length() > 200) {
                ctx.status(400);
                ctx.json(Map.of("error", "name too long"));
                return;
            }
            templateList.touch(id, name.strip());
        }

        ctx.json(Map.of("status", "updated", "id", id));
    }

    public void delete(Context ctx) throws Exception {
        String id = RequestValidator.validateId(ctx);
        if (id == null) return;
        boolean deleted = templateList.delete(id);
        if (deleted) {
            // Cascade: remove associated data
            projRepo.deleteProjection(id);
            schemaRepo.delete(id);
            bindingTreeRepo.delete(id);
        }
        ctx.json(Map.of("deleted", deleted));
    }

    /**
     * Builds the default A4 projection JSON for a newly created template.
     * Uses Jackson ObjectMapper to avoid string concatenation injection risks.
     */
    static String buildDefaultProjection(String templateId, String templateName) {
        try {
            ObjectNode margins = MAPPER.createObjectNode()
                .put("topMm", 20).put("rightMm", 15).put("bottomMm", 20).put("leftMm", 15);
            ObjectNode pageSetup = MAPPER.createObjectNode()
                .put("kind", "preset")
                .put("paperSizeId", "A4")
                .put("orientation", "portrait")
                .put("snapshotWidthMm", 210)
                .put("snapshotHeightMm", 297);
            pageSetup.set("margins", margins);

            ObjectNode section = MAPPER.createObjectNode()
                .put("id", "sec-default")
                .put("type", "page_base")
                .put("name", "ページ");
            section.putArray("elements");

            ObjectNode template = MAPPER.createObjectNode()
                .put("id", templateId)
                .put("name", templateName);
            template.set("pageSetup", pageSetup);
            template.putArray("sections").add(section);

            ObjectNode root = MAPPER.createObjectNode();
            root.putArray("templates").add(template);

            return MAPPER.writeValueAsString(root);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to build default projection JSON", e);
        }
    }
}

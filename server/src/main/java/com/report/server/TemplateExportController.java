package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.RateLimiter;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;

/**
 * Template export/import controller.
 * Exports a complete template package (.rds.json) containing projection, schema, and metadata.
 * On import, regenerates all IDs to prevent collisions.
 */
public final class TemplateExportController {

    private static final Logger log = LoggerFactory.getLogger(TemplateExportController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int EXPORT_VERSION = 1;
    private static final int MAX_IMPORT_SIZE = 5_000_000; // 5MB

    private final TemplateListRepository templateList;
    private final ProjectionRepository projRepo;
    private final JsonBlobRepository schemaRepo;
    private final JsonBlobRepository bindingTreeRepo;
    private final RateLimiter importRateLimiter = new RateLimiter();

    public TemplateExportController(
            TemplateListRepository templateList,
            ProjectionRepository projRepo,
            JsonBlobRepository schemaRepo,
            JsonBlobRepository bindingTreeRepo) {
        this.templateList = templateList;
        this.projRepo = projRepo;
        this.schemaRepo = schemaRepo;
        this.bindingTreeRepo = bindingTreeRepo;
    }

    /**
     * GET /api/v1/templates/{id}/export
     * Exports template as a self-contained JSON package.
     */
    public void export(Context ctx) {
        String templateId = RequestValidator.validateId(ctx);
        if (templateId == null) return;

        var metaOpt = templateList.findById(templateId);
        if (metaOpt.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Template not found"));
            return;
        }

        var meta = metaOpt.get();

        ObjectNode pkg = MAPPER.createObjectNode();
        pkg.put("version", EXPORT_VERSION);
        pkg.put("exportedAt", Instant.now().toString());
        pkg.put("generator", "report-design-studio");

        ObjectNode template = MAPPER.createObjectNode();
        template.put("name", meta.name());

        // FormSettings (exclude passwordHash for security)
        if (meta.formSettings() != null) {
            ObjectNode fs = MAPPER.createObjectNode();
            fs.put("published", false); // Always export as unpublished
            fs.put("defaultMode", meta.formSettings().defaultMode() != null
                    ? meta.formSettings().defaultMode() : "standard");
            template.set("formSettings", fs);
        }

        setJsonField(template, "projection", projRepo.getProjection(templateId), true);
        setJsonField(template, "schema", schemaRepo.get(templateId), false);
        setJsonField(template, "bindingTree", bindingTreeRepo.get(templateId), false);

        pkg.set("template", template);

        // RFC 6266: ASCII fallback + UTF-8 filename*
        String asciiName = meta.name().replaceAll("[^a-zA-Z0-9\\-_]", "_");
        String utf8Name = URLEncoder.encode(meta.name(), StandardCharsets.UTF_8).replace("+", "%20");
        ctx.contentType("application/json; charset=utf-8");
        ctx.header("Content-Disposition",
                "attachment; filename=\"" + asciiName + ".rds.json\"; filename*=UTF-8''" + utf8Name + ".rds.json");
        ctx.json(pkg);
        log.info("Exported template: {} ({})", templateId, meta.name());
    }

    /**
     * POST /api/v1/templates/import
     * Imports a template package, regenerating all IDs.
     */
    public void importTemplate(Context ctx) {
        String clientIp = ctx.ip();
        if (!importRateLimiter.isAllowed(clientIp)) {
            ctx.status(HttpStatus.TOO_MANY_REQUESTS);
            ctx.json(Map.of("error", "Too many import attempts. Try again later."));
            return;
        }

        String body = ctx.body();
        if (body == null || body.length() > MAX_IMPORT_SIZE) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Import file too large (max 5MB)"));
            return;
        }

        try {
            JsonNode pkg = MAPPER.readTree(body);

            // Validate structure and version
            if (!pkg.has("version") || !pkg.has("template")) {
                ctx.status(HttpStatus.BAD_REQUEST);
                ctx.json(Map.of("error", "Invalid import format: missing version or template"));
                return;
            }

            int version = pkg.get("version").asInt(0);
            if (version < 1 || version > EXPORT_VERSION) {
                ctx.status(HttpStatus.BAD_REQUEST);
                ctx.json(Map.of("error", "Unsupported import version: " + version));
                return;
            }

            JsonNode templateNode = pkg.get("template");
            String rawName = templateNode.has("name") ? templateNode.get("name").asText() : "インポート済みテンプレート";
            String name = rawName.length() > 200 ? rawName.substring(0, 200) : rawName;

            // Create new template entry
            var meta = templateList.create(name);
            String actualId = meta.id();

            try {
                // Process projection with ID remapping
                if (templateNode.has("projection") && templateNode.get("projection").isObject()) {
                    JsonNode projection = templateNode.get("projection");
                    String remappedJson = remapProjectionIds(projection, actualId);
                    projRepo.putProjection(actualId, remappedJson);
                }

                // Import schema
                if (templateNode.has("schema") && !templateNode.get("schema").isNull()) {
                    schemaRepo.put(actualId, MAPPER.writeValueAsString(templateNode.get("schema")));
                }

                // Import binding tree
                if (templateNode.has("bindingTree") && !templateNode.get("bindingTree").isNull()) {
                    bindingTreeRepo.put(actualId, MAPPER.writeValueAsString(templateNode.get("bindingTree")));
                }

                // Import form settings
                if (templateNode.has("formSettings") && templateNode.get("formSettings").isObject()) {
                    JsonNode fs = templateNode.get("formSettings");
                    String defaultMode = fs.has("defaultMode") ? fs.get("defaultMode").asText() : "standard";
                    templateList.updateFormSettings(actualId,
                            new TemplateListRepository.FormSettings(false, null, defaultMode));
                }
            } catch (Exception inner) {
                // Rollback: remove partial data (best-effort, ignore cleanup errors)
                log.warn("Import failed after template creation, rolling back: {}", actualId);
                try { projRepo.deleteProjection(actualId); } catch (Exception ignored) {}
                try { schemaRepo.delete(actualId); } catch (Exception ignored) {}
                try { bindingTreeRepo.delete(actualId); } catch (Exception ignored) {}
                templateList.delete(actualId);
                throw inner;
            }

            ctx.status(HttpStatus.CREATED);
            ctx.json(Map.of("id", actualId, "name", name, "status", "imported"));
            log.info("Imported template: {} as {}", name, actualId);

        } catch (Exception e) {
            log.error("Failed to import template", e);
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Failed to parse import file"));
        }
    }

    /**
     * Read an optional JSON blob and set it on the target node.
     * On parse failure, logs a warning and sets a fallback (empty object or null).
     */
    private void setJsonField(ObjectNode target, String field, Optional<String> raw, boolean emptyAsObject) {
        if (raw.isPresent()) {
            try {
                target.set(field, MAPPER.readTree(raw.get()));
            } catch (Exception e) {
                log.warn("Failed to parse {} for export", field);
                if (emptyAsObject) {
                    target.set(field, MAPPER.createObjectNode());
                } else {
                    target.putNull(field);
                }
            }
        } else {
            if (emptyAsObject) {
                target.set(field, MAPPER.createObjectNode());
            } else {
                target.putNull(field);
            }
        }
    }

    /**
     * Remap all IDs in projection to new UUIDs, updating internal references
     * including cross-references in element props (e.g., group childIds).
     */
    private String remapProjectionIds(JsonNode projection, String newTemplateId) throws Exception {
        // Mutate in-place — the parsed request tree is discarded after serialization
        ObjectNode root = (ObjectNode) projection;
        JsonNode templates = root.get("templates");
        if (templates == null || !templates.isArray()) return MAPPER.writeValueAsString(root);

        // First pass: build old-to-new ID map for all elements
        Map<String, String> idMap = new HashMap<>();

        for (JsonNode tmpl : templates) {
            if (!tmpl.isObject()) continue;
            JsonNode sections = tmpl.get("sections");
            if (sections == null || !sections.isArray()) continue;
            for (JsonNode sec : sections) {
                if (!sec.isObject()) continue;
                String oldSecId = sec.has("id") ? sec.get("id").asText() : null;
                if (oldSecId != null) {
                    idMap.put(oldSecId, "sec-" + UUID.randomUUID());
                }
                JsonNode elements = sec.get("elements");
                if (elements == null || !elements.isArray()) continue;
                for (JsonNode el : elements) {
                    if (!el.isObject()) continue;
                    String oldElId = el.has("id") ? el.get("id").asText() : null;
                    if (oldElId != null) {
                        idMap.put(oldElId, "el-" + UUID.randomUUID());
                    }
                }
            }
        }

        // Second pass: apply ID remapping
        for (JsonNode tmpl : templates) {
            if (!tmpl.isObject()) continue;
            ((ObjectNode) tmpl).put("id", newTemplateId);

            JsonNode sections = tmpl.get("sections");
            if (sections == null || !sections.isArray()) continue;
            for (JsonNode sec : sections) {
                if (!sec.isObject()) continue;
                ObjectNode secNode = (ObjectNode) sec;
                String oldSecId = secNode.has("id") ? secNode.get("id").asText() : null;
                if (oldSecId != null && idMap.containsKey(oldSecId)) {
                    secNode.put("id", idMap.get(oldSecId));
                }

                JsonNode elements = secNode.get("elements");
                if (elements == null || !elements.isArray()) continue;
                for (JsonNode el : elements) {
                    if (!el.isObject()) continue;
                    ObjectNode elNode = (ObjectNode) el;
                    String oldElId = elNode.has("id") ? elNode.get("id").asText() : null;
                    if (oldElId != null && idMap.containsKey(oldElId)) {
                        elNode.put("id", idMap.get(oldElId));
                    }

                    // Remap cross-references in props (e.g., group childIds)
                    remapPropsReferences(elNode, idMap);
                }
            }
        }

        return MAPPER.writeValueAsString(root);
    }

    /**
     * Remap ID references within element props.
     * Handles: childIds (group elements), and any array of strings that match known IDs.
     */
    private void remapPropsReferences(ObjectNode element, Map<String, String> idMap) {
        JsonNode props = element.get("props");
        if (props == null || !props.isObject()) return;
        ObjectNode propsNode = (ObjectNode) props;

        // Group elements store child element IDs in childIds
        JsonNode childIds = propsNode.get("childIds");
        if (childIds != null && childIds.isArray()) {
            ArrayNode remapped = MAPPER.createArrayNode();
            for (JsonNode idNode : childIds) {
                String oldId = idNode.asText();
                remapped.add(idMap.getOrDefault(oldId, oldId));
            }
            propsNode.set("childIds", remapped);
        }
    }

    /**
     * POST /api/v1/templates/{id}/duplicate
     * Duplicates a template by exporting and re-importing with new IDs.
     */
    public void duplicate(Context ctx) {
        String templateId = RequestValidator.validateId(ctx);
        if (templateId == null) return;

        var metaOpt = templateList.findById(templateId);
        if (metaOpt.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Template not found"));
            return;
        }

        var meta = metaOpt.get();
        String newName = meta.name() + " (コピー)";
        String rawName = newName.length() > 200 ? newName.substring(0, 200) : newName;

        try {
            var newMeta = templateList.create(rawName);
            String actualId = newMeta.id();

            try {
                // Copy projection with ID remapping
                var projOpt = projRepo.getProjection(templateId);
                if (projOpt.isPresent()) {
                    JsonNode projection = MAPPER.readTree(projOpt.get());
                    String remapped = remapProjectionIds(projection, actualId);
                    projRepo.putProjection(actualId, remapped);
                }

                // Copy schema
                var schemaOpt = schemaRepo.get(templateId);
                if (schemaOpt.isPresent()) {
                    schemaRepo.put(actualId, schemaOpt.get());
                }

                // Copy binding tree
                var bindingOpt = bindingTreeRepo.get(templateId);
                if (bindingOpt.isPresent()) {
                    bindingTreeRepo.put(actualId, bindingOpt.get());
                }

                // Copy form settings (unpublished)
                if (meta.formSettings() != null) {
                    String defaultMode = meta.formSettings().defaultMode() != null
                            ? meta.formSettings().defaultMode() : "standard";
                    templateList.updateFormSettings(actualId,
                            new TemplateListRepository.FormSettings(false, null, defaultMode));
                }
            } catch (Exception inner) {
                log.warn("Duplicate failed, rolling back: {}", actualId);
                try { projRepo.deleteProjection(actualId); } catch (Exception ignored) {}
                try { schemaRepo.delete(actualId); } catch (Exception ignored) {}
                try { bindingTreeRepo.delete(actualId); } catch (Exception ignored) {}
                templateList.delete(actualId);
                throw inner;
            }

            ctx.status(HttpStatus.CREATED);
            ctx.json(Map.of("id", actualId, "name", rawName, "status", "duplicated"));
            log.info("Duplicated template: {} → {}", templateId, actualId);

        } catch (Exception e) {
            log.error("Failed to duplicate template", e);
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Failed to duplicate template"));
        }
    }
}

package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.Principal;
import com.report.server.auth.RateLimiter;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * V2 template export/import endpoints:
 *
 * <ul>
 *   <li>GET /api/v2/templates/{id}/export — download as {@code .rds2.json}
 *   <li>POST /api/v2/templates/import — upload {@code .rds2.json}, regenerate all IDs
 * </ul>
 *
 * Export format:
 *
 * <pre>{@code
 * {
 *   "formatVersion": 2,
 *   "exportedAt": "<ISO-8601>",
 *   "definition": { ...ReportDefinition... }
 * }
 * }</pre>
 *
 * On import, the definition gets a brand-new top-level ID and all page/element IDs are regenerated
 * so importing the same file twice cannot collide.
 */
public final class TemplateExportController {

    private static final Logger log = LoggerFactory.getLogger(TemplateExportController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final int FORMAT_VERSION = TemplateEnvelope.CURRENT_FORMAT_VERSION;
    private static final int MAX_IMPORT_BYTES = 5_000_000; // 5 MB
    private static final int MAX_NAME_LENGTH = 200;

    private final JsonBlobRepository definitionsRepo;
    private final RateLimiter importLimiter;

    public TemplateExportController(JsonBlobRepository definitionsRepo, RateLimiter importLimiter) {
        this.definitionsRepo = definitionsRepo;
        this.importLimiter = importLimiter;
    }

    // ── Export ──────────────────────────────────────────────────────────────

    /**
     * GET /api/v2/templates/{id}/export Streams the template definition as a {@code .rds2.json}
     * file.
     */
    public void export(Context ctx) throws Exception {
        String templateId = RequestValidator.validateId(ctx);
        if (templateId == null) return;

        var stored = definitionsRepo.get(templateId);
        if (stored.isEmpty()) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Template not found");
            return;
        }

        // Ownership check — consistent with get() / put() / delete() / duplicate().
        // Returns 404 (not 403) to prevent template ID enumeration.
        if (!TemplateController.isOwner(ctx, stored.get())) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Template not found");
            return;
        }

        JsonNode envelope;
        try {
            envelope = MAPPER.readTree(stored.get());
        } catch (Exception e) {
            ApiError.respond(
                    ctx,
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "Failed to read template");
            return;
        }

        JsonNode definition = envelope.path("definition");
        if (definition.isMissingNode()) {
            ApiError.respond(
                    ctx,
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "Template has no definition");
            return;
        }

        String templateName = envelope.path("name").asText("template");

        ObjectNode exportPackage = MAPPER.createObjectNode();
        exportPackage.put("formatVersion", FORMAT_VERSION);
        exportPackage.put("exportedAt", Instant.now().toString());
        exportPackage.set("definition", definition);

        String json = MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(exportPackage);
        String filename = sanitizeFilename(templateName) + ".rds2.json";
        String encodedFilename =
                URLEncoder.encode(filename, StandardCharsets.UTF_8).replace("+", "%20");

        ctx.contentType("application/json");
        ctx.header(
                "Content-Disposition",
                "attachment; filename=\"" + filename + "\"; filename*=UTF-8''" + encodedFilename);
        ctx.result(json);
        log.info("Exported template {}", templateId);
    }

    // ── Import ───────────────────────────────────────────────────────────────

    /**
     * POST /api/v2/templates/import Body: export package JSON (max 5 MB). Returns 201 with {@code
     * {id, name}}.
     */
    public void importTemplate(Context ctx) throws Exception {
        Principal principal = ctx.attribute("principal");
        String userId = (principal != null) ? principal.userId() : "anonymous";
        if (!importLimiter.isAllowed(userId)) {
            ApiError.respond(ctx, 429, "RATE_LIMITED", "Too many import requests");
            return;
        }

        String body = ctx.body();
        if (body == null || body.isBlank()) {
            ApiError.respond(
                    ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Request body is required");
            return;
        }
        if (body.length() > MAX_IMPORT_BYTES) {
            ApiError.respond(
                    ctx,
                    HttpStatus.BAD_REQUEST,
                    "VALIDATION_ERROR",
                    "Import file too large (max 5 MB)");
            return;
        }

        JsonNode root;
        try {
            root = MAPPER.readTree(body);
        } catch (Exception e) {
            ApiError.respond(ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Invalid JSON");
            return;
        }

        // Require an explicit envelope at the import boundary; the unwrapper
        // migrates v1 ($schema marker) bodies and rejects newer versions.
        var unwrapped = TemplateEnvelope.unwrapStrict(root);
        if (unwrapped.isError()) {
            ApiError.respond(ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", unwrapped.error());
            return;
        }
        JsonNode definition = unwrapped.definition();

        // Structural validation — same save boundary as PUT (issue #52)
        var validationError = ReportDefinitionValidator.validate(definition);
        if (validationError.isPresent()) {
            ApiError.respond(
                    ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", validationError.get());
            return;
        }

        // Regenerate all IDs to prevent collisions
        ObjectNode newDef;
        try {
            newDef = remapAllIds(definition.deepCopy());
        } catch (Exception e) {
            ApiError.respond(
                    ctx,
                    HttpStatus.BAD_REQUEST,
                    "VALIDATION_ERROR",
                    "Failed to process definition: " + e.getMessage());
            return;
        }

        // Derive name from definition metadata; append "(インポート)" suffix
        String rawName = newDef.path("metadata").path("documentName").asText("").strip();
        if (rawName.isEmpty()) rawName = "インポートされたテンプレート";
        String name = rawName + " (インポート)";
        if (name.length() > MAX_NAME_LENGTH) name = name.substring(0, MAX_NAME_LENGTH);
        // Write the updated name back so the sidebar shows it correctly
        if (newDef.has("metadata") && newDef.get("metadata").isObject()) {
            ((ObjectNode) newDef.get("metadata")).put("documentName", name);
        }

        String newId = newDef.path("id").asText();
        long now = System.currentTimeMillis();
        String createdBy = userId;

        ObjectNode envNode = MAPPER.createObjectNode();
        envNode.put("formatVersion", FORMAT_VERSION);
        envNode.put("id", newId);
        envNode.put("name", name);
        envNode.put("created_at", now);
        envNode.put("updated_at", now);
        envNode.put("created_by", createdBy);
        envNode.put("visibility", "private");
        envNode.set("definition", newDef);

        definitionsRepo.put(newId, MAPPER.writeValueAsString(envNode));

        ctx.status(HttpStatus.CREATED);
        ctx.json(Map.of("id", newId, "name", name));
        log.info("Imported template as {} ('{}')", newId, name);
    }

    // ── ID remapping ─────────────────────────────────────────────────────────

    /**
     * Regenerates the top-level template ID plus every page and element ID in the definition.
     * Cross-references inside elements (e.g., group {@code childIds}) are updated to match.
     */
    private static ObjectNode remapAllIds(ObjectNode def) {
        java.util.Map<String, String> idMap = new java.util.HashMap<>();

        // New top-level ID
        String newTemplateId = UUID.randomUUID().toString();
        idMap.put(def.path("id").asText(""), newTemplateId);
        def.put("id", newTemplateId);

        JsonNode pages = def.path("pages");
        if (!pages.isArray()) return def;

        // First pass: collect old → new mappings for pages and elements
        for (JsonNode page : pages) {
            if (!page.isObject()) continue;
            String oldPageId = page.path("id").asText(null);
            if (oldPageId != null && !oldPageId.isBlank()) {
                idMap.put(oldPageId, "page-" + UUID.randomUUID());
            }
            // Collect from page.elements (deprecated legacy path)
            collectElementIds(page.path("elements"), idMap);
            // Collect from page.sections[].elements (modern path)
            JsonNode sections = page.path("sections");
            if (sections.isArray()) {
                for (JsonNode section : sections) {
                    if (!section.isObject()) continue;
                    collectElementIds(section.path("elements"), idMap);
                }
            }
        }

        // Second pass: apply mappings
        for (JsonNode page : pages) {
            if (!page.isObject()) continue;
            ObjectNode pageNode = (ObjectNode) page;
            String oldPageId = pageNode.path("id").asText(null);
            if (oldPageId != null && idMap.containsKey(oldPageId)) {
                pageNode.put("id", idMap.get(oldPageId));
            }
            // Remap page.elements (deprecated legacy path)
            remapElements(pageNode.path("elements"), idMap);
            // Remap page.sections[].elements (modern path)
            JsonNode sections = pageNode.path("sections");
            if (sections.isArray()) {
                for (JsonNode section : sections) {
                    if (!section.isObject()) continue;
                    remapElements(section.path("elements"), idMap);
                }
            }
        }

        return def;
    }

    /** Collect element IDs from a JSON array of elements into the idMap. */
    private static void collectElementIds(JsonNode elements, java.util.Map<String, String> idMap) {
        if (!elements.isArray()) return;
        for (JsonNode el : elements) {
            if (!el.isObject()) continue;
            String oldElId = el.path("id").asText(null);
            if (oldElId != null && !oldElId.isBlank()) {
                idMap.put(oldElId, "el-" + UUID.randomUUID());
            }
        }
    }

    /** Apply ID remapping to a JSON array of elements. */
    private static void remapElements(JsonNode elements, java.util.Map<String, String> idMap) {
        if (!elements.isArray()) return;
        for (JsonNode el : elements) {
            if (!el.isObject()) continue;
            ObjectNode elNode = (ObjectNode) el;
            String oldElId = elNode.path("id").asText(null);
            if (oldElId != null && idMap.containsKey(oldElId)) {
                elNode.put("id", idMap.get(oldElId));
            }
            remapElementReferences(elNode, idMap);
        }
    }

    /** Remap ID cross-references within a single element's props. */
    private static void remapElementReferences(
            ObjectNode element, java.util.Map<String, String> idMap) {
        JsonNode props = element.path("props");
        if (!props.isObject()) return;
        ObjectNode propsNode = (ObjectNode) props;

        // Group elements store child IDs in childIds
        JsonNode childIds = propsNode.path("childIds");
        if (childIds.isArray()) {
            var remapped = MAPPER.createArrayNode();
            for (JsonNode idNode : childIds) {
                String old = idNode.asText();
                remapped.add(idMap.getOrDefault(old, old));
            }
            propsNode.set("childIds", remapped);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static String sanitizeFilename(String name) {
        return name.replaceAll("[\\\\/:*?\"<>|]", "_")
                .replaceAll("\\s+", "_")
                .replaceAll("_{2,}", "_")
                .replaceAll("^_|_$", "");
    }
}

package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.Principal;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Handles V2 template CRUD endpoints:
 * <ul>
 *   <li>GET    /api/v2/templates</li>
 *   <li>POST   /api/v2/templates</li>
 *   <li>GET    /api/v2/templates/{id}</li>
 *   <li>PUT    /api/v2/templates/{id}</li>
 *   <li>DELETE /api/v2/templates/{id}</li>
 * </ul>
 *
 * Storage: {@code v2_definitions} table via {@link JsonBlobRepository}.
 * Stored envelope: canonical envelope + server metadata
 * {@code {formatVersion, id, name, created_at, updated_at, created_by, visibility, definition}}
 * (see docs/template-envelope-spec.md). Blobs stored before {@code formatVersion}
 * was introduced are read as the current version.
 */
public final class TemplateController {

    private static final Logger log = LoggerFactory.getLogger(TemplateController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int MAX_NAME_LENGTH = 200;
    private static final String DEFAULT_NAME = "新しいテンプレート";
    private static final java.util.Set<String> VALID_VISIBILITY = java.util.Set.of("private", "shared", "public");

    private final JsonBlobRepository definitionsRepo;

    public TemplateController(JsonBlobRepository definitionsRepo) {
        this.definitionsRepo = definitionsRepo;
    }

    /**
     * GET /api/v2/templates
     * Returns {@code {items: [{id, name, createdAt, updatedAt}], total: N}}
     *
     * <p>Ownership filtering: returns only templates owned by the calling principal.
     * Legacy templates (created before authentication was introduced, {@code created_by} empty)
     * are returned for every authenticated caller. This is intentional for backwards
     * compatibility with single-user deployments. To restrict access to legacy templates,
     * backfill their {@code created_by} field with the owning user's ID.
     */
    public void list(Context ctx) throws Exception {
        Principal principal = ctx.attribute("principal");
        String visibilityFilter = ctx.queryParam("visibility"); // null = own templates
        List<String> blobs = definitionsRepo.list();
        ArrayNode items = MAPPER.createArrayNode();

        for (String blob : blobs) {
            try {
                JsonNode envelope = MAPPER.readTree(blob);
                String id = envelope.path("id").asText(null);
                if (id == null || id.isBlank()) continue;

                String owner = envelope.path("created_by").asText("");
                String vis = envelope.path("visibility").asText("private");
                boolean isOwner = principal == null || owner.isEmpty() || owner.equals(principal.userId());

                // Apply visibility filter
                if ("public".equals(visibilityFilter)) {
                    if (!"public".equals(vis)) continue;
                } else if ("shared".equals(visibilityFilter)) {
                    if (!"shared".equals(vis) && !"public".equals(vis)) continue;
                } else {
                    // Default: own templates only
                    if (!isOwner) continue;
                }

                ObjectNode item = MAPPER.createObjectNode();
                item.put("id", id);
                item.put("name", envelope.path("name").asText(""));
                item.put("createdAt", toIso(envelope.path("created_at").asLong()));
                item.put("updatedAt", toIso(envelope.path("updated_at").asLong()));
                item.put("visibility", vis);
                item.put("isOwner", isOwner);
                items.add(item);
            } catch (Exception ignored) {
                // skip malformed entries
            }
        }

        ObjectNode response = MAPPER.createObjectNode();
        response.set("items", items);
        response.put("total", items.size());
        ctx.contentType("application/json");
        ctx.result(MAPPER.writeValueAsString(response));
    }

    /**
     * POST /api/v2/templates
     * Body: {@code {name?: string}}
     * Returns 201 with {@code {id, name, createdAt, updatedAt}}
     */
    public void create(Context ctx) throws Exception {
        String name = extractName(ctx);
        if (name == null) return; // response already sent

        Principal principal = ctx.attribute("principal");
        String createdBy = (principal != null) ? principal.userId() : "unknown";

        String id = UUID.randomUUID().toString();
        long now = System.currentTimeMillis();

        ObjectNode envelope = buildEnvelope(id, name, now, now, buildDefaultDefinition(id, name));
        envelope.put("created_by", createdBy);
        envelope.put("visibility", "private");
        definitionsRepo.put(id, MAPPER.writeValueAsString(envelope));

        ctx.status(HttpStatus.CREATED);
        ctx.contentType("application/json");
        ctx.result(MAPPER.writeValueAsString(buildListItem(id, name, now, now)));
    }

    /**
     * GET /api/v2/templates/{id}
     * Returns the canonical template envelope
     * {@code {formatVersion, id, name, createdAt, updatedAt, visibility, definition}}.
     *
     * <p>Ownership check: if the template has a {@code created_by} field, only that user
     * (or an unauthenticated caller in dev mode) may read it. Returns 404 for both missing
     * and forbidden cases to prevent template ID enumeration.
     */
    public void get(Context ctx) throws Exception {
        String id = RequestValidator.validateId(ctx);
        if (id == null) return;

        var stored = definitionsRepo.get(id);
        if (stored.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Template not found"));
            return;
        }

        // Ownership check — return 404 (not 403) to prevent template ID enumeration
        if (!isOwner(ctx, stored.get())) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Template not found"));
            return;
        }

        JsonNode storedEnvelope;
        try {
            storedEnvelope = MAPPER.readTree(stored.get());
        } catch (Exception e) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Template not found"));
            return;
        }
        JsonNode definition = storedEnvelope.path("definition");
        if (definition.isMissingNode()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Template not found"));
            return;
        }

        ctx.contentType("application/json");
        ctx.result(MAPPER.writeValueAsString(buildResourceEnvelope(id, storedEnvelope, definition)));
    }

    /**
     * PUT /api/v2/templates/{id}
     * Body: canonical envelope {@code {formatVersion: 2, definition}} — a bare
     * ReportDefinition body is still accepted as a deprecated transport form.
     * Returns the updated canonical envelope.
     */
    public void put(Context ctx) throws Exception {
        String id = RequestValidator.validateId(ctx);
        if (id == null) return;

        String body = ctx.body();
        if (body == null || body.isBlank()) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Request body is required"));
            return;
        }

        JsonNode root;
        try {
            root = MAPPER.readTree(body);
        } catch (Exception e) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Invalid JSON"));
            return;
        }

        // Unwrap the envelope (migrating v1 bodies; rejecting newer versions)
        var unwrapped = TemplateEnvelope.unwrap(root);
        if (unwrapped.isError()) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", unwrapped.error()));
            return;
        }
        JsonNode definition = unwrapped.definition();

        // Structural validation at the save boundary (issue #52) — the server
        // no longer stores unbounded documents that only the browser rejected
        var validationError = ReportDefinitionValidator.validate(definition);
        if (validationError.isPresent()) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", validationError.get()));
            return;
        }

        // Preserve created_at and created_by from existing envelope, and verify ownership
        long createdAt = System.currentTimeMillis();
        String createdBy = null;
        var stored = definitionsRepo.get(id);
        if (stored.isPresent()) {
            // Ownership check — return 404 (not 403) to prevent template ID enumeration
            if (!isOwner(ctx, stored.get())) {
                ctx.status(HttpStatus.NOT_FOUND);
                ctx.json(Map.of("error", "Template not found"));
                return;
            }
            try {
                JsonNode existingEnvelope = MAPPER.readTree(stored.get());
                createdAt = existingEnvelope.path("created_at").asLong(createdAt);
                String existing = existingEnvelope.path("created_by").asText(null);
                if (existing != null && !existing.isBlank()) createdBy = existing;
            } catch (Exception ignored) { /* use current time */ }
        }

        // Canonical name lives in metadata.documentName. Fall back to metadata.name
        // for templates authored with that (non-canonical) field so the list/tab
        // display name stays in sync with the actual document (#155).
        JsonNode meta = definition.path("metadata");
        String name = meta.path("documentName").asText("").strip();
        if (name.isEmpty()) name = meta.path("name").asText("").strip();
        if (name.isEmpty()) name = DEFAULT_NAME;
        if (name.length() > MAX_NAME_LENGTH) name = name.substring(0, MAX_NAME_LENGTH);

        long now = System.currentTimeMillis();
        ObjectNode envelope = buildEnvelope(id, name, createdAt, now, definition);
        if (createdBy != null) envelope.put("created_by", createdBy);
        definitionsRepo.put(id, MAPPER.writeValueAsString(envelope));

        ctx.contentType("application/json");
        ctx.result(MAPPER.writeValueAsString(buildResourceEnvelope(id, envelope, definition)));
    }

    /**
     * POST /api/v2/templates/{id}/duplicate
     * Creates a copy of the template with a new ID.
     * Returns 201 with {@code {id, name}}.
     */
    public void duplicate(Context ctx) throws Exception {
        String sourceId = RequestValidator.validateId(ctx);
        if (sourceId == null) return;

        Principal principal = ctx.attribute("principal");

        var stored = definitionsRepo.get(sourceId);
        if (stored.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Template not found"));
            return;
        }

        JsonNode original;
        try {
            original = MAPPER.readTree(stored.get());
        } catch (Exception e) {
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Failed to read template"));
            return;
        }

        // Ownership check: only the creator can duplicate (or legacy templates without createdBy).
        // Returns 404 (not 403) to prevent template ID enumeration — consistent with get/put.
        if (!isOwner(ctx, stored.get())) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Template not found"));
            return;
        }

        String newId = UUID.randomUUID().toString();
        long now = System.currentTimeMillis();
        String originalName = original.path("name").asText(DEFAULT_NAME);
        String newName = originalName + " (コピー)";
        if (newName.length() > MAX_NAME_LENGTH) newName = newName.substring(0, MAX_NAME_LENGTH);

        // Deep-copy the definition and update its id
        JsonNode originalDef = original.path("definition");
        ObjectNode newDef = originalDef.deepCopy();
        newDef.put("id", newId);
        // Also update metadata.documentName in the copy
        if (newDef.has("metadata") && newDef.get("metadata").isObject()) {
            ((ObjectNode) newDef.get("metadata")).put("documentName", newName);
        }

        ObjectNode newEnvelope = buildEnvelope(newId, newName, now, now, newDef);
        // Guard against null principal (e.g., dev mode without auth middleware)
        String duplicatedBy = (principal != null) ? principal.userId() : "unknown";
        newEnvelope.put("created_by", duplicatedBy);
        definitionsRepo.put(newId, MAPPER.writeValueAsString(newEnvelope));

        ctx.status(HttpStatus.CREATED);
        ctx.json(Map.of("id", newId, "name", newName));
    }

    /**
     * DELETE /api/v2/templates/{id}
     * Returns 204.
     */
    public void delete(Context ctx) throws Exception {
        String id = RequestValidator.validateId(ctx);
        if (id == null) return;

        var stored = definitionsRepo.get(id);
        if (stored.isEmpty()) {
            ctx.status(HttpStatus.NO_CONTENT);  // idempotent delete
            return;
        }
        if (!isOwner(ctx, stored.get())) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Template not found"));
            return;
        }

        definitionsRepo.delete(id);
        ctx.status(HttpStatus.NO_CONTENT);
    }

    /**
     * PUT /api/v2/templates/{id}/visibility
     * Body: {@code {visibility: "private"|"shared"|"public"}}
     * Returns 200 with {@code {id, visibility}}.
     * Only the owner can change visibility.
     */
    public void updateVisibility(Context ctx) throws Exception {
        String id = RequestValidator.validateId(ctx);
        if (id == null) return;

        var stored = definitionsRepo.get(id);
        if (stored.isEmpty() || !isOwner(ctx, stored.get())) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Template not found"));
            return;
        }

        JsonNode body = MAPPER.readTree(ctx.body());
        String visibility = body.path("visibility").asText("");
        if (!VALID_VISIBILITY.contains(visibility)) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Invalid visibility. Must be one of: private, shared, public"));
            return;
        }

        ObjectNode envelope = (ObjectNode) MAPPER.readTree(stored.get());
        envelope.put("visibility", visibility);
        envelope.put("updated_at", System.currentTimeMillis());
        definitionsRepo.put(id, MAPPER.writeValueAsString(envelope));

        ctx.json(Map.of("id", id, "visibility", visibility));
    }

    /**
     * POST /api/v2/templates/{id}/copy
     * Creates a copy of a shared/public template for the calling user.
     * Returns 201 with {@code {id, name}}.
     */
    public void copy(Context ctx) throws Exception {
        String id = RequestValidator.validateId(ctx);
        if (id == null) return;

        var stored = definitionsRepo.get(id);
        if (stored.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Template not found"));
            return;
        }

        JsonNode envelope = MAPPER.readTree(stored.get());
        String vis = envelope.path("visibility").asText("private");
        boolean isOwnerCheck = isOwner(ctx, stored.get());

        // Only allow copy of own, shared, or public templates
        if (!isOwnerCheck && !"shared".equals(vis) && !"public".equals(vis)) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Template not found"));
            return;
        }

        Principal principal = ctx.attribute("principal");
        String copiedBy = (principal != null) ? principal.userId() : "unknown";
        String newId = UUID.randomUUID().toString();
        long now = System.currentTimeMillis();
        String originalName = envelope.path("name").asText(DEFAULT_NAME);
        String newName = originalName + " (コピー)";

        ObjectNode newEnvelope = buildEnvelope(newId, newName, now, now, envelope.path("definition").deepCopy());
        newEnvelope.put("created_by", copiedBy);
        newEnvelope.put("visibility", "private");
        definitionsRepo.put(newId, MAPPER.writeValueAsString(newEnvelope));

        ctx.status(HttpStatus.CREATED);
        ctx.json(Map.of("id", newId, "name", newName));
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /**
     * Returns true if the calling principal owns the stored template, or if ownership cannot be
     * determined (unauthenticated caller / legacy template without {@code created_by}).
     *
     * <p>Returning true for legacy templates (empty {@code created_by}) preserves backwards
     * compatibility with single-user deployments created before authentication was introduced.
     *
     * <p>On JSON parse failure the envelope is treated as inaccessible (fail-closed) and
     * {@code false} is returned, preventing malformed envelopes from bypassing ownership.
     *
     * <p>Callers should return HTTP 404 (not 403) on {@code false} to prevent template ID
     * enumeration attacks.
     */
    /** Package-private to allow reuse from sibling controllers (e.g., TemplateExportController). */
    static boolean isOwner(Context ctx, String storedEnvelopeJson) {
        Principal principal = ctx.attribute("principal");
        if (principal == null) return true;  // unauthenticated / dev mode — allow all
        JsonNode envelope;
        try {
            envelope = MAPPER.readTree(storedEnvelopeJson);
        } catch (Exception e) {
            // Malformed envelope — fail closed to avoid ownership bypass on corrupt data
            log.warn("Malformed template envelope, denying ownership check: {}", e.getMessage());
            return false;
        }
        String owner = envelope.path("created_by").asText("");
        if (owner.isEmpty()) return true;  // legacy template without created_by — allow all
        return owner.equals(principal.userId());
    }

    /**
     * Extract and validate name from request body.
     * Returns null (response already sent) if invalid.
     */
    private String extractName(Context ctx) throws Exception {
        String body = ctx.body();
        if (body == null || body.isBlank()) {
            return DEFAULT_NAME;
        }
        JsonNode req;
        try {
            req = MAPPER.readTree(body);
        } catch (Exception e) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Invalid JSON"));
            return null;
        }
        String name = req.path("name").asText("").strip();
        if (name.isEmpty()) return DEFAULT_NAME;
        if (name.length() > MAX_NAME_LENGTH) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "name too long (max " + MAX_NAME_LENGTH + " chars)"));
            return null;
        }
        return name;
    }

    private static ObjectNode buildEnvelope(String id, String name, long createdAt, long updatedAt,
                                            JsonNode definition) {
        ObjectNode env = MAPPER.createObjectNode();
        env.put("formatVersion", TemplateEnvelope.CURRENT_FORMAT_VERSION);
        env.put("id", id);
        env.put("name", name);
        env.put("created_at", createdAt);
        env.put("updated_at", updatedAt);
        env.set("definition", definition);
        return env;
    }

    /**
     * Build the canonical API resource envelope
     * {@code {formatVersion, id, name, createdAt, updatedAt, visibility, definition}}
     * from a stored envelope (docs/template-envelope-spec.md).
     */
    private static ObjectNode buildResourceEnvelope(String id, JsonNode storedEnvelope,
                                                    JsonNode definition) {
        ObjectNode resource = MAPPER.createObjectNode();
        resource.put("formatVersion", TemplateEnvelope.CURRENT_FORMAT_VERSION);
        resource.put("id", id);
        resource.put("name", storedEnvelope.path("name").asText(""));
        resource.put("createdAt", toIso(storedEnvelope.path("created_at").asLong()));
        resource.put("updatedAt", toIso(storedEnvelope.path("updated_at").asLong()));
        resource.put("visibility", storedEnvelope.path("visibility").asText("private"));
        resource.set("definition", definition);
        return resource;
    }

    private static ObjectNode buildListItem(String id, String name, long createdAt, long updatedAt) {
        ObjectNode item = MAPPER.createObjectNode();
        item.put("id", id);
        item.put("name", name);
        item.put("createdAt", toIso(createdAt));
        item.put("updatedAt", toIso(updatedAt));
        return item;
    }

    /** Build a minimal valid ReportDefinition with required array fields. */
    static ObjectNode buildDefaultDefinition(String id, String name) {
        ObjectNode def = MAPPER.createObjectNode();
        def.put("id", id);
        ObjectNode metadata = def.putObject("metadata");
        metadata.put("documentName", name);
        metadata.put("version", "1.0");
        metadata.put("reportType", "general");
        ObjectNode pageSettings = def.putObject("pageSettings");
        pageSettings.put("paperSize", "A4");
        pageSettings.put("orientation", "portrait");
        pageSettings.put("unit", "mm");
        ObjectNode margins = pageSettings.putObject("margins");
        margins.put("top", 20);
        margins.put("right", 20);
        margins.put("bottom", 20);
        margins.put("left", 20);
        def.putObject("defaultTextStyle");
        def.putArray("templateVariables");
        def.putArray("calculationRules");
        def.putArray("dataSources");
        def.putArray("outputVariants");
        def.putArray("submissionModels");
        def.putArray("validationRules");
        def.putArray("pages");
        return def;
    }

    private static String toIso(long epochMilli) {
        if (epochMilli == 0) return null;
        return Instant.ofEpochMilli(epochMilli).toString();
    }
}

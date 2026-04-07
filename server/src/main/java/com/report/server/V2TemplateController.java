package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.Principal;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;

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
 * Envelope format: {@code {id, name, created_at, updated_at, definition: ReportDefinition}}
 */
public final class V2TemplateController {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int MAX_NAME_LENGTH = 200;
    private static final String DEFAULT_NAME = "新しいテンプレート";

    private final JsonBlobRepository definitionsRepo;

    public V2TemplateController(JsonBlobRepository definitionsRepo) {
        this.definitionsRepo = definitionsRepo;
    }

    /**
     * GET /api/v2/templates
     * Returns {@code {items: [{id, name, createdAt, updatedAt}], total: N}}
     */
    public void list(Context ctx) throws Exception {
        List<String> blobs = definitionsRepo.list();
        ArrayNode items = MAPPER.createArrayNode();

        for (String blob : blobs) {
            try {
                JsonNode envelope = MAPPER.readTree(blob);
                String id = envelope.path("id").asText(null);
                if (id == null || id.isBlank()) continue;

                ObjectNode item = MAPPER.createObjectNode();
                item.put("id", id);
                item.put("name", envelope.path("name").asText(""));
                item.put("createdAt", toIso(envelope.path("created_at").asLong()));
                item.put("updatedAt", toIso(envelope.path("updated_at").asLong()));
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
        definitionsRepo.put(id, MAPPER.writeValueAsString(envelope));

        ctx.status(HttpStatus.CREATED);
        ctx.contentType("application/json");
        ctx.result(MAPPER.writeValueAsString(buildListItem(id, name, now, now)));
    }

    /**
     * GET /api/v2/templates/{id}
     * Returns the stored ReportDefinition JSON.
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

        JsonNode definition = extractDefinition(stored.get());
        if (definition == null) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Template not found"));
            return;
        }

        ctx.contentType("application/json");
        ctx.result(MAPPER.writeValueAsString(definition));
    }

    /**
     * PUT /api/v2/templates/{id}
     * Body: ReportDefinition JSON
     * Returns the updated ReportDefinition.
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

        JsonNode definition;
        try {
            definition = MAPPER.readTree(body);
        } catch (Exception e) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Invalid JSON"));
            return;
        }

        // Preserve created_at and created_by from existing envelope
        long createdAt = System.currentTimeMillis();
        String createdBy = null;
        var stored = definitionsRepo.get(id);
        if (stored.isPresent()) {
            try {
                JsonNode existingEnvelope = MAPPER.readTree(stored.get());
                createdAt = existingEnvelope.path("created_at").asLong(createdAt);
                String existing = existingEnvelope.path("created_by").asText(null);
                if (existing != null && !existing.isBlank()) createdBy = existing;
            } catch (Exception ignored) { /* use current time */ }
        }

        String name = definition.path("metadata").path("documentName").asText("").strip();
        if (name.isEmpty()) name = DEFAULT_NAME;
        if (name.length() > MAX_NAME_LENGTH) name = name.substring(0, MAX_NAME_LENGTH);

        long now = System.currentTimeMillis();
        ObjectNode envelope = buildEnvelope(id, name, createdAt, now, definition);
        if (createdBy != null) envelope.put("created_by", createdBy);
        definitionsRepo.put(id, MAPPER.writeValueAsString(envelope));

        ctx.contentType("application/json");
        ctx.result(MAPPER.writeValueAsString(definition));
    }

    /**
     * DELETE /api/v2/templates/{id}
     * Returns 204.
     */
    public void delete(Context ctx) {
        String id = RequestValidator.validateId(ctx);
        if (id == null) return;

        definitionsRepo.delete(id);
        ctx.status(HttpStatus.NO_CONTENT);
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

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

    private static JsonNode extractDefinition(String blob) {
        try {
            JsonNode node = MAPPER.readTree(blob);
            JsonNode def = node.path("definition");
            return def.isMissingNode() ? null : def;
        } catch (Exception e) {
            return null;
        }
    }

    private static ObjectNode buildEnvelope(String id, String name, long createdAt, long updatedAt,
                                            JsonNode definition) {
        ObjectNode env = MAPPER.createObjectNode();
        env.put("id", id);
        env.put("name", name);
        env.put("created_at", createdAt);
        env.put("updated_at", updatedAt);
        env.set("definition", definition);
        return env;
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

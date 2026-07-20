package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.Principal;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Schema CRUD endpoints (unified from former schema-library + v1 schemas):
 *
 * <ul>
 *   <li>GET /api/v2/schemas — list (own + shared)
 *   <li>POST /api/v2/schemas — create
 *   <li>GET /api/v2/schemas/{id} — get (full envelope)
 *   <li>PUT /api/v2/schemas/{id} — update (with optimistic lock)
 *   <li>DELETE /api/v2/schemas/{id} — delete
 * </ul>
 *
 * Storage: {@code schema_library} table via {@link JsonBlobRepository}. Envelope: {@code {id, name,
 * created_at, updated_at, created_by, visibility, definition}}
 *
 * <p>Visibility rules:
 *
 * <ul>
 *   <li>{@code private} — only the owner can see/edit
 *   <li>{@code shared} — all authenticated users can read, only owner can edit
 * </ul>
 */
public final class SchemaLibraryController {

    private static final Logger log = LoggerFactory.getLogger(SchemaLibraryController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int MAX_NAME_LENGTH = 200;

    private final JsonBlobRepository repo;

    public SchemaLibraryController(JsonBlobRepository repo) {
        this.repo = repo;
    }

    // -----------------------------------------------------------------------
    // LIST — own + shared
    // -----------------------------------------------------------------------

    public void list(Context ctx) throws Exception {
        Principal principal = ctx.attribute("principal");
        String userId = (principal != null) ? principal.userId() : "";

        // Use indexed lookup for own schemas, full scan only for shared
        Set<String> seenIds = new java.util.HashSet<>();
        ArrayNode items = MAPPER.createArrayNode();

        // 1. Own schemas — indexed by group_key (fast)
        if (!userId.isEmpty()) {
            for (String blob : repo.listByGroupKey(userId)) {
                addListItem(blob, items, seenIds);
            }
        }

        // 2. Shared schemas — scan all and filter
        for (String blob : repo.list()) {
            try {
                JsonNode envelope = MAPPER.readTree(blob);
                String id = envelope.path("id").asText(null);
                if (id == null || id.isBlank() || seenIds.contains(id)) continue;
                if ("shared".equals(envelope.path("visibility").asText("private"))) {
                    addListItem(blob, items, seenIds);
                }
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

    private void addListItem(String blob, ArrayNode items, Set<String> seenIds) {
        try {
            JsonNode envelope = MAPPER.readTree(blob);
            String id = envelope.path("id").asText(null);
            if (id == null || id.isBlank() || seenIds.contains(id)) return;
            seenIds.add(id);

            ObjectNode item = MAPPER.createObjectNode();
            item.put("id", id);
            item.put("name", envelope.path("name").asText(""));
            item.put("visibility", envelope.path("visibility").asText("private"));
            item.put("createdBy", envelope.path("created_by").asText(""));
            item.put("createdAt", toIso(envelope.path("created_at").asLong()));
            item.put("updatedAt", toIso(envelope.path("updated_at").asLong()));
            items.add(item);
        } catch (Exception ignored) {
            // skip malformed entries
        }
    }

    // -----------------------------------------------------------------------
    // CREATE
    // -----------------------------------------------------------------------

    public void create(Context ctx) throws Exception {
        String body = ctx.body();
        if (body == null || body.isBlank()) {
            ApiError.respond(
                    ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Request body is required");
            return;
        }

        JsonNode input;
        try {
            input = MAPPER.readTree(body);
        } catch (Exception e) {
            ApiError.respond(ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Invalid JSON");
            return;
        }

        String name = input.path("name").asText("").strip();
        if (name.isEmpty()) name = "新しいスキーマ";
        if (name.length() > MAX_NAME_LENGTH) name = name.substring(0, MAX_NAME_LENGTH);

        String visibility = input.path("visibility").asText("private");
        if (!"shared".equals(visibility)) visibility = "private";

        JsonNode definition = input.path("definition");
        if (definition.isMissingNode() || definition.isNull()) {
            ApiError.respond(
                    ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "definition is required");
            return;
        }

        // Validate definition structure (size, group count, field count, depth)
        if (!RequestValidator.validateSchemaDefinition(ctx, body, definition)) return;

        Principal principal = ctx.attribute("principal");
        String createdBy = (principal != null) ? principal.userId() : "unknown";

        String id = UUID.randomUUID().toString();
        long now = System.currentTimeMillis();

        ObjectNode envelope = MAPPER.createObjectNode();
        envelope.put("id", id);
        envelope.put("name", name);
        envelope.put("created_at", now);
        envelope.put("updated_at", now);
        envelope.put("created_by", createdBy);
        envelope.put("visibility", visibility);
        envelope.set("definition", definition);

        repo.put(id, MAPPER.writeValueAsString(envelope), createdBy);

        ctx.status(HttpStatus.CREATED);
        ctx.contentType("application/json");
        ObjectNode result = MAPPER.createObjectNode();
        result.put("id", id);
        result.put("name", name);
        result.put("updatedAt", now);
        ctx.result(MAPPER.writeValueAsString(result));
    }

    // -----------------------------------------------------------------------
    // GET
    // -----------------------------------------------------------------------

    public void get(Context ctx) throws Exception {
        String id = RequestValidator.validateId(ctx);
        if (id == null) return;

        var stored = repo.get(id);
        if (stored.isEmpty()) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Schema not found");
            return;
        }

        JsonNode envelope = MAPPER.readTree(stored.get());

        // Access check: owner or shared
        if (!canRead(ctx, envelope)) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Schema not found");
            return;
        }

        // Return full envelope (id, name, visibility, timestamps, definition)
        ObjectNode result = MAPPER.createObjectNode();
        result.put("id", envelope.path("id").asText());
        result.put("name", envelope.path("name").asText(""));
        result.put("visibility", envelope.path("visibility").asText("private"));
        result.put("createdBy", envelope.path("created_by").asText(""));
        result.put("createdAt", envelope.path("created_at").asLong());
        result.put("updatedAt", envelope.path("updated_at").asLong());
        result.set("definition", envelope.path("definition"));

        ctx.contentType("application/json");
        ctx.result(MAPPER.writeValueAsString(result));
    }

    // -----------------------------------------------------------------------
    // PUT
    // -----------------------------------------------------------------------

    public void put(Context ctx) throws Exception {
        String id = RequestValidator.validateId(ctx);
        if (id == null) return;

        String body = ctx.body();
        if (body == null || body.isBlank()) {
            ApiError.respond(
                    ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Request body is required");
            return;
        }

        JsonNode input;
        try {
            input = MAPPER.readTree(body);
        } catch (Exception e) {
            ApiError.respond(ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Invalid JSON");
            return;
        }

        // Atomic read-compare-write within a single transaction
        var txMgr = repo.getTransactionManager();
        var tx = txMgr.start();
        try {
            var stored = repo.getWithinTx(tx, id);
            if (stored.isEmpty()) {
                tx.abort();
                ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Schema not found");
                return;
            }

            JsonNode existingEnvelope = MAPPER.readTree(stored.get());

            // Only owner can update
            if (!isOwner(ctx, existingEnvelope)) {
                tx.abort();
                ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Schema not found");
                return;
            }

            // Optimistic lock: check updated_at if client provided it
            JsonNode clientUpdatedAt = input.path("updatedAt");
            if (!clientUpdatedAt.isMissingNode() && !clientUpdatedAt.isNull()) {
                long storedUpdatedAt = existingEnvelope.path("updated_at").asLong(0);
                long requestUpdatedAt = clientUpdatedAt.asLong(0);
                if (requestUpdatedAt != 0 && storedUpdatedAt != requestUpdatedAt) {
                    tx.abort();
                    ApiError.respond(
                            ctx,
                            HttpStatus.CONFLICT,
                            "CONFLICT",
                            "Schema has been modified by another user. Please reload.",
                            Map.of("serverUpdatedAt", storedUpdatedAt));
                    return;
                }
            }

            // Preserve created_at and created_by
            long createdAt = existingEnvelope.path("created_at").asLong(System.currentTimeMillis());
            String createdBy = existingEnvelope.path("created_by").asText("unknown");

            String name = input.path("name").asText("").strip();
            if (name.isEmpty()) name = existingEnvelope.path("name").asText("スキーマ");
            if (name.length() > MAX_NAME_LENGTH) name = name.substring(0, MAX_NAME_LENGTH);

            String visibility =
                    input.path("visibility")
                            .asText(existingEnvelope.path("visibility").asText("private"));
            if (!"shared".equals(visibility)) visibility = "private";

            JsonNode definition = input.path("definition");
            if (definition.isMissingNode() || definition.isNull()) {
                definition = existingEnvelope.path("definition");
            } else {
                // Validate new definition structure
                if (!RequestValidator.validateSchemaDefinition(ctx, body, definition)) {
                    tx.abort();
                    return;
                }
            }

            long now = System.currentTimeMillis();
            ObjectNode envelope = MAPPER.createObjectNode();
            envelope.put("id", id);
            envelope.put("name", name);
            envelope.put("created_at", createdAt);
            envelope.put("updated_at", now);
            envelope.put("created_by", createdBy);
            envelope.put("visibility", visibility);
            envelope.set("definition", definition);

            repo.putWithinTx(tx, id, MAPPER.writeValueAsString(envelope));
            tx.commit();

            ctx.contentType("application/json");
            ctx.result(
                    MAPPER.writeValueAsString(
                            Map.of("status", "saved", "id", id, "updatedAt", now)));
        } catch (Exception e) {
            try {
                tx.abort();
            } catch (Exception ignored) {
            }
            throw e;
        }
    }

    // -----------------------------------------------------------------------
    // DELETE
    // -----------------------------------------------------------------------

    public void delete(Context ctx) throws Exception {
        String id = RequestValidator.validateId(ctx);
        if (id == null) return;

        var stored = repo.get(id);
        if (stored.isPresent()) {
            JsonNode envelope = MAPPER.readTree(stored.get());
            if (!isOwner(ctx, envelope)) {
                ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Schema not found");
                return;
            }
        }

        repo.delete(id);
        ctx.status(HttpStatus.NO_CONTENT);
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /** Returns true if caller is the owner (or dev mode with no auth). */
    private static boolean isOwner(Context ctx, JsonNode envelope) {
        Principal principal = ctx.attribute("principal");
        if (principal == null) return true; // dev mode

        String owner = envelope.path("created_by").asText("");
        if (owner.isEmpty()) return true; // legacy

        return owner.equals(principal.userId());
    }

    /** Returns true if caller can read (owner or shared visibility). */
    private static boolean canRead(Context ctx, JsonNode envelope) {
        if (isOwner(ctx, envelope)) return true;
        return "shared".equals(envelope.path("visibility").asText("private"));
    }

    private static String toIso(long epochMillis) {
        return Instant.ofEpochMilli(epochMillis).toString();
    }
}

package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.javalin.http.Context;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

/**
 * Handles schema creation: generates IDs, computes field paths, stores definition.
 */
public final class SchemaController {

    private static final Logger log = LoggerFactory.getLogger(SchemaController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Set<String> VALID_SCALAR_TYPES = Set.of(
            "TEXT", "INT", "BIGINT", "FLOAT", "DOUBLE", "BOOLEAN", "BLOB"
    );
    private static final Set<String> VALID_ROLES = Set.of("master", "detail");

    private final JsonBlobRepository repo;

    public SchemaController(JsonBlobRepository repo) {
        this.repo = repo;
    }

    /** POST /api/v1/schemas */
    public void create(Context ctx) {
        String body = ctx.body();
        if (!RequestValidator.validateJson(ctx, body)) return;

        try {
            JsonNode root = MAPPER.readTree(body);
            String name = root.has("name") ? root.get("name").asText() : "Untitled";
            if (name.length() > 200) name = name.substring(0, 200);

            JsonNode groups = root.get("groups");
            if (groups == null || !groups.isArray()) {
                ctx.status(400);
                ctx.json(Map.of("error", "groups array required"));
                return;
            }
            if (groups.size() > 50) {
                ctx.status(400);
                ctx.json(Map.of("error", "Too many groups (max 50)"));
                return;
            }

            String schemaId = "sch-" + UUID.randomUUID();
            List<Map<String, Object>> resultGroups = new ArrayList<>();

            for (JsonNode gDef : groups) {
                String groupId = "grp-" + UUID.randomUUID();
                String label = gDef.has("label") ? gDef.get("label").asText() : "Group";
                String role = gDef.has("role") ? gDef.get("role").asText() : "master";
                if (!VALID_ROLES.contains(role)) role = "master";
                String namespace = gDef.has("namespace") ? gDef.get("namespace").asText() : "default";
                String tableName = gDef.has("tableName") ? gDef.get("tableName").asText() : label;
                boolean isDetail = "detail".equals(role);

                JsonNode fields = gDef.get("fields");
                List<Map<String, Object>> resultFields = new ArrayList<>();
                String ckLabel = null;

                if (fields != null && fields.isArray()) {
                    if (fields.size() > 200) {
                        ctx.status(400);
                        ctx.json(Map.of("error", "Too many fields in group " + label + " (max 200)"));
                        return;
                    }
                    for (JsonNode fDef : fields) {
                        JsonNode nameNode = fDef.get("name");
                        if (nameNode == null || !nameNode.isTextual()) continue;
                        String fieldId = "fld-" + UUID.randomUUID();
                        String fieldName = nameNode.asText();
                        String scalarType = fDef.has("scalarType") ? fDef.get("scalarType").asText() : "TEXT";
                        if (!VALID_SCALAR_TYPES.contains(scalarType)) scalarType = "TEXT";
                        String keyType = fDef.has("keyType") ? fDef.get("keyType").asText() : "column";
                        String path = isDetail ? label + "[]." + fieldName : label + "." + fieldName;

                        String fieldType = switch (scalarType) {
                            case "INT", "BIGINT", "FLOAT", "DOUBLE" -> "number";
                            case "BOOLEAN" -> "boolean";
                            default -> "string";
                        };

                        if ("clustering".equals(keyType)) ckLabel = fieldName;

                        resultFields.add(Map.of(
                                "kind", "regular", "id", fieldId, "name", fieldName,
                                "path", path, "type", fieldType, "groupId", groupId,
                                "keyType", keyType, "scalarType", scalarType
                        ));
                    }
                }

                LinkedHashMap<String, Object> groupMap = new LinkedHashMap<>();
                groupMap.put("id", groupId);
                groupMap.put("label", label);
                groupMap.put("role", role);
                if (ckLabel != null) groupMap.put("ckLabel", ckLabel);
                groupMap.put("fields", resultFields);
                groupMap.put("tableMeta", Map.of("namespace", namespace, "tableName", tableName, "status", "draft"));
                resultGroups.add(groupMap);
            }

            // Persist schema definition
            Map<String, Object> schemaData = Map.of("id", schemaId, "name", name, "groups", resultGroups);
            repo.put(schemaId, MAPPER.writeValueAsString(schemaData));

            ctx.status(201);
            ctx.json(Map.of("id", schemaId, "groups", resultGroups));
            log.info("Created schema: {} with {} groups", schemaId, resultGroups.size());
        } catch (Exception e) {
            log.error("Schema creation failed", e);
            ctx.status(500);
            ctx.json(Map.of("error", "Schema creation failed"));
        }
    }
}

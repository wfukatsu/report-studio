package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.Principal;
import com.report.server.auth.RateLimiter;
import com.scalar.db.api.DistributedTransaction;
import com.scalar.db.api.DistributedTransactionAdmin;
import com.scalar.db.api.DistributedTransactionManager;
import com.scalar.db.api.Get;
import com.scalar.db.api.Result;
import com.scalar.db.api.TableMetadata;
import com.scalar.db.io.DataType;
import com.scalar.db.io.Key;
import com.scalar.db.service.TransactionFactory;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * POST /api/v2/templates/{id}/resolve-bindings
 *
 * <p>Fetches actual row data from ScalarDB for schema groups that have a tableMeta
 * binding. Returns HTTP 207 (partial success): groups that resolve successfully are in
 * {@code resolved}; groups that fail are in {@code errors} with a diagnostic message.
 * A {@code requestId} is always included for server-side log correlation.
 *
 * <p>Phase 2 restriction: only {@code role=master} groups (single-row Get) are
 * supported. Detail groups (Scan / array result) return an error entry and are skipped.
 *
 * <p>Security:
 * <ul>
 *   <li>Caller must own the template (or the template must have no {@code created_by}).
 *   <li>Each requested (namespace, tableName) pair must exist verbatim in the stored
 *       template's schema {@code tableMeta} — prevents arbitrary table reads.
 *   <li>All identifiers are validated against the shared {@link ScalarDbLimits} regex.
 *   <li>Column names are verified against {@link TableMetadata} before use.
 *   <li>Rate-limited per authenticated user ID ({@code 3 req / 10 s}).
 * </ul>
 */
public final class V2BindingResolveController {

    private static final Logger log = LoggerFactory.getLogger(V2BindingResolveController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** Same identifier regex as V2ScalarDbTableController — keep in sync. */
    private static final Pattern IDENTIFIER = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]*$");

    /** Structural limits — align with ScalarDbLimits and frontend */
    private static final int MAX_GROUPS = 10;
    private static final int MAX_FIELDS_PER_GROUP = 50;
    private static final int MAX_BODY_BYTES = 64 * 1024; // 64 KB

    private final TransactionFactory factory;
    private final JsonBlobRepository definitionsRepo;
    private final RateLimiter rateLimiter;

    public V2BindingResolveController(TransactionFactory factory, JsonBlobRepository definitionsRepo) {
        this(factory, definitionsRepo, new RateLimiter(3, 10_000L));
    }

    /** Package-private constructor for testing. */
    V2BindingResolveController(TransactionFactory factory, JsonBlobRepository definitionsRepo, RateLimiter rateLimiter) {
        this.factory = factory;
        this.definitionsRepo = definitionsRepo;
        this.rateLimiter = rateLimiter;
    }

    /** {@code POST /api/v2/templates/{id}/resolve-bindings} */
    public void resolve(Context ctx) throws Exception {
        String correlationId = CorrelationId.generate();

        // ── Rate limiting ────────────────────────────────────────────────────
        Principal principal = ctx.attribute("principal");
        String userId = (principal != null) ? principal.userId() : "anonymous";
        if (!rateLimiter.isAllowed(userId)) {
            ctx.status(429);
            ctx.json(Map.of("error", "Too many requests"));
            return;
        }

        // ── Path param validation ────────────────────────────────────────────
        String templateId = RequestValidator.validateId(ctx);
        if (templateId == null) return;

        // ── Body size guard ──────────────────────────────────────────────────
        String body = ctx.body();
        if (body == null || body.isBlank()) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Request body is required"));
            return;
        }
        if (body.length() > MAX_BODY_BYTES) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Request body too large (max 64 KB)"));
            return;
        }

        // ── Parse body ───────────────────────────────────────────────────────
        JsonNode req;
        try {
            req = MAPPER.readTree(body);
        } catch (Exception e) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Invalid JSON"));
            return;
        }

        // ── Template ownership verification ──────────────────────────────────
        Optional<String> storedOpt = definitionsRepo.get(templateId);
        if (storedOpt.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Template not found"));
            return;
        }
        if (!V2TemplateController.isOwner(ctx, storedOpt.get())) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Template not found"));
            return;
        }

        // ── Build allowlist from stored template's schema ────────────────────
        Set<String> allowedTables = extractAllowedTables(storedOpt.get());

        // ── Parse schema groups from request ─────────────────────────────────
        JsonNode schemaNode = req.path("schema");
        JsonNode groupsNode = schemaNode.path("groups");
        if (!groupsNode.isArray()) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "schema.groups must be an array"));
            return;
        }
        if (groupsNode.size() > MAX_GROUPS) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Too many groups (max " + MAX_GROUPS + ")"));
            return;
        }

        JsonNode partitionKeysNode = req.path("partitionKeys");
        if (!partitionKeysNode.isObject()) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "partitionKeys must be an object"));
            return;
        }

        // ── Per-group resolution ──────────────────────────────────────────────
        ObjectNode resolved = MAPPER.createObjectNode();
        ObjectNode errors = MAPPER.createObjectNode();

        for (JsonNode group : groupsNode) {
            String groupId = group.path("id").asText(null);
            if (groupId == null || groupId.isBlank()) {
                continue;
            }

            // Phase 2: detail groups are not yet supported
            String role = group.path("role").asText("master");
            if ("detail".equals(role)) {
                errors.put(groupId, "detail groups are not supported in Phase 2");
                continue;
            }

            // Extract and validate table coordinates
            JsonNode tableMeta = group.path("tableMeta");
            if (tableMeta.isMissingNode()) {
                errors.put(groupId, "tableMeta not set — group not bound to a table");
                continue;
            }
            String namespace = tableMeta.path("namespace").asText(null);
            String tableName = tableMeta.path("tableName").asText(null);
            if (!isValidIdentifier(namespace) || !isValidIdentifier(tableName)) {
                errors.put(groupId, "Invalid namespace or tableName identifier");
                continue;
            }

            // Security: verify this table is in the stored template's schema
            String tableKey = namespace + "." + tableName;
            if (!allowedTables.contains(tableKey)) {
                errors.put(groupId, "Table not bound to this template");
                continue;
            }

            // Parse fields
            JsonNode fieldsNode = group.path("fields");
            if (!fieldsNode.isArray() || fieldsNode.size() > MAX_FIELDS_PER_GROUP) {
                errors.put(groupId, "fields missing or too many (max " + MAX_FIELDS_PER_GROUP + ")");
                continue;
            }

            // Build fieldKey → dbColumnName map (name-based, never positional)
            Map<String, String> colToFieldKey = new HashMap<>();
            boolean invalidField = false;
            for (JsonNode field : fieldsNode) {
                String dbCol = field.path("dbColumnName").asText(null);
                String fieldKey = field.path("key").asText(null);
                if (dbCol == null || fieldKey == null) continue;
                if (!isValidIdentifier(dbCol)) {
                    errors.put(groupId, "Invalid dbColumnName: " + sanitize(dbCol));
                    invalidField = true;
                    break;
                }
                colToFieldKey.put(dbCol, fieldKey);
            }
            if (invalidField) continue;

            // Parse partition keys for this group
            JsonNode pkNode = partitionKeysNode.path(groupId);
            if (!pkNode.isObject()) {
                errors.put(groupId, "partitionKeys missing for group");
                continue;
            }

            // ── ScalarDB resolution ─────────────────────────────────────────
            resolveGroup(
                    groupId, namespace, tableName, colToFieldKey, pkNode,
                    resolved, errors, correlationId, userId
            );
        }

        // ── Build response ───────────────────────────────────────────────────
        ObjectNode response = MAPPER.createObjectNode();
        response.set("resolved", resolved);
        response.set("errors", errors);
        response.put("requestId", correlationId);

        log.info("AUDIT op=resolve_bindings user={} templateId={} outcome=completed correlationId={}",
                userId, templateId, correlationId);
        ctx.status(207);
        ctx.contentType("application/json");
        ctx.result(MAPPER.writeValueAsString(response));
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private void resolveGroup(
            String groupId,
            String namespace,
            String tableName,
            Map<String, String> colToFieldKey,
            JsonNode pkNode,
            ObjectNode resolved,
            ObjectNode errors,
            String correlationId,
            String userId
    ) {
        DistributedTransactionManager mgr = factory.getTransactionManager();
        DistributedTransaction tx = null;

        try {
            // Fetch TableMetadata first (using Admin, try-with-resources)
            TableMetadata meta;
            try (DistributedTransactionAdmin admin = factory.getTransactionAdmin()) {
                meta = admin.getTableMetadata(namespace, tableName);
            }

            // TOCTOU guard: table may have been dropped since schema was saved
            if (meta == null) {
                errors.put(groupId, "Schema table was removed since binding; please re-bind");
                log.info("AUDIT op=resolve_bindings user={} groupId={} outcome=schema_removed correlationId={}",
                        userId, groupId, correlationId);
                return;
            }

            // Validate all requested dbColumnNames against actual table schema
            Set<String> actualColumns = new HashSet<>(meta.getColumnNames());
            for (String dbCol : colToFieldKey.keySet()) {
                if (!actualColumns.contains(dbCol)) {
                    errors.put(groupId, "Column not found in table: " + sanitize(dbCol));
                    return;
                }
            }

            // Build partition key
            Key partitionKey = buildPartitionKey(pkNode, meta);
            if (partitionKey == null) {
                errors.put(groupId, "Could not build partition key — check column types");
                return;
            }

            // Execute Get (TransactionManager — not Admin)
            tx = mgr.start();
            Get get = Get.newBuilder()
                    .namespace(namespace)
                    .table(tableName)
                    .partitionKey(partitionKey)
                    .build();
            Optional<Result> resultOpt = tx.get(get);
            tx.commit();

            // Optional.empty() = row not found (not an exception)
            if (resultOpt.isEmpty()) {
                errors.put(groupId, "Row not found");
                return;
            }

            // Map column values to field keys BY NAME (never by position)
            Result result = resultOpt.get();
            ObjectNode groupData = MAPPER.createObjectNode();
            for (Map.Entry<String, String> entry : colToFieldKey.entrySet()) {
                String colName = entry.getKey();
                String fieldKey = entry.getValue();
                if (!actualColumns.contains(colName)) continue;
                if (result.isNull(colName)) {
                    groupData.putNull(fieldKey);
                } else {
                    putTypedValue(groupData, fieldKey, colName, result, meta);
                }
            }
            resolved.set(groupId, groupData);
            errors.putNull(groupId); // explicit null = no error for this group

        } catch (Exception e) {
            abortQuietly(tx);
            // Never include e.getMessage() in the response — it may contain internal details
            log.warn("resolve-bindings groupId={} correlationId={} failed", groupId, correlationId, e);
            errors.put(groupId, "Query failed");
        }
    }

    /**
     * Build a ScalarDB {@link Key} from the partition key values in the request.
     * Uses the {@link TableMetadata} to select the correct typed {@code Key.of*} method.
     * Returns {@code null} if construction fails (type mismatch, missing column, etc.).
     */
    private static Key buildPartitionKey(JsonNode pkValues, TableMetadata meta) {
        try {
            Set<String> partitionKeyNames = meta.getPartitionKeyNames();
            if (partitionKeyNames.size() == 1) {
                String col = partitionKeyNames.iterator().next();
                JsonNode valNode = pkValues.path(col);
                if (valNode.isMissingNode()) return null;
                DataType dt = meta.getColumnDataType(col);
                return buildSingleKey(col, valNode.asText(), dt);
            }
            // Composite partition key
            com.scalar.db.io.Key.Builder builder = Key.newBuilder();
            for (String col : partitionKeyNames) {
                JsonNode valNode = pkValues.path(col);
                if (valNode.isMissingNode()) return null;
                DataType dt = meta.getColumnDataType(col);
                addToKeyBuilder(builder, col, valNode.asText(), dt);
            }
            return builder.build();
        } catch (Exception e) {
            return null;
        }
    }

    private static Key buildSingleKey(String col, String rawValue, DataType dt) {
        return switch (dt) {
            case INT -> Key.ofInt(col, Integer.parseInt(rawValue));
            case BIGINT -> Key.ofBigInt(col, Long.parseLong(rawValue));
            case FLOAT -> Key.ofFloat(col, Float.parseFloat(rawValue));
            case DOUBLE -> Key.ofDouble(col, Double.parseDouble(rawValue));
            case BOOLEAN -> Key.ofBoolean(col, Boolean.parseBoolean(rawValue));
            default -> Key.ofText(col, rawValue); // TEXT, BLOB, TIMESTAMP
        };
    }

    private static void addToKeyBuilder(
            com.scalar.db.io.Key.Builder builder, String col, String rawValue, DataType dt) {
        switch (dt) {
            case INT -> builder.addInt(col, Integer.parseInt(rawValue));
            case BIGINT -> builder.addBigInt(col, Long.parseLong(rawValue));
            case FLOAT -> builder.addFloat(col, Float.parseFloat(rawValue));
            case DOUBLE -> builder.addDouble(col, Double.parseDouble(rawValue));
            case BOOLEAN -> builder.addBoolean(col, Boolean.parseBoolean(rawValue));
            default -> builder.addText(col, rawValue);
        }
    }

    /** Write a typed value from a ScalarDB Result into an ObjectNode. */
    private static void putTypedValue(
            ObjectNode node, String fieldKey, String colName, Result result, TableMetadata meta) {
        DataType dt = meta.getColumnDataType(colName);
        switch (dt) {
            case INT -> node.put(fieldKey, result.getInt(colName));
            case BIGINT -> node.put(fieldKey, result.getBigInt(colName));
            case FLOAT -> node.put(fieldKey, result.getFloat(colName));
            case DOUBLE -> node.put(fieldKey, result.getDouble(colName));
            case BOOLEAN -> node.put(fieldKey, result.getBoolean(colName));
            default -> node.put(fieldKey, result.getText(colName)); // TEXT, BLOB → string
        }
    }

    /**
     * Extract all (namespace.tableName) pairs from the stored template's schema groups.
     * This builds the allowlist for the ownership+binding verification.
     */
    private static Set<String> extractAllowedTables(String storedEnvelopeJson) {
        Set<String> allowed = new HashSet<>();
        try {
            JsonNode envelope = MAPPER.readTree(storedEnvelopeJson);
            JsonNode groups = envelope.path("definition").path("schema").path("groups");
            if (!groups.isArray()) return allowed;
            for (JsonNode group : groups) {
                String ns = group.path("tableMeta").path("namespace").asText(null);
                String tbl = group.path("tableMeta").path("tableName").asText(null);
                if (ns != null && !ns.isBlank() && tbl != null && !tbl.isBlank()) {
                    allowed.add(ns + "." + tbl);
                }
            }
        } catch (Exception ignored) {
            // Malformed envelope — return empty set (caller handles as "no allowed tables")
        }
        return allowed;
    }

    private static boolean isValidIdentifier(String value) {
        if (value == null || value.isBlank()) return false;
        if (value.length() > ScalarDbLimits.MAX_IDENTIFIER_LENGTH) return false;
        return IDENTIFIER.matcher(value).matches();
    }

    private static String sanitize(String s) {
        if (s == null) return "";
        String safe = s.replaceAll("[\r\n\t]", " ");
        return safe.length() > 80 ? safe.substring(0, 80) : safe;
    }

    private static void abortQuietly(DistributedTransaction tx) {
        if (tx != null) {
            try { tx.abort(); } catch (Exception ignored) { }
        }
    }
}

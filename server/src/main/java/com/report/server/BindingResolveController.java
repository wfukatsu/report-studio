package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.Principal;
import com.report.server.auth.RateLimiter;
import com.scalar.db.api.DistributedTransaction;
import com.scalar.db.api.DistributedTransactionAdmin;
import com.scalar.db.api.DistributedTransactionManager;
import com.scalar.db.api.Get;
import com.scalar.db.api.Result;
import com.scalar.db.api.Scan;
import com.scalar.db.api.TableMetadata;
import com.scalar.db.io.DataType;
import com.scalar.db.io.Key;
import com.scalar.db.service.TransactionFactory;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
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
public final class BindingResolveController {

    private static final Logger log = LoggerFactory.getLogger(BindingResolveController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** Same identifier regex as ScalarDbTableController — keep in sync. */
    private static final Pattern IDENTIFIER = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]*$");

    /** Structural limits — align with ScalarDbLimits and frontend */
    private static final int MAX_GROUPS = 10;
    private static final int MAX_FIELDS_PER_GROUP = 50;
    private static final int MAX_BODY_BYTES = 64 * 1024; // 64 KB
    /** Maximum rows returned per detail group Scan — prevents accidental large result sets. */
    private static final int MAX_DETAIL_ROWS = 500;

    /** System group ID for the product master — must match frontend constant */
    static final String SYSTEM_GROUP_PRODUCT_MASTER = "__productMaster__";

    private final TransactionFactory factory;
    private final JsonBlobRepository definitionsRepo;
    private final RateLimiter rateLimiter;
    private ProductController productCtrl;

    public BindingResolveController(TransactionFactory factory, JsonBlobRepository definitionsRepo) {
        this(factory, definitionsRepo, new RateLimiter(3, 10_000L));
    }

    /** Package-private constructor for testing. */
    BindingResolveController(TransactionFactory factory, JsonBlobRepository definitionsRepo, RateLimiter rateLimiter) {
        this.factory = factory;
        this.definitionsRepo = definitionsRepo;
        this.rateLimiter = rateLimiter;
        this.productCtrl = null; // injected lazily via setProductController
    }

    /** Injects the ProductController for __productMaster__ system group resolution. */
    public void setProductController(ProductController ctrl) {
        this.productCtrl = ctrl;
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
        if (!TemplateController.isOwner(ctx, storedOpt.get())) {
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

        // ── #144: named relations (for per-row lookup enrichment) ────────────
        JsonNode relationsNode = schemaNode.path("relations");
        // Report date drives product price resolution (same source as the product master group).
        java.time.LocalDate reportDate = parseReportDate(partitionKeysNode.path("__reportDate__").asText(null));

        // ── Per-group resolution ──────────────────────────────────────────────
        ObjectNode resolved = MAPPER.createObjectNode();
        ObjectNode errors = MAPPER.createObjectNode();

        for (JsonNode group : groupsNode) {
            String groupId = group.path("id").asText(null);
            if (groupId == null || groupId.isBlank()) {
                continue;
            }

            String role = group.path("role").asText("master");

            // ── System groups (product master etc.) bypass ScalarDB resolution ──
            if (SYSTEM_GROUP_PRODUCT_MASTER.equals(groupId)) {
                if (productCtrl != null) {
                    resolveProductMasterGroup(groupId, req, resolved, errors);
                } else {
                    errors.put(groupId, "Product master not available");
                }
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
            // Also collect Phase 3 computed fields: fieldKey → JEXL expression
            Map<String, String> colToFieldKey = new HashMap<>();
            List<Map.Entry<String, String>> computedFields = new ArrayList<>(); // (fieldKey, expression)
            boolean invalidField = false;
            for (JsonNode field : fieldsNode) {
                String fieldKey = field.path("key").asText(null);
                if (fieldKey == null) continue;

                // Phase 3: computed field — skip DB column validation
                boolean isComputed = field.path("computed").asBoolean(false);
                if (isComputed) {
                    String expr = field.path("expression").asText(null);
                    if (expr != null && !expr.isBlank()) {
                        computedFields.add(Map.entry(fieldKey, expr));
                    }
                    continue;
                }

                String dbCol = field.path("dbColumnName").asText(null);
                if (dbCol == null) continue; // non-computed field without dbColumnName — skip
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

            // ── ScalarDB resolution — route by role ─────────────────────────
            if ("detail".equals(role)) {
                // #144: collect lookup relations FROM this group TO the product master.
                List<JsonNode> lookupRelations = collectProductLookups(relationsNode, groupId);
                // Phase 2.5: Scan → array of rows
                resolveDetailGroup(
                        groupId, namespace, tableName, colToFieldKey, computedFields, pkNode,
                        MAX_DETAIL_ROWS, lookupRelations, reportDate, resolved, errors, correlationId, userId
                );
            } else {
                // Phase 2: Get → single row
                resolveGroup(
                        groupId, namespace, tableName, colToFieldKey, computedFields, pkNode,
                        resolved, errors, correlationId, userId
                );
            }
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

    // ── Product master resolution ─────────────────────────────────────────────

    /**
     * Resolves the {@code __productMaster__} system group.
     *
     * <p>Supported modes (from request body {@code partitionKeys.__productMaster__}):
     * <ul>
     *   <li>{@code mode=single} + {@code productCode} — returns a single product's fields</li>
     *   <li>{@code mode=list} (default) — returns an array of all active products</li>
     * </ul>
     *
     * <p>For single mode, {@code resolved["__productMaster__"]} is a flat object of
     * the product's fields. For list mode, it is an array of such objects.
     * Deleted or missing products return null fields (not an error) plus a
     * {@code "__stale__": true} marker.
     */
    private void resolveProductMasterGroup(
            String groupId,
            JsonNode req,
            ObjectNode resolved,
            ObjectNode errors) {

        JsonNode pkNode = req.path("partitionKeys").path(groupId);
        String mode = pkNode.path("mode").asText("list");
        String reportDateStr = req.path("partitionKeys").path("__reportDate__").asText(null);
        java.time.LocalDate reportDate = null;
        if (reportDateStr != null) {
            try { reportDate = java.time.LocalDate.parse(reportDateStr); } catch (Exception ignored) {}
        }

        if ("single".equals(mode)) {
            String productCode = pkNode.path("productCode").asText(null);
            if (productCode == null) {
                errors.put(groupId, "productCode is required for mode=single");
                return;
            }
            var productOpt = productCtrl.findByCode(productCode);
            if (productOpt.isEmpty()) {
                // Return stale marker so UI can show warning
                ObjectNode staleRow = MAPPER.createObjectNode();
                staleRow.put("__stale__", true);
                resolved.set(groupId, staleRow);
            } else {
                ObjectNode row = productNodeToRow(productOpt.get(), reportDate);
                resolved.set(groupId, row);
            }
        } else {
            // list mode — array of all active products
            var products = productCtrl.listActiveProducts();
            ArrayNode arr = MAPPER.createArrayNode();
            for (var product : products) {
                arr.add(productNodeToRow(product, reportDate));
            }
            resolved.set(groupId, arr);
        }
        errors.putNull(groupId);
    }

    // ── #144: per-row product lookup enrichment ───────────────────────────────

    /** Parse an optional ISO date string, tolerating null/garbage (returns null). */
    private static java.time.LocalDate parseReportDate(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return java.time.LocalDate.parse(s);
        } catch (Exception ignored) {
            return null;
        }
    }

    /**
     * Collect the lookup relations that enrich {@code groupId} from the product
     * master. Only {@code kind=lookup} relations with {@code from=groupId} and
     * {@code to=__productMaster__} qualify; each must carry an identifier
     * {@code name} and {@code on.fromColumn}. Returns an empty list otherwise.
     */
    private static List<JsonNode> collectProductLookups(JsonNode relationsNode, String groupId) {
        List<JsonNode> out = new ArrayList<>();
        if (relationsNode == null || !relationsNode.isArray()) return out;
        for (JsonNode rel : relationsNode) {
            if (!"lookup".equals(rel.path("kind").asText(null))) continue;
            if (!groupId.equals(rel.path("from").asText(null))) continue;
            if (!SYSTEM_GROUP_PRODUCT_MASTER.equals(rel.path("to").asText(null))) continue;
            String name = rel.path("name").asText(null);
            String fromColumn = rel.path("on").path("fromColumn").asText(null);
            if (!isValidIdentifier(name) || !isValidIdentifier(fromColumn)) continue;
            out.add(rel);
        }
        return out;
    }

    /**
     * Enrich a resolved detail row in place with product master fields for each
     * applicable lookup relation. The row's join value is read via the relation's
     * {@code on.fromColumn} (mapped to its fieldKey), looked up by product code,
     * and the product's fields are added under the {@code name_} prefix
     * (e.g. {@code product_name}). A missing product yields a {@code name_ _stale}
     * marker rather than an error, mirroring the product master group behaviour.
     */
    private void enrichRowWithProductLookups(
            ObjectNode rowNode,
            List<JsonNode> lookupRelations,
            Map<String, String> colToFieldKey,
            java.time.LocalDate reportDate) {

        if (lookupRelations == null || lookupRelations.isEmpty() || productCtrl == null) return;

        for (JsonNode rel : lookupRelations) {
            String name = rel.path("name").asText(null);
            String fromColumn = rel.path("on").path("fromColumn").asText(null);
            String joinFieldKey = colToFieldKey.get(fromColumn);
            if (joinFieldKey == null) continue; // the join column wasn't among the resolved fields

            JsonNode codeNode = rowNode.get(joinFieldKey);
            if (codeNode == null || codeNode.isNull()) continue;
            String code = codeNode.asText(null);
            if (code == null || code.isBlank()) continue;

            var productOpt = productCtrl.findByCode(code);
            if (productOpt.isEmpty()) {
                rowNode.put(name + "_" + "_stale", true);
                continue;
            }
            ObjectNode prow = productNodeToRow(productOpt.get(), reportDate);
            prow.fields().forEachRemaining(e -> rowNode.set(name + "_" + e.getKey(), e.getValue()));
        }
    }

    /** Converts a product JsonNode to a flat row object for resolve-bindings output. */
    private ObjectNode productNodeToRow(com.fasterxml.jackson.databind.JsonNode product,
                                        java.time.LocalDate reportDate) {
        ObjectNode row = MAPPER.createObjectNode();
        row.put("id", product.path("id").asText(""));
        row.put("code", product.path("code").asText(""));
        row.put("name", product.path("name").asText(""));
        row.put("unitPrice", ProductPriceResolver.resolvePrice(product, reportDate));
        row.put("category", product.path("category").asText(""));
        row.put("description", product.path("description").asText(""));
        row.put("stockCount", product.path("stockCount").asInt(0));
        row.put("taxType", product.path("taxType").asText("none"));
        row.put("unit", product.path("unit").asText(""));
        row.put("manufacturer", product.path("manufacturer").asText(""));
        // Custom fields — flatten into row
        com.fasterxml.jackson.databind.JsonNode customFields = product.path("customFields");
        if (customFields.isObject()) {
            customFields.fields().forEachRemaining(e -> row.set(e.getKey(), e.getValue()));
        }
        return row;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Phase 2.5: Scan a detail group table and return an ArrayNode of row objects.
     *
     * <p>Unlike the master-group {@link #resolveGroup} which uses {@code Get} and returns
     * a single {@code ObjectNode}, this method uses {@code Scan} with a partition key and
     * returns a JSON array. An empty scan result maps to an empty array (not an error).
     *
     * <p>Key difference from master Get: {@code tx.scan()} returns {@code List<Result>},
     * not {@code Optional<Result>}. An empty list means "no rows" — it is not an exception.
     */
    private void resolveDetailGroup(
            String groupId,
            String namespace,
            String tableName,
            Map<String, String> colToFieldKey,
            List<Map.Entry<String, String>> computedFields,
            JsonNode pkNode,
            int maxRows,
            List<JsonNode> lookupRelations,
            java.time.LocalDate reportDate,
            ObjectNode resolved,
            ObjectNode errors,
            String correlationId,
            String userId
    ) {
        DistributedTransactionManager mgr = factory.getTransactionManager();
        DistributedTransaction tx = null;

        try {
            // Fetch TableMetadata (Admin, try-with-resources — same as resolveGroup)
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

            // Build partition key (FK value — reuse same helper as master Get)
            Key partitionKey = buildPartitionKey(pkNode, meta);
            if (partitionKey == null) {
                errors.put(groupId, "Could not build partition key — check column types");
                return;
            }

            // ── Scan (not Get) — returns List<Result>, empty list = no rows ──
            Scan scan = Scan.newBuilder()
                    .namespace(namespace)
                    .table(tableName)
                    .partitionKey(partitionKey)
                    .limit(maxRows)
                    .build();

            tx = mgr.start();
            List<Result> rows = tx.scan(scan);
            tx.commit();

            // Build JSON array: [{ fieldKey: value, ... }, ...]
            // Empty scan returns empty array — this is NOT an error.
            ArrayNode arrayNode = MAPPER.createArrayNode();
            for (Result row : rows) {
                ObjectNode rowNode = MAPPER.createObjectNode();
                for (Map.Entry<String, String> entry : colToFieldKey.entrySet()) {
                    String colName = entry.getKey();
                    String fieldKey = entry.getValue();
                    if (!actualColumns.contains(colName)) continue;
                    if (row.isNull(colName)) {
                        rowNode.putNull(fieldKey);
                    } else {
                        putTypedValue(rowNode, fieldKey, colName, row, meta);
                    }
                }
                // #144: per-row product lookup enrichment (before computed fields so
                // a computed field may reference a looked-up value like product_unitPrice).
                enrichRowWithProductLookups(rowNode, lookupRelations, colToFieldKey, reportDate);
                // Phase 3: evaluate computed fields for this row
                evaluateComputedFields(rowNode, computedFields, correlationId);
                arrayNode.add(rowNode);
            }

            resolved.set(groupId, arrayNode);
            errors.putNull(groupId);

        } catch (Exception e) {
            abortQuietly(tx);
            // Never include e.getMessage() in response — may contain internal details
            log.warn("resolve-bindings detail groupId={} correlationId={} failed",
                    groupId, correlationId, e);
            errors.put(groupId, "Query failed");
        }
    }

    private void resolveGroup(
            String groupId,
            String namespace,
            String tableName,
            Map<String, String> colToFieldKey,
            List<Map.Entry<String, String>> computedFields,
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
            // Phase 3: evaluate computed fields after DB columns are resolved
            evaluateComputedFields(groupData, computedFields, correlationId);
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

    /**
     * Phase 3: evaluate computed fields against the resolved DB row data.
     * Uses the same {@link ExpressionEngine} as the calculation/validation system.
     * Errors are silently recorded as {@code null} — they do not stop other fields.
     */
    private void evaluateComputedFields(
            ObjectNode rowData,
            List<Map.Entry<String, String>> computedFields,
            String correlationId
    ) {
        if (computedFields == null || computedFields.isEmpty()) return;
        // Convert current row data to Map<String, Object> for ExpressionEngine context
        Map<String, Object> context = CalculationEngine.formDataToMap(rowData);

        for (Map.Entry<String, String> cf : computedFields) {
            String fieldKey = cf.getKey();
            String expression = cf.getValue();
            try {
                Object result = ExpressionEngine.calculate(expression, context);
                if (result == null) {
                    rowData.putNull(fieldKey);
                    context.put(fieldKey, null);
                } else if (result instanceof Number n) {
                    rowData.put(fieldKey, n.doubleValue());
                    context.put(fieldKey, n.doubleValue());
                } else if (result instanceof Boolean b) {
                    rowData.put(fieldKey, b);
                    context.put(fieldKey, b);
                } else {
                    rowData.put(fieldKey, result.toString());
                    context.put(fieldKey, result.toString());
                }
            } catch (Exception e) {
                log.warn("Computed field evaluation failed fieldKey={} expr={} correlationId={}",
                        fieldKey, sanitize(expression), correlationId);
                rowData.putNull(fieldKey);
                context.put(fieldKey, null);
            }
        }
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

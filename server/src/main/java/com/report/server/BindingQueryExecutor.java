package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.scalar.db.api.Get;
import com.scalar.db.api.Result;
import com.scalar.db.api.Scan;
import com.scalar.db.api.TableMetadata;
import com.scalar.db.io.DataType;
import com.scalar.db.io.Key;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Executes the ScalarDB reads for the resolve-bindings pipeline: master groups via {@code Get}
 * (single row), detail groups via {@code Scan} (row array), typed key/value mapping against {@link
 * TableMetadata}, and Phase 3 computed-field evaluation. Package-private collaborator of {@link
 * BindingResolveController} (#418) — request validation, authorization, and response shaping stay
 * in the controller.
 */
final class BindingQueryExecutor {

    private static final Logger log = LoggerFactory.getLogger(BindingQueryExecutor.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final ScalarDbGateway gateway;
    private final ProductMasterResolver productMaster;

    BindingQueryExecutor(ScalarDbGateway gateway, ProductMasterResolver productMaster) {
        this.gateway = gateway;
        this.productMaster = productMaster;
    }

    /**
     * Phase 2.5: Scan a detail group table and return an ArrayNode of row objects.
     *
     * <p>Unlike the master-group {@link #resolveGroup} which uses {@code Get} and returns a single
     * {@code ObjectNode}, this method uses {@code Scan} with a partition key and returns a JSON
     * array. An empty scan result maps to an empty array (not an error).
     *
     * <p>Key difference from master Get: {@code tx.scan()} returns {@code List<Result>}, not {@code
     * Optional<Result>}. An empty list means "no rows" — it is not an exception.
     */
    void resolveDetailGroup(
            String groupId,
            String namespace,
            String tableName,
            Map<String, String> colToFieldKey,
            List<Map.Entry<String, String>> computedFields,
            JsonNode pkNode,
            int maxRows,
            List<JsonNode> lookupRelations,
            LocalDate reportDate,
            ObjectNode resolved,
            ObjectNode errors,
            String correlationId,
            String userId) {
        try {
            // Fetch TableMetadata (uncached — same freshness semantics as before #421)
            TableMetadata meta = gateway.getTableMetadata(namespace, tableName);

            // TOCTOU guard: table may have been dropped since schema was saved
            if (meta == null) {
                errors.put(groupId, "Schema table was removed since binding; please re-bind");
                log.info(
                        "AUDIT op=resolve_bindings user={} groupId={} outcome=schema_removed correlationId={}",
                        userId,
                        groupId,
                        correlationId);
                return;
            }

            // Validate all requested dbColumnNames against actual table schema
            Set<String> actualColumns = new HashSet<>(meta.getColumnNames());
            for (String dbCol : colToFieldKey.keySet()) {
                if (!actualColumns.contains(dbCol)) {
                    errors.put(
                            groupId,
                            "Column not found in table: "
                                    + BindingResolveController.sanitize(dbCol));
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
            Scan scan =
                    Scan.newBuilder()
                            .namespace(namespace)
                            .table(tableName)
                            .partitionKey(partitionKey)
                            .limit(maxRows)
                            .build();

            List<Result> rows = gateway.inTransaction(tx -> tx.scan(scan));

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
                productMaster.enrichRowWithProductLookups(
                        rowNode, lookupRelations, colToFieldKey, reportDate);
                // Phase 3: evaluate computed fields for this row
                evaluateComputedFields(rowNode, computedFields, correlationId);
                arrayNode.add(rowNode);
            }

            resolved.set(groupId, arrayNode);
            errors.putNull(groupId);

        } catch (Exception e) {
            // Never include e.getMessage() in response — may contain internal details
            log.warn(
                    "resolve-bindings detail groupId={} correlationId={} failed",
                    groupId,
                    correlationId,
                    e);
            errors.put(groupId, "Query failed");
        }
    }

    /** Phase 2: resolve a master group via {@code Get} — a single row keyed by partition key. */
    void resolveGroup(
            String groupId,
            String namespace,
            String tableName,
            Map<String, String> colToFieldKey,
            List<Map.Entry<String, String>> computedFields,
            JsonNode pkNode,
            ObjectNode resolved,
            ObjectNode errors,
            String correlationId,
            String userId) {
        try {
            // Fetch TableMetadata first (uncached — same freshness semantics as before #421)
            TableMetadata meta = gateway.getTableMetadata(namespace, tableName);

            // TOCTOU guard: table may have been dropped since schema was saved
            if (meta == null) {
                errors.put(groupId, "Schema table was removed since binding; please re-bind");
                log.info(
                        "AUDIT op=resolve_bindings user={} groupId={} outcome=schema_removed correlationId={}",
                        userId,
                        groupId,
                        correlationId);
                return;
            }

            // Validate all requested dbColumnNames against actual table schema
            Set<String> actualColumns = new HashSet<>(meta.getColumnNames());
            for (String dbCol : colToFieldKey.keySet()) {
                if (!actualColumns.contains(dbCol)) {
                    errors.put(
                            groupId,
                            "Column not found in table: "
                                    + BindingResolveController.sanitize(dbCol));
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
            Get get =
                    Get.newBuilder()
                            .namespace(namespace)
                            .table(tableName)
                            .partitionKey(partitionKey)
                            .build();
            Optional<Result> resultOpt = gateway.inTransaction(tx -> tx.get(get));

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
            // Never include e.getMessage() in the response — it may contain internal details
            log.warn(
                    "resolve-bindings groupId={} correlationId={} failed",
                    groupId,
                    correlationId,
                    e);
            errors.put(groupId, "Query failed");
        }
    }

    /**
     * Build a ScalarDB {@link Key} from the partition key values in the request. Uses the {@link
     * TableMetadata} to select the correct typed {@code Key.of*} method. Returns {@code null} if
     * construction fails (type mismatch, missing column, etc.).
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
            Key.Builder builder = Key.newBuilder();
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
            Key.Builder builder, String col, String rawValue, DataType dt) {
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
     * Phase 3: evaluate computed fields against the resolved DB row data. Uses the same {@link
     * ExpressionEngine} as the calculation/validation system. Errors are silently recorded as
     * {@code null} — they do not stop other fields.
     */
    private void evaluateComputedFields(
            ObjectNode rowData,
            List<Map.Entry<String, String>> computedFields,
            String correlationId) {
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
                log.warn(
                        "Computed field evaluation failed fieldKey={} expr={} correlationId={}",
                        fieldKey,
                        BindingResolveController.sanitize(expression),
                        correlationId);
                rowData.putNull(fieldKey);
                context.put(fieldKey, null);
            }
        }
    }
}

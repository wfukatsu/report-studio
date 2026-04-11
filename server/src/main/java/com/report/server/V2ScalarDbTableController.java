package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.scalar.db.api.DistributedTransactionAdmin;
import com.scalar.db.api.TableMetadata;
import com.scalar.db.exception.storage.ExecutionException;
import com.scalar.db.exception.storage.RetriableExecutionException;
import com.scalar.db.io.DataType;
import com.scalar.db.service.TransactionFactory;
import io.javalin.http.Context;
import io.javalin.http.ForbiddenResponse;
import io.javalin.http.InternalServerErrorResponse;
import io.javalin.http.ServiceUnavailableResponse;
import io.javalin.http.UnauthorizedResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * POST /api/v2/scalardb/tables
 *
 * <p>Creates a new ScalarDB table from the request body and returns the
 * resulting table metadata. Used by Phase 1.5's inline {@code CreateTableForm}
 * to let users go from "schema group defined" to "bound to a real ScalarDB
 * table" without leaving the designer.
 *
 * <p>Request body (JSON):
 * <pre>{@code
 * {
 *   "namespace": "app",
 *   "tableName": "users",
 *   "columns": [
 *     { "name": "id",   "type": "BIGINT" },
 *     { "name": "name", "type": "TEXT"   }
 *   ],
 *   "partitionKeys":   ["id"],
 *   "clusteringKeys":  [],
 *   "secondaryIndexes": []
 * }
 * }</pre>
 *
 * <p>Success response (201):
 * <pre>{@code
 * { "name": "users", "columns": [{ "name": "id", "type": "BIGINT", "keyType": "partition" }, ...] }
 * }</pre>
 *
 * <p>Error bodies are English (matching all existing v2 controllers). Japanese
 * strings live only in the React UI layer.
 *
 * <p>No raw {@code e.getMessage()} is included in public error bodies. Each
 * exception path generates a correlation ID, logs the full exception server-side,
 * and returns only the generic message + {@code "correlationId"} to the client.
 */
public final class V2ScalarDbTableController {

    private static final Logger log = LoggerFactory.getLogger(V2ScalarDbTableController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** Identifier regex — ASCII only, must start with letter or underscore. */
    private static final Pattern IDENTIFIER = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]*$");

    /** Maximum request body size (1 MB). Matches V2SchemaInferController. */
    private static final int MAX_BODY_BYTES = 1_048_576;

    private final TransactionFactory factory;

    public V2ScalarDbTableController(TransactionFactory factory) {
        this.factory = factory;
    }

    /** {@code POST /api/v2/scalardb/tables} */
    public void createTable(Context ctx) {
        // ── Parse body ────────────────────────────────────────────────────────
        String bodyStr = ctx.body();
        if (bodyStr == null || bodyStr.isBlank()) {
            ctx.status(400).json(Map.of("error", "Request body is required"));
            return;
        }
        if (bodyStr.length() > MAX_BODY_BYTES) {
            ctx.status(413).json(Map.of("error", "Request body too large (max 1 MB)"));
            return;
        }

        JsonNode req;
        try {
            req = MAPPER.readTree(bodyStr);
        } catch (Exception e) {
            ctx.status(400).json(Map.of("error", "Invalid JSON body"));
            return;
        }

        // ── Extract + validate scalar fields ─────────────────────────────────
        String namespace = req.path("namespace").asText(null);
        String tableName = req.path("tableName").asText(null);

        if (namespace == null || namespace.isBlank()) {
            ctx.status(400).json(Map.of("error", "Field 'namespace' is required"));
            return;
        }
        if (tableName == null || tableName.isBlank()) {
            ctx.status(400).json(Map.of("error", "Field 'tableName' is required"));
            return;
        }
        if (!IDENTIFIER.matcher(namespace).matches()) {
            ctx.status(400).json(Map.of("error", "Invalid identifier: '" + namespace + "'"));
            return;
        }
        if (!IDENTIFIER.matcher(tableName).matches()) {
            ctx.status(400).json(Map.of("error", "Invalid identifier: '" + tableName + "'"));
            return;
        }

        // ── Validate arrays ───────────────────────────────────────────────────
        if (!req.path("columns").isArray()) {
            ctx.status(400).json(Map.of("error", "Field 'columns' must be an array of objects"));
            return;
        }

        JsonNode columnsNode = req.path("columns");
        if (columnsNode.size() > ScalarDbLimits.MAX_COLUMNS_PER_TABLE) {
            ctx.status(400).json(Map.of(
                "error", "Too many columns (max " + ScalarDbLimits.MAX_COLUMNS_PER_TABLE + ")"));
            return;
        }

        // Parse columns
        List<ColumnDef> columns = new ArrayList<>(columnsNode.size());
        Set<String> columnNameSet = new HashSet<>();
        for (JsonNode col : columnsNode) {
            String name = col.path("name").asText(null);
            String type = col.path("type").asText(null);
            if (name == null || name.isBlank()) {
                ctx.status(400).json(Map.of("error", "Each column must have a 'name' field"));
                return;
            }
            if (!IDENTIFIER.matcher(name).matches()) {
                ctx.status(400).json(Map.of("error", "Invalid identifier: '" + name + "'"));
                return;
            }
            if (!columnNameSet.add(name)) {
                ctx.status(400).json(Map.of("error", "Duplicate column name: '" + name + "'"));
                return;
            }
            DataType dataType = parseDataType(type);
            if (dataType == null) {
                ctx.status(400).json(Map.of("error",
                    "Invalid column type: '" + type + "'. Must be one of BOOLEAN, INT, BIGINT, FLOAT, DOUBLE, TEXT, BLOB"));
                return;
            }
            columns.add(new ColumnDef(name, dataType));
        }

        // Parse key lists
        List<String> partitionKeys = parseStringList(req.path("partitionKeys"));
        List<String> clusteringKeys = parseStringList(req.path("clusteringKeys"));
        List<String> secondaryIndexes = parseStringList(req.path("secondaryIndexes"));

        if (partitionKeys == null) {
            ctx.status(400).json(Map.of("error", "Field 'partitionKeys' must be an array"));
            return;
        }
        if (clusteringKeys == null) {
            ctx.status(400).json(Map.of("error", "Field 'clusteringKeys' must be an array"));
            return;
        }
        if (secondaryIndexes == null) {
            ctx.status(400).json(Map.of("error", "Field 'secondaryIndexes' must be an array"));
            return;
        }

        // Length caps for key lists
        if (partitionKeys.size() > ScalarDbLimits.MAX_PARTITION_KEYS) {
            ctx.status(400).json(Map.of(
                "error", "Too many partition keys (max " + ScalarDbLimits.MAX_PARTITION_KEYS + ")"));
            return;
        }
        if (clusteringKeys.size() > ScalarDbLimits.MAX_CLUSTERING_KEYS) {
            ctx.status(400).json(Map.of(
                "error", "Too many clustering keys (max " + ScalarDbLimits.MAX_CLUSTERING_KEYS + ")"));
            return;
        }
        if (secondaryIndexes.size() > ScalarDbLimits.MAX_SECONDARY_INDEXES) {
            ctx.status(400).json(Map.of(
                "error", "Too many secondary indexes (max " + ScalarDbLimits.MAX_SECONDARY_INDEXES + ")"));
            return;
        }

        // At least one partition key
        if (partitionKeys.isEmpty()) {
            ctx.status(400).json(Map.of("error", "At least one partition key is required"));
            return;
        }

        // Duplicate checks in key lists
        if (hasDuplicates(partitionKeys)) {
            ctx.status(400).json(Map.of("error", "Duplicate key column: '" + findFirstDuplicate(partitionKeys) + "'"));
            return;
        }
        if (hasDuplicates(clusteringKeys)) {
            ctx.status(400).json(Map.of("error", "Duplicate key column: '" + findFirstDuplicate(clusteringKeys) + "'"));
            return;
        }
        if (hasDuplicates(secondaryIndexes)) {
            ctx.status(400).json(Map.of("error", "Duplicate key column: '" + findFirstDuplicate(secondaryIndexes) + "'"));
            return;
        }

        // Key columns must exist in the columns list
        for (String pk : partitionKeys) {
            if (!columnNameSet.contains(pk)) {
                ctx.status(400).json(Map.of("error", "Key column '" + pk + "' not found in columns list"));
                return;
            }
        }
        for (String ck : clusteringKeys) {
            if (!columnNameSet.contains(ck)) {
                ctx.status(400).json(Map.of("error", "Key column '" + ck + "' not found in columns list"));
                return;
            }
        }
        for (String idx : secondaryIndexes) {
            if (!columnNameSet.contains(idx)) {
                ctx.status(400).json(Map.of("error", "Key column '" + idx + "' not found in columns list"));
                return;
            }
        }

        // ── Create the table ──────────────────────────────────────────────────
        String correlationId = CorrelationId.generate();
        String userId = "unknown"; // Authorization deferred to Phase 2

        try (DistributedTransactionAdmin admin = factory.getTransactionAdmin()) {
            // Idempotency guard — return 409 instead of letting ScalarDB throw
            if (admin.tableExists(namespace, tableName)) {
                AuditLog.op("create_table", userId, namespace, tableName, "conflict", correlationId);
                ctx.status(409).json(Map.of(
                    "error", "Table already exists: " + namespace + "." + tableName));
                return;
            }

            // Auto-create namespace if absent
            if (!admin.namespaceExists(namespace)) {
                admin.createNamespace(namespace);
            }

            // Build TableMetadata
            TableMetadata.Builder builder = TableMetadata.newBuilder();
            for (ColumnDef col : columns) {
                builder.addColumn(col.name, col.type);
            }
            for (String pk : partitionKeys) {
                builder.addPartitionKey(pk);
            }
            for (String ck : clusteringKeys) {
                builder.addClusteringKey(ck);
            }
            for (String idx : secondaryIndexes) {
                builder.addSecondaryIndex(idx);
            }
            TableMetadata metadata = builder.build();

            admin.createTable(namespace, tableName, metadata);

            // Re-read to confirm round-trip (returns reality on disk)
            TableMetadata created = admin.getTableMetadata(namespace, tableName);
            Map<String, Object> response = buildTableResponse(tableName, created);

            AuditLog.op("create_table", userId, namespace, tableName, "created", correlationId);
            ctx.status(201).json(response);

        } catch (RetriableExecutionException e) {
            log.warn("AUDIT op=create_table user={} ns={} table={} outcome=unreachable correlationId={} error={}",
                userId, namespace, tableName, correlationId, e.getMessage());
            throw new ServiceUnavailableResponse("ScalarDb unreachable");

        } catch (ExecutionException e) {
            if (e.isAuthenticationError()) {
                log.warn("AUDIT op=create_table user={} ns={} table={} outcome=auth_failed correlationId={} error={}",
                    userId, namespace, tableName, correlationId, e.getMessage());
                throw new UnauthorizedResponse("ScalarDb authentication failed");
            }
            if (e.isAuthorizationError() || e.isSuperuserRequired()) {
                log.warn("AUDIT op=create_table user={} ns={} table={} outcome=authz_denied correlationId={} error={}",
                    userId, namespace, tableName, correlationId, e.getMessage());
                throw new ForbiddenResponse("ScalarDb permission denied");
            }

            // TOCTOU recovery: concurrent create may have won the race
            try (DistributedTransactionAdmin adminCheck = factory.getTransactionAdmin()) {
                if (adminCheck.tableExists(namespace, tableName)) {
                    AuditLog.op("create_table", userId, namespace, tableName, "conflict", correlationId);
                    ctx.status(409).json(Map.of(
                        "error", "Table already exists: " + namespace + "." + tableName));
                    return;
                }
            } catch (Exception checkEx) {
                log.warn("TOCTOU re-check failed correlationId={}", correlationId, checkEx);
            }

            log.warn("AUDIT op=create_table user={} ns={} table={} outcome=ddl_rejected correlationId={} error={}",
                userId, namespace, tableName, correlationId, e.getMessage());
            throw new InternalServerErrorResponse("ScalarDb DDL rejected");
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static Map<String, Object> buildTableResponse(String tableName, TableMetadata meta) {
        Set<String> partitionKeys = meta.getPartitionKeyNames();
        Set<String> clusteringKeys = meta.getClusteringKeyNames();
        Set<String> indexColumns = meta.getSecondaryIndexNames();

        List<Map<String, Object>> columns = new ArrayList<>();
        for (String col : meta.getColumnNames()) {
            Map<String, Object> colMap = new LinkedHashMap<>();
            colMap.put("name", col);
            colMap.put("type", meta.getColumnDataType(col).name());
            String keyType = classifyKeyType(col, partitionKeys, clusteringKeys, indexColumns);
            if (keyType != null) colMap.put("keyType", keyType);
            columns.add(colMap);
        }
        return Map.of("name", tableName, "columns", columns);
    }

    private static String classifyKeyType(
            String col,
            Set<String> partitionKeys,
            Set<String> clusteringKeys,
            Set<String> indexColumns) {
        if (partitionKeys.contains(col)) return "partition";
        if (clusteringKeys.contains(col)) return "clustering";
        if (indexColumns.contains(col)) return "index";
        return null;
    }

    private static DataType parseDataType(String type) {
        if (type == null) return null;
        try {
            return DataType.valueOf(type);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static List<String> parseStringList(JsonNode node) {
        if (!node.isArray()) return null;
        List<String> list = new ArrayList<>(node.size());
        for (JsonNode item : node) {
            list.add(item.asText());
        }
        return list;
    }

    private static boolean hasDuplicates(List<String> list) {
        return list.size() != new HashSet<>(list).size();
    }

    private static String findFirstDuplicate(List<String> list) {
        Set<String> seen = new HashSet<>();
        for (String item : list) {
            if (!seen.add(item)) return item;
        }
        return "";
    }

    private record ColumnDef(String name, DataType type) {}
}

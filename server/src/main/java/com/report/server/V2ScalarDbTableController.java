package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.scalar.db.api.DistributedTransactionAdmin;
import com.scalar.db.api.TableMetadata;
import com.scalar.db.exception.storage.ExecutionException;
import com.scalar.db.exception.storage.RetriableExecutionException;
import com.scalar.db.io.DataType;
import com.scalar.db.service.TransactionFactory;
import com.report.server.auth.Principal;
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

    /**
     * {@code POST /api/v2/scalardb/tables}
     *
     * <p><b>Side-effect caveat:</b> If the target namespace does not exist, this method
     * auto-creates it before calling {@code createTable}. The namespace creation is NOT
     * atomic with the table creation. If {@code createTable} subsequently fails (DDL
     * rejection, auth error, etc.), the empty namespace persists on disk. Empty namespaces
     * are invisible to {@code getNamespaceNames()} (which only lists populated namespaces),
     * so the user will not see a phantom entry in the catalog, but the namespace exists and
     * cannot be cleaned up from the designer UI. Operators can remove it via the ScalarDB CLI:
     * {@code scalardb admin drop-namespace <namespace>}.
     *
     * <p>Phase 2 may address this by adding a namespace cleanup step in the exception handler
     * or by removing the auto-create and requiring the namespace to exist beforehand.
     */
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
        if (namespace.length() > ScalarDbLimits.MAX_IDENTIFIER_LENGTH) {
            ctx.status(400).json(Map.of("error",
                "Identifier too long (max " + ScalarDbLimits.MAX_IDENTIFIER_LENGTH + " chars): '" + namespace.substring(0, Math.min(namespace.length(), 20)) + "...'"));
            return;
        }
        if (!IDENTIFIER.matcher(namespace).matches()) {
            ctx.status(400).json(Map.of("error", "Invalid identifier: '" + namespace + "'"));
            return;
        }
        if (tableName.length() > ScalarDbLimits.MAX_IDENTIFIER_LENGTH) {
            ctx.status(400).json(Map.of("error",
                "Identifier too long (max " + ScalarDbLimits.MAX_IDENTIFIER_LENGTH + " chars): '" + tableName.substring(0, Math.min(tableName.length(), 20)) + "...'"));
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
            if (name.length() > ScalarDbLimits.MAX_IDENTIFIER_LENGTH) {
                ctx.status(400).json(Map.of("error",
                    "Identifier too long (max " + ScalarDbLimits.MAX_IDENTIFIER_LENGTH + " chars): '" + name.substring(0, Math.min(name.length(), 20)) + "...'"));
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

        // Validate key list items as identifiers. Technically rejectUnknownKeys below
        // would also catch non-identifier strings (they won't be in columnNameSet), but
        // calling rejectInvalidIdentifiers first produces a more specific error message:
        // "Invalid identifier: 'bad-name'" is clearer to the user than
        // "Key column 'bad-name' not found in columns list".
        if (rejectInvalidIdentifiers(partitionKeys, ctx)) return;
        if (rejectInvalidIdentifiers(clusteringKeys, ctx)) return;
        if (rejectInvalidIdentifiers(secondaryIndexes, ctx)) return;

        // At least one partition key
        if (partitionKeys.isEmpty()) {
            ctx.status(400).json(Map.of("error", "At least one partition key is required"));
            return;
        }

        if (rejectDuplicateKeys(partitionKeys, ctx)) return;
        if (rejectDuplicateKeys(clusteringKeys, ctx)) return;
        if (rejectDuplicateKeys(secondaryIndexes, ctx)) return;

        if (rejectUnknownKeys(partitionKeys, columnNameSet, ctx)) return;
        if (rejectUnknownKeys(clusteringKeys, columnNameSet, ctx)) return;
        if (rejectUnknownKeys(secondaryIndexes, columnNameSet, ctx)) return;

        // ── Create the table ──────────────────────────────────────────────────
        String correlationId = CorrelationId.generate();
        // Extract identity for audit logging. Authorization policy is deferred to Phase 2
        // (any authenticated principal may create tables for now), but we record who did it.
        // Use instanceof pattern to guard against a wrong-type attribute — if auth middleware
        // is misconfigured or replaced, this falls through to "unknown" rather than throwing.
        Object attr = ctx.attribute("principal");
        String userId = (attr instanceof Principal p) ? p.userId() : "unknown";

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
            Map<String, Object> response = buildTableResponse(namespace, tableName, created);

            AuditLog.op("create_table", userId, namespace, tableName, "created", correlationId);
            ctx.status(201).json(response);

        } catch (RetriableExecutionException e) {
            AuditLog.op("create_table", userId, namespace, tableName, "unreachable", correlationId);
            log.warn("ScalarDb unreachable correlationId={}", correlationId, e);
            throw new ServiceUnavailableResponse("ScalarDb unreachable");

        } catch (ExecutionException e) {
            if (e.isAuthenticationError()) {
                AuditLog.op("create_table", userId, namespace, tableName, "auth_failed", correlationId);
                log.warn("ScalarDb auth failed correlationId={}", correlationId, e);
                throw new UnauthorizedResponse("ScalarDb authentication failed");
            }
            if (e.isAuthorizationError() || e.isSuperuserRequired()) {
                AuditLog.op("create_table", userId, namespace, tableName, "authz_denied", correlationId);
                log.warn("ScalarDb authz denied correlationId={}", correlationId, e);
                throw new ForbiddenResponse("ScalarDb permission denied");
            }

            // TOCTOU recovery: Java try-with-resources closes `admin` before any catch block
            // runs, so a new admin connection is required here. The inner catch handles the
            // edge case where the re-check itself fails (resource exhaustion etc.).
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

            AuditLog.op("create_table", userId, namespace, tableName, "ddl_rejected", correlationId);
            log.warn("ScalarDb DDL rejected correlationId={}", correlationId, e);
            throw new InternalServerErrorResponse("ScalarDb DDL rejected");
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static Map<String, Object> buildTableResponse(
            String namespace, String tableName, TableMetadata meta) {
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
        // Include namespace in the response so callers (especially agents) have a
        // self-contained payload without needing to reconstruct it from the request.
        return Map.of("namespace", namespace, "name", tableName, "columns", columns);
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

    /**
     * Returns true and writes a 400 response if any entry fails the IDENTIFIER regex
     * or exceeds {@link ScalarDbLimits#MAX_IDENTIFIER_LENGTH}.
     */
    private static boolean rejectInvalidIdentifiers(List<String> keys, Context ctx) {
        for (String k : keys) {
            if (k.length() > ScalarDbLimits.MAX_IDENTIFIER_LENGTH) {
                ctx.status(400).json(Map.of("error",
                    "Identifier too long (max " + ScalarDbLimits.MAX_IDENTIFIER_LENGTH + " chars): '" + k.substring(0, Math.min(k.length(), 20)) + "...'"));
                return true;
            }
            if (!IDENTIFIER.matcher(k).matches()) {
                ctx.status(400).json(Map.of("error", "Invalid identifier: '" + k + "'"));
                return true;
            }
        }
        return false;
    }

    /**
     * Returns true and writes a 400 response if the list contains duplicate entries.
     * Single-pass detection — finds the first duplicate inline without a second traversal.
     */
    private static boolean rejectDuplicateKeys(List<String> keys, Context ctx) {
        Set<String> seen = new HashSet<>();
        for (String k : keys) {
            if (!seen.add(k)) {
                ctx.status(400).json(Map.of("error", "Duplicate key column: '" + k + "'"));
                return true;
            }
        }
        return false;
    }

    /** Returns true and writes a 400 response if any entry is not in the column set. */
    private static boolean rejectUnknownKeys(List<String> keys, Set<String> columns, Context ctx) {
        for (String k : keys) {
            if (!columns.contains(k)) {
                ctx.status(400).json(Map.of("error", "Key column '" + k + "' not found in columns list"));
                return true;
            }
        }
        return false;
    }

    private record ColumnDef(String name, DataType type) {}
}

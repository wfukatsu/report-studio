package com.report.server;

import com.scalar.db.api.DistributedTransactionAdmin;
import com.scalar.db.api.TableMetadata;
import com.scalar.db.service.TransactionFactory;
import io.javalin.http.Context;
import io.javalin.http.ServiceUnavailableResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * GET /api/v2/scalardb/catalog
 *
 * <p>Returns the complete ScalarDB catalog the frontend needs in order to let a user
 * bind a {@code SchemaGroup} to an existing table. The response is a single nested
 * structure (one round-trip) shaped as:
 *
 * <pre>{@code
 * {
 *   "namespaces": [
 *     {
 *       "name": "app",
 *       "tables": [
 *         {
 *           "name": "users",
 *           "columns": [
 *             { "name": "id",    "type": "BIGINT",    "keyType": "partition"  },
 *             { "name": "ts",    "type": "TIMESTAMP", "keyType": "clustering" },
 *             { "name": "email", "type": "TEXT",      "keyType": "index"      },
 *             { "name": "age",   "type": "INT"                                }
 *           ]
 *         }
 *       ]
 *     }
 *   ]
 * }
 * }</pre>
 *
 * <p><b>Plain columns omit {@code keyType} entirely</b> — the frontend Zod schema
 * treats an absent {@code keyType} as "regular column", keeping the union semantically
 * clean (no {@code 'column'} sentinel value).
 *
 * <p><b>Caveat carried forward from ScalarDB 3.14:</b> {@code getNamespaceNames()}
 * returns only namespaces that contain at least one table. Empty namespaces are
 * invisible here; the frontend surfaces this with a specific empty-state copy.
 *
 * <p>Failures of the underlying ScalarDB admin API are mapped to HTTP 503
 * ({@link ServiceUnavailableResponse}) because from the client's perspective a catalog
 * listing failure always means "ScalarDB is unreachable" — there is no 400-class
 * input this endpoint can reject (it takes no body and no path params).
 */
public final class V2ScalarDbCatalogController {

    private static final Logger log = LoggerFactory.getLogger(V2ScalarDbCatalogController.class);

    private final TransactionFactory factory;

    public V2ScalarDbCatalogController(TransactionFactory factory) {
        this.factory = factory;
    }

    /** {@code GET /api/v2/scalardb/catalog} */
    public void getCatalog(Context ctx) {
        try (DistributedTransactionAdmin admin = factory.getTransactionAdmin()) {
            List<Map<String, Object>> namespaces = new ArrayList<>();

            for (String namespace : admin.getNamespaceNames()) {
                Set<String> tableNames = admin.getNamespaceTableNames(namespace);
                List<Map<String, Object>> tables = new ArrayList<>(tableNames.size());

                for (String tableName : tableNames) {
                    TableMetadata meta = admin.getTableMetadata(namespace, tableName);
                    tables.add(Map.of(
                            "name", tableName,
                            "columns", buildColumns(meta)
                    ));
                }

                namespaces.add(Map.of(
                        "name", namespace,
                        "tables", tables
                ));
            }

            ctx.json(Map.of("namespaces", namespaces));
            log.debug("ScalarDb catalog served: {} namespace(s)", namespaces.size());
        } catch (Exception e) {
            log.warn("ScalarDb catalog listing failed", e);
            throw new ServiceUnavailableResponse(
                    "ScalarDb unreachable: " + e.getMessage());
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static List<Map<String, Object>> buildColumns(TableMetadata meta) {
        Set<String> partitionKeys = meta.getPartitionKeyNames();
        Set<String> clusteringKeys = meta.getClusteringKeyNames();
        Set<String> indexColumns = meta.getSecondaryIndexNames();

        List<Map<String, Object>> columns = new ArrayList<>();
        for (String columnName : meta.getColumnNames()) {
            // LinkedHashMap (not Map.of) because we conditionally add keyType —
            // Map.of disallows null values and would force us to choose a sentinel.
            Map<String, Object> column = new LinkedHashMap<>();
            column.put("name", columnName);
            column.put("type", meta.getColumnDataType(columnName).name());

            String keyType = classifyKeyType(columnName, partitionKeys, clusteringKeys, indexColumns);
            if (keyType != null) {
                column.put("keyType", keyType);
            }
            columns.add(column);
        }
        return columns;
    }

    /**
     * Returns the ScalarDb key-role name for a column, or {@code null} if the column
     * has no key role (a regular column). The client encodes "no key role" as an
     * absent {@code keyType} field, not a {@code 'column'} sentinel.
     */
    private static String classifyKeyType(
            String columnName,
            Set<String> partitionKeys,
            Set<String> clusteringKeys,
            Set<String> indexColumns) {
        if (partitionKeys.contains(columnName)) return "partition";
        if (clusteringKeys.contains(columnName)) return "clustering";
        if (indexColumns.contains(columnName)) return "index";
        return null;
    }
}

package com.report.server;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.RateLimiter;
import com.scalar.db.api.DistributedTransaction;
import com.scalar.db.api.DistributedTransactionAdmin;
import com.scalar.db.api.DistributedTransactionManager;
import com.scalar.db.api.Result;
import com.scalar.db.api.Scan;
import com.scalar.db.api.TableMetadata;
import com.scalar.db.io.DataType;
import com.scalar.db.service.TransactionFactory;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import io.javalin.http.ServiceUnavailableResponse;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * GET /api/v2/scalardb/tables/{ns}/{table}/rows
 *
 * <p>Full-table scan for the data browser. Returns a paginated slice of rows from a ScalarDB table
 * together with column metadata. This endpoint is intentionally <em>read-only</em> and
 * <em>unauthenticated-friendly</em> (any authenticated user may call it — data isolation is at the
 * application layer, not per-user row filtering).
 *
 * <p>Query parameters:
 *
 * <ul>
 *   <li>{@code offset} — 0-based row skip (default 0)
 *   <li>{@code limit} — rows to return, max {@value #PAGE_LIMIT} (default 50)
 * </ul>
 *
 * <p>Response shape:
 *
 * <pre>{@code
 * {
 *   "columns": [{"name":"id","type":"TEXT","keyType":"partition"}, ...],
 *   "rows":    [{"id":"abc", ...}, ...],
 *   "total":   1234,          // rows scanned (capped at MAX_SCAN_ROWS)
 *   "truncated": false,       // true when table has > MAX_SCAN_ROWS rows
 *   "offset":  0,
 *   "limit":   50
 * }
 * }</pre>
 *
 * <p><b>Column mapping is name-based, never positional.</b> (see
 * docs/solutions/integration-issues/scalardb-column-ordering-positional-binding-mismatch.md)
 */
public final class ScalarDbScanController {

    private static final Logger log = LoggerFactory.getLogger(ScalarDbScanController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    static final int MAX_SCAN_ROWS = 10_000;
    static final int PAGE_LIMIT = 50;

    private final TransactionFactory factory;
    private final DistributedTransactionManager manager;
    private final RateLimiter rateLimiter;

    /** Production constructor: 20 scans per minute per user. */
    public ScalarDbScanController(
            TransactionFactory factory, DistributedTransactionManager manager) {
        this(factory, manager, new RateLimiter(20, 60_000L));
    }

    /** Package-private for testing with custom rate limiter. */
    ScalarDbScanController(
            TransactionFactory factory,
            DistributedTransactionManager manager,
            RateLimiter rateLimiter) {
        this.factory = factory;
        this.manager = manager;
        this.rateLimiter = rateLimiter;
    }

    /** {@code GET /api/v2/scalardb/tables/{ns}/{table}/rows} */
    public void scanRows(Context ctx) {
        // Auth guard
        com.report.server.auth.Principal principal = ctx.attribute("principal");
        if (principal == null || principal.isAnonymous()) {
            ApiError.respond(
                    ctx, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Authentication required");
            return;
        }

        // Rate limiting: 20 req/min per user
        String userId = principal.userId();
        if (!rateLimiter.isAllowed(userId)) {
            ApiError.respond(ctx, 429, "RATE_LIMITED", "Too many requests");
            return;
        }

        // Validate path parameters
        String namespace = ctx.pathParam("ns");
        String tableName = ctx.pathParam("table");
        if (!isValidIdentifier(namespace) || !isValidIdentifier(tableName)) {
            ApiError.respond(
                    ctx,
                    HttpStatus.BAD_REQUEST,
                    "VALIDATION_ERROR",
                    "Invalid namespace or table name");
            return;
        }

        // Namespace protection: system namespaces (users, api_tokens, webhooks,
        // form_responses, ScalarDB bookkeeping) are never exposed through the
        // generic table browser — see SystemNamespaces. Mirrors the write-side
        // guard in ScalarDbRowController so read and write cannot drift.
        if (SystemNamespaces.isProtected(namespace)) {
            log.warn(
                    "ScalarDB scan blocked on protected namespace ns={} table={} user={}",
                    namespace,
                    tableName,
                    userId);
            ApiError.respond(
                    ctx,
                    HttpStatus.FORBIDDEN,
                    "FORBIDDEN",
                    "Access to this namespace is not allowed");
            return;
        }

        // Parse pagination params
        int offset = parseIntParam(ctx.queryParam("offset"), 0, 0, MAX_SCAN_ROWS);
        int limit = parseIntParam(ctx.queryParam("limit"), PAGE_LIMIT, 1, PAGE_LIMIT);

        DistributedTransactionManager mgr = manager;
        DistributedTransaction tx = null;
        try {
            // Fetch table metadata (name-based column mapping — never positional)
            TableMetadata meta;
            try (DistributedTransactionAdmin admin = factory.getTransactionAdmin()) {
                meta = admin.getTableMetadata(namespace, tableName);
            }
            if (meta == null) {
                ApiError.respond(
                        ctx,
                        HttpStatus.NOT_FOUND,
                        "NOT_FOUND",
                        "Table not found: " + namespace + "." + tableName);
                return;
            }

            // Optimized scan: fetch only (offset + limit) rows, not the full 10k table.
            // This bounds heap usage to O(offset + limit) rather than O(MAX_SCAN_ROWS).
            // We fetch one extra row to detect truncation at the MAX_SCAN_ROWS boundary.
            int fetchCount = Math.min(offset + limit + 1, MAX_SCAN_ROWS + 1);
            Scan scan =
                    Scan.newBuilder()
                            .namespace(namespace)
                            .table(tableName)
                            .all()
                            .limit(fetchCount)
                            .build();

            tx = mgr.start();
            List<Result> fetched = tx.scan(scan);
            tx.commit();
            tx = null;

            // Detect truncation: if we reached the overall MAX_SCAN_ROWS boundary
            boolean truncated =
                    (fetchCount >= MAX_SCAN_ROWS + 1) && (fetched.size() >= MAX_SCAN_ROWS + 1);
            int total = Math.min(fetched.size(), MAX_SCAN_ROWS);

            // Apply pagination in Java
            int fromIdx = Math.min(offset, total);
            int toIdx = Math.min(fromIdx + limit, total);
            List<Result> pageRows = fetched.subList(fromIdx, toIdx);

            // Build column metadata (name-based — order from TableMetadata)
            ArrayNode columnsNode = buildColumnMetadata(meta);

            // Build rows — match by column name, never by position
            ArrayNode rowsNode = MAPPER.createArrayNode();
            for (Result row : pageRows) {
                ObjectNode rowObj = MAPPER.createObjectNode();
                for (String colName : meta.getColumnNames()) {
                    if (row.isNull(colName)) {
                        rowObj.putNull(colName);
                    } else {
                        putTypedValue(rowObj, colName, colName, row, meta);
                    }
                }
                rowsNode.add(rowObj);
            }

            ObjectNode response = MAPPER.createObjectNode();
            response.set("columns", columnsNode);
            response.set("rows", rowsNode);
            response.put("total", total);
            response.put("truncated", truncated);
            response.put("offset", fromIdx);
            response.put("limit", limit);

            ctx.contentType("application/json");
            ctx.result(MAPPER.writeValueAsString(response));
            log.debug(
                    "ScalarDB scan ns={} table={} total={} offset={} limit={}",
                    namespace,
                    tableName,
                    total,
                    fromIdx,
                    limit);

        } catch (Exception e) {
            abortQuietly(tx);
            log.warn("ScalarDB scan failed ns={} table={}", namespace, tableName, e);
            throw new ServiceUnavailableResponse("ScalarDB unreachable or scan failed");
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static ArrayNode buildColumnMetadata(TableMetadata meta) {
        java.util.Set<String> partitionKeys = meta.getPartitionKeyNames();
        java.util.Set<String> clusteringKeys = meta.getClusteringKeyNames();
        java.util.Set<String> indexColumns = meta.getSecondaryIndexNames();

        ArrayNode columns = MAPPER.createArrayNode();
        for (String colName : meta.getColumnNames()) {
            // LinkedHashMap: conditionally add keyType (Map.of disallows null)
            Map<String, Object> col = new LinkedHashMap<>();
            col.put("name", colName);
            col.put("type", meta.getColumnDataType(colName).name());
            String keyType = classifyKeyType(colName, partitionKeys, clusteringKeys, indexColumns);
            if (keyType != null) col.put("keyType", keyType);
            columns.addPOJO(col);
        }
        return columns;
    }

    private static String classifyKeyType(
            String col,
            java.util.Set<String> partitionKeys,
            java.util.Set<String> clusteringKeys,
            java.util.Set<String> indexColumns) {
        if (partitionKeys.contains(col)) return "partition";
        if (clusteringKeys.contains(col)) return "clustering";
        if (indexColumns.contains(col)) return "index";
        return null;
    }

    /** Name-based typed value insertion — never positional. */
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

    private static boolean isValidIdentifier(String s) {
        return s != null && s.matches("^[a-zA-Z_][a-zA-Z0-9_]*$");
    }

    private static int parseIntParam(String raw, int defaultVal, int min, int max) {
        if (raw == null || raw.isBlank()) return defaultVal;
        try {
            return Math.min(max, Math.max(min, Integer.parseInt(raw)));
        } catch (NumberFormatException e) {
            return defaultVal;
        }
    }

    private static void abortQuietly(DistributedTransaction tx) {
        if (tx == null) return;
        try {
            tx.abort();
        } catch (Exception ignored) {
        }
    }
}

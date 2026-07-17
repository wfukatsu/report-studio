package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.scalar.db.api.Delete;
import com.scalar.db.api.DistributedTransaction;
import com.scalar.db.api.DistributedTransactionAdmin;
import com.scalar.db.api.DistributedTransactionManager;
import com.scalar.db.api.Put;
import com.scalar.db.api.TableMetadata;
import com.scalar.db.exception.storage.ExecutionException;
import com.scalar.db.api.Get;
import com.scalar.db.exception.transaction.CommitConflictException;
import com.scalar.db.exception.transaction.TransactionException;
import com.scalar.db.io.DataType;
import com.scalar.db.io.Key;
import com.scalar.db.service.TransactionFactory;
import com.report.server.auth.Principal;
import com.report.server.auth.RateLimiter;
import io.javalin.http.Context;
import io.javalin.http.InternalServerErrorResponse;
import io.javalin.http.ServiceUnavailableResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * Row-level CRUD operations for ScalarDB tables.
 *
 * <ul>
 *   <li>POST   /api/v2/scalardb/tables/{ns}/{table}/rows — insert</li>
 *   <li>PUT    /api/v2/scalardb/tables/{ns}/{table}/rows — upsert (partial update)</li>
 *   <li>DELETE /api/v2/scalardb/tables/{ns}/{table}/rows — physical delete</li>
 * </ul>
 *
 * <p>System namespaces ({@code report_studio}, {@code scalardb}, {@code coordinator})
 * are write-protected — requests targeting them receive 403.
 *
 * <p><b>Missing-row semantics (intentional asymmetry):</b>
 * <ul>
 *   <li>{@code PUT} (update) reads before writing and returns <b>404</b> when the target
 *       row does not exist — an update is only meaningful against an existing row.</li>
 *   <li>{@code DELETE} is <b>idempotent</b>: it returns <b>204</b> whether or not the row
 *       existed. ScalarDB's {@code delete} does not require a prior read, and idempotent
 *       delete is standard REST semantics (repeating the call converges to the same state).</li>
 * </ul>
 * This asymmetry is deliberate; callers must not infer prior existence from a 204.
 */
public final class V2ScalarDbRowController {

    private static final Logger log = LoggerFactory.getLogger(V2ScalarDbRowController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Pattern IDENTIFIER = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]*$");
    private static final int MAX_BODY_BYTES = 65_536; // 64 KB
    private static final int MAX_IDENTIFIER_LENGTH = 64;

    /** Namespaces that reject write operations. */
    private static final Set<String> PROTECTED_NAMESPACES = Set.of(
        "report_studio", "scalardb", "coordinator"
    );

    private final TransactionFactory factory;
    private final RateLimiter rateLimiter;
    private static final long METADATA_CACHE_TTL_MS = 5 * 60 * 1000L; // 5 minutes

    private record CachedMeta(TableMetadata meta, long cachedAt) {}
    private final ConcurrentHashMap<String, CachedMeta> metadataCache = new ConcurrentHashMap<>();

    public V2ScalarDbRowController(TransactionFactory factory) {
        this(factory, new RateLimiter(60, 60_000L));
    }

    V2ScalarDbRowController(TransactionFactory factory, RateLimiter rateLimiter) {
        this.factory = factory;
        this.rateLimiter = rateLimiter;
    }

    // ── POST — insert row ───────────────────────────────────────────────────

    public void insertRow(Context ctx) {
        doUpsert(ctx, "insert_row", 201, false);
    }

    public void updateRow(Context ctx) {
        doUpsert(ctx, "update_row", 200, true);
    }

    /**
     * Shared insert/update logic. When {@code requireExists} is true (update),
     * the row must already exist — otherwise 404 is returned.
     */
    private void doUpsert(Context ctx, String opName, int successStatus, boolean requireExists) {
        String correlationId = CorrelationId.generate();
        RequestContext rc = validateRequest(ctx, correlationId);
        if (rc == null) return;

        JsonNode values = rc.body.path("values");
        if (!values.isObject() || values.isEmpty()) {
            ctx.status(400).json(errorResponse("Request must include a non-empty 'values' object", correlationId));
            return;
        }

        TableMetadata meta = rc.meta;
        LinkedHashSet<String> partitionKeys = new LinkedHashSet<>(meta.getPartitionKeyNames());
        LinkedHashSet<String> clusteringKeys = new LinkedHashSet<>(meta.getClusteringKeyNames());

        for (String pk : partitionKeys) {
            if (values.path(pk).isMissingNode() || values.path(pk).isNull()) {
                ctx.status(400).json(errorResponse("Missing required partition key", correlationId));
                return;
            }
        }
        for (String ck : clusteringKeys) {
            if (values.path(ck).isMissingNode() || values.path(ck).isNull()) {
                ctx.status(400).json(errorResponse("Missing required clustering key", correlationId));
                return;
            }
        }

        Iterator<String> fieldNames = values.fieldNames();
        while (fieldNames.hasNext()) {
            String col = fieldNames.next();
            if (!meta.getColumnNames().contains(col)) {
                ctx.status(400).json(errorResponse("Invalid request", correlationId));
                log.warn("{} rejected: unknown column '{}' in {}.{} correlationId={}",
                    opName, col, rc.namespace, rc.table, correlationId);
                return;
            }
        }

        Key partitionKey = buildKey(values, partitionKeys, meta);
        Key clusteringKey = clusteringKeys.isEmpty() ? null : buildKey(values, clusteringKeys, meta);
        Set<String> allKeys = new LinkedHashSet<>(partitionKeys);
        allKeys.addAll(clusteringKeys);
        Put put = buildPutWithValues(rc.namespace, rc.table, partitionKey, clusteringKey, values, allKeys, meta);

        DistributedTransactionManager mgr = factory.getTransactionManager();
        DistributedTransaction tx = null;
        try {
            tx = mgr.start();

            // For update: verify the row exists first
            if (requireExists) {
                var getBuilder = Get.newBuilder()
                    .namespace(rc.namespace)
                    .table(rc.table)
                    .partitionKey(partitionKey);
                if (clusteringKey != null) getBuilder.clusteringKey(clusteringKey);
                if (tx.get(getBuilder.build()).isEmpty()) {
                    tx.abort();
                    AuditLog.op(opName, rc.userId, rc.namespace, rc.table, "not_found", correlationId);
                    ctx.status(404).json(errorResponse("Row not found", correlationId));
                    return;
                }
            }

            tx.put(put);
            tx.commit();
            tx = null;

            String outcome = requireExists ? "updated" : "created";
            AuditLog.op(opName, rc.userId, rc.namespace, rc.table, outcome, correlationId);

            ObjectNode row = MAPPER.createObjectNode();
            Iterator<Map.Entry<String, JsonNode>> it = values.fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> entry = it.next();
                row.set(entry.getKey(), entry.getValue().deepCopy());
            }
            ctx.status(successStatus).json(Map.of("row", row));

        } catch (CommitConflictException e) {
            abortQuietly(tx);
            AuditLog.op(opName, rc.userId, rc.namespace, rc.table, "conflict", correlationId);
            ctx.status(409).json(errorResponse("Conflict: row was modified concurrently", correlationId));
        } catch (TransactionException e) {
            abortQuietly(tx);
            AuditLog.op(opName, rc.userId, rc.namespace, rc.table, "unreachable", correlationId);
            throw new ServiceUnavailableResponse();
        } catch (Exception e) {
            abortQuietly(tx);
            AuditLog.op(opName, rc.userId, rc.namespace, rc.table, "error", correlationId);
            log.error("{} failed ns={} table={} correlationId={}", opName, rc.namespace, rc.table, correlationId, e);
            throw new InternalServerErrorResponse();
        }
    }

    // ── DELETE — physical delete ────────────────────────────────────────────

    /**
     * Idempotent delete: returns 204 regardless of whether the row existed
     * (see class Javadoc for the deliberate update/delete asymmetry).
     */
    public void deleteRow(Context ctx) {
        String correlationId = CorrelationId.generate();
        RequestContext rc = validateRequest(ctx, correlationId);
        if (rc == null) return;

        JsonNode keys = rc.body.path("keys");
        if (!keys.isObject() || keys.isEmpty()) {
            ctx.status(400).json(errorResponse("Request must include a non-empty 'keys' object", correlationId));
            return;
        }

        TableMetadata meta = rc.meta;
        LinkedHashSet<String> partitionKeys = new LinkedHashSet<>(meta.getPartitionKeyNames());
        LinkedHashSet<String> clusteringKeys = new LinkedHashSet<>(meta.getClusteringKeyNames());

        for (String pk : partitionKeys) {
            if (keys.path(pk).isMissingNode() || keys.path(pk).isNull()) {
                ctx.status(400).json(errorResponse("Missing required partition key", correlationId));
                return;
            }
        }
        for (String ck : clusteringKeys) {
            if (keys.path(ck).isMissingNode() || keys.path(ck).isNull()) {
                ctx.status(400).json(errorResponse("Missing required clustering key", correlationId));
                return;
            }
        }

        var delBuilder = Delete.newBuilder()
            .namespace(rc.namespace)
            .table(rc.table)
            .partitionKey(buildKey(keys, partitionKeys, meta));

        if (!clusteringKeys.isEmpty()) {
            delBuilder.clusteringKey(buildKey(keys, clusteringKeys, meta));
        }

        DistributedTransactionManager mgr = factory.getTransactionManager();
        DistributedTransaction tx = null;
        try {
            tx = mgr.start();
            tx.delete(delBuilder.build());
            tx.commit();
            tx = null;

            AuditLog.op("delete_row", rc.userId, rc.namespace, rc.table, "deleted", correlationId);
            ctx.status(204);

        } catch (CommitConflictException e) {
            abortQuietly(tx);
            AuditLog.op("delete_row", rc.userId, rc.namespace, rc.table, "conflict", correlationId);
            ctx.status(409).json(errorResponse("Conflict: row was modified concurrently", correlationId));
        } catch (TransactionException e) {
            abortQuietly(tx);
            AuditLog.op("delete_row", rc.userId, rc.namespace, rc.table, "unreachable", correlationId);
            throw new ServiceUnavailableResponse();
        } catch (Exception e) {
            abortQuietly(tx);
            AuditLog.op("delete_row", rc.userId, rc.namespace, rc.table, "error", correlationId);
            log.error("DELETE failed ns={} table={} correlationId={}", rc.namespace, rc.table, correlationId, e);
            throw new InternalServerErrorResponse();
        }
    }

    // ── Cache management ────────────────────────────────────────────────────

    /** Invalidate cached metadata for a table. Call after createTable. */
    public void invalidateMetadataCache(String namespace, String table) {
        metadataCache.remove(namespace + "." + table);
    }

    /** Remove all expired entries from the cache. */
    void cleanExpiredCache() {
        long now = System.currentTimeMillis();
        metadataCache.entrySet().removeIf(e -> now - e.getValue().cachedAt >= METADATA_CACHE_TTL_MS);
    }

    // ── Shared validation ───────────────────────────────────────────────────

    private record RequestContext(
        String namespace, String table, String userId,
        JsonNode body, TableMetadata meta
    ) {}

    /**
     * Common validation for all three endpoints.
     * Returns null if the request was rejected (response already sent).
     */
    private RequestContext validateRequest(Context ctx, String correlationId) {
        // Auth
        Object attr = ctx.attribute("principal");
        if (attr == null || (attr instanceof Principal p && p.isAnonymous())) {
            ctx.status(401).json(errorResponse("Authentication required", correlationId));
            return null;
        }
        String userId = (attr instanceof Principal p) ? p.userId() : "unknown";

        // Rate limit
        if (!rateLimiter.isAllowed(userId)) {
            ctx.status(429).json(errorResponse("Rate limit exceeded", correlationId));
            return null;
        }

        // Path params
        String namespace = ctx.pathParam("ns");
        String table = ctx.pathParam("table");

        if (!isValidIdentifier(namespace) || !isValidIdentifier(table)) {
            ctx.status(400).json(errorResponse("Invalid namespace or table name", correlationId));
            return null;
        }

        // Namespace protection
        if (PROTECTED_NAMESPACES.contains(namespace)) {
            AuditLog.op("row_write_blocked", userId, namespace, table, "forbidden", correlationId);
            ctx.status(403).json(errorResponse("Write operations are not allowed on this namespace", correlationId));
            return null;
        }

        // Body
        String body = ctx.body();
        if (body == null || body.isBlank()) {
            ctx.status(400).json(errorResponse("Request body is required", correlationId));
            return null;
        }
        if (body.length() > MAX_BODY_BYTES) {
            ctx.status(400).json(errorResponse("Request body exceeds size limit", correlationId));
            return null;
        }

        JsonNode parsed;
        try {
            parsed = MAPPER.readTree(body);
        } catch (Exception e) {
            ctx.status(400).json(errorResponse("Invalid JSON", correlationId));
            return null;
        }

        // Table metadata
        TableMetadata meta;
        try {
            meta = getCachedMetadata(namespace, table);
        } catch (ExecutionException e) {
            log.error("Failed to retrieve table metadata ns={} table={} correlationId={}",
                namespace, table, correlationId, e);
            throw new ServiceUnavailableResponse();
        }
        if (meta == null) {
            ctx.status(404).json(errorResponse("Table not found", correlationId));
            return null;
        }

        return new RequestContext(namespace, table, userId, parsed, meta);
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private TableMetadata getCachedMetadata(String namespace, String table) throws ExecutionException {
        String key = namespace + "." + table;
        CachedMeta cached = metadataCache.get(key);
        if (cached != null && System.currentTimeMillis() - cached.cachedAt < METADATA_CACHE_TTL_MS) {
            return cached.meta;
        }

        try (DistributedTransactionAdmin admin = factory.getTransactionAdmin()) {
            TableMetadata meta = admin.getTableMetadata(namespace, table);
            if (meta != null) metadataCache.put(key, new CachedMeta(meta, System.currentTimeMillis()));
            return meta;
        }
    }

    private static Key buildKey(JsonNode values, LinkedHashSet<String> keyColumns, TableMetadata meta) {
        if (keyColumns.size() == 1) {
            String col = keyColumns.iterator().next();
            return buildSingleKey(col, values.get(col), meta.getColumnDataType(col));
        }
        Key.Builder builder = Key.newBuilder();
        for (String col : keyColumns) {
            addToKeyBuilder(builder, col, values.get(col), meta.getColumnDataType(col));
        }
        return builder.build();
    }

    private static Key buildSingleKey(String col, JsonNode value, DataType dt) {
        return switch (dt) {
            case INT     -> Key.ofInt(col, value.asInt());
            case BIGINT  -> Key.ofBigInt(col, value.asLong());
            case FLOAT   -> Key.ofFloat(col, (float) value.asDouble());
            case DOUBLE  -> Key.ofDouble(col, value.asDouble());
            case BOOLEAN -> Key.ofBoolean(col, value.asBoolean());
            default      -> Key.ofText(col, value.asText());
        };
    }

    private static void addToKeyBuilder(Key.Builder builder, String col, JsonNode value, DataType dt) {
        switch (dt) {
            case INT     -> builder.addInt(col, value.asInt());
            case BIGINT  -> builder.addBigInt(col, value.asLong());
            case FLOAT   -> builder.addFloat(col, (float) value.asDouble());
            case DOUBLE  -> builder.addDouble(col, value.asDouble());
            case BOOLEAN -> builder.addBoolean(col, value.asBoolean());
            default      -> builder.addText(col, value.asText());
        }
    }

    /** Build a Put with typed non-key column values from the JSON body. */
    private static Put buildPutWithValues(
        String ns, String table, Key partitionKey, Key clusteringKey,
        JsonNode values, Set<String> keyColumns, TableMetadata meta
    ) {
        var builder = Put.newBuilder()
            .namespace(ns)
            .table(table)
            .partitionKey(partitionKey);
        if (clusteringKey != null) {
            builder.clusteringKey(clusteringKey);
        }
        Iterator<String> cols = values.fieldNames();
        while (cols.hasNext()) {
            String col = cols.next();
            if (keyColumns.contains(col)) continue;
            JsonNode value = values.get(col);
            if (value == null || value.isNull()) continue;
            DataType dt = meta.getColumnDataType(col);
            switch (dt) {
                case INT     -> builder.intValue(col, value.asInt());
                case BIGINT  -> builder.bigIntValue(col, value.asLong());
                case FLOAT   -> builder.floatValue(col, (float) value.asDouble());
                case DOUBLE  -> builder.doubleValue(col, value.asDouble());
                case BOOLEAN -> builder.booleanValue(col, value.asBoolean());
                default      -> builder.textValue(col, value.asText());
            }
        }
        return builder.build();
    }

    private static boolean isValidIdentifier(String s) {
        return s != null && s.length() <= MAX_IDENTIFIER_LENGTH && IDENTIFIER.matcher(s).matches();
    }

    private static Map<String, String> errorResponse(String message, String correlationId) {
        return Map.of("error", message, "correlationId", correlationId);
    }

    private static void abortQuietly(DistributedTransaction tx) {
        if (tx != null) {
            try { tx.abort(); } catch (Exception ignored) { }
        }
    }
}

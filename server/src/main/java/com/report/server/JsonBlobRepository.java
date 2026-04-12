package com.report.server;

import com.scalar.db.api.DistributedTransaction;
import com.scalar.db.api.DistributedTransactionAdmin;
import com.scalar.db.api.DistributedTransactionManager;
import com.scalar.db.api.Get;
import com.scalar.db.api.Delete;
import com.scalar.db.api.Put;
import com.scalar.db.api.Result;
import com.scalar.db.api.Scan;
import com.scalar.db.api.TableMetadata;
import com.scalar.db.io.DataType;
import com.scalar.db.io.Key;
import com.scalar.db.service.TransactionFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Generic ScalarDB-backed JSON blob repository.
 * Each table stores: id (TEXT PK) + json_data (TEXT) + updated_at (BIGINT).
 */
public final class JsonBlobRepository {

    private static final Logger log = LoggerFactory.getLogger(JsonBlobRepository.class);

    static final String COL_ID = "id";
    static final String COL_JSON = "json_data";
    static final String COL_UPDATED_AT = "updated_at";
    static final String COL_GROUP_KEY = "group_key";

    private final TransactionFactory factory;
    private final String namespace;
    private final String table;

    public JsonBlobRepository(TransactionFactory factory, String namespace, String table) {
        this.factory = factory;
        this.namespace = namespace;
        this.table = table;
    }

    /** Create namespace and table if they don't exist. */
    public void ensureTable() {
        try (DistributedTransactionAdmin admin = factory.getTransactionAdmin()) {
            if (!admin.namespaceExists(namespace)) {
                admin.createNamespace(namespace);
                log.info("Created namespace: {}", namespace);
            }
            if (!admin.tableExists(namespace, table)) {
                TableMetadata metadata = TableMetadata.newBuilder()
                        .addColumn(COL_ID, DataType.TEXT)
                        .addColumn(COL_JSON, DataType.TEXT)
                        .addColumn(COL_UPDATED_AT, DataType.BIGINT)
                        .addColumn(COL_GROUP_KEY, DataType.TEXT)
                        .addPartitionKey(COL_ID)
                        .addSecondaryIndex(COL_GROUP_KEY)
                        .build();
                admin.createTable(namespace, table, metadata);
                log.info("Created table: {}.{}", namespace, table);
            }
        } catch (Exception e) {
            throw new IllegalStateException("Failed to ensure table " + namespace + "." + table, e);
        }
    }

    /** Get JSON by id. Returns empty if not found. */
    public Optional<String> get(String id) {
        DistributedTransactionManager mgr = factory.getTransactionManager();
        DistributedTransaction tx = null;
        try {
            tx = mgr.start();
            Get get = Get.newBuilder()
                    .namespace(namespace)
                    .table(table)
                    .partitionKey(Key.ofText(COL_ID, id))
                    .build();
            Optional<Result> result = tx.get(get);
            tx.commit();
            return result.map(r -> r.getText(COL_JSON));
        } catch (Exception e) {
            abortQuietly(tx);
            throw new RepositoryException("Failed to get " + table + "/" + id, e);
        }
    }

    /** Upsert JSON by id. */
    public void put(String id, String json) {
        DistributedTransactionManager mgr = factory.getTransactionManager();
        DistributedTransaction tx = null;
        try {
            tx = mgr.start();
            Put put = Put.newBuilder()
                    .namespace(namespace)
                    .table(table)
                    .partitionKey(Key.ofText(COL_ID, id))
                    .textValue(COL_JSON, json)
                    .bigIntValue(COL_UPDATED_AT, System.currentTimeMillis())
                    .enableImplicitPreRead()
                    .build();
            tx.put(put);
            tx.commit();
        } catch (Exception e) {
            abortQuietly(tx);
            throw new RepositoryException("Failed to put " + table + "/" + id, e);
        }
    }

    /** Upsert JSON by id with a group key for indexed lookups. */
    public void put(String id, String json, String groupKey) {
        DistributedTransactionManager mgr = factory.getTransactionManager();
        DistributedTransaction tx = null;
        try {
            tx = mgr.start();
            Put put = Put.newBuilder()
                    .namespace(namespace)
                    .table(table)
                    .partitionKey(Key.ofText(COL_ID, id))
                    .textValue(COL_JSON, json)
                    .textValue(COL_GROUP_KEY, groupKey)
                    .bigIntValue(COL_UPDATED_AT, System.currentTimeMillis())
                    .enableImplicitPreRead()
                    .build();
            tx.put(put);
            tx.commit();
        } catch (Exception e) {
            abortQuietly(tx);
            throw new RepositoryException("Failed to put " + table + "/" + id, e);
        }
    }

    /** List JSON blobs filtered by group key (uses secondary index). */
    public List<String> listByGroupKey(String groupKey) {
        DistributedTransactionManager mgr = factory.getTransactionManager();
        DistributedTransaction tx = null;
        try {
            tx = mgr.start();
            Scan scan = Scan.newBuilder()
                    .namespace(namespace)
                    .table(table)
                    .indexKey(Key.ofText(COL_GROUP_KEY, groupKey))
                    .build();
            List<Result> results = tx.scan(scan);
            tx.commit();
            List<String> jsonList = new ArrayList<>();
            for (Result r : results) {
                jsonList.add(r.getText(COL_JSON));
            }
            return jsonList;
        } catch (Exception e) {
            abortQuietly(tx);
            throw new RepositoryException("Failed to list " + table + " by group key " + groupKey, e);
        }
    }

    /** List all JSON blobs in the table. */
    public List<String> list() {
        DistributedTransactionManager mgr = factory.getTransactionManager();
        DistributedTransaction tx = null;
        try {
            tx = mgr.start();
            Scan scan = Scan.newBuilder()
                    .namespace(namespace)
                    .table(table)
                    .all()
                    .build();
            List<Result> results = tx.scan(scan);
            tx.commit();
            List<String> jsonList = new ArrayList<>();
            for (Result r : results) {
                jsonList.add(r.getText(COL_JSON));
            }
            return jsonList;
        } catch (Exception e) {
            abortQuietly(tx);
            throw new RepositoryException("Failed to list " + table, e);
        }
    }

    /** Delete entry by id. Silently succeeds if not found. */
    public void delete(String id) {
        DistributedTransactionManager mgr = factory.getTransactionManager();
        DistributedTransaction tx = null;
        try {
            tx = mgr.start();
            Delete del = Delete.newBuilder()
                    .namespace(namespace)
                    .table(table)
                    .partitionKey(Key.ofText(COL_ID, id))
                    .build();
            tx.delete(del);
            tx.commit();
            log.info("Deleted {}/{}", table, id);
        } catch (Exception e) {
            abortQuietly(tx);
            log.warn("Failed to delete {}/{}: {}", table, id, e.getMessage());
        }
    }

    // ── Transaction-aware methods for atomic read-then-write ──────────────────

    /** Expose factory for callers that need to manage their own transaction lifecycle. */
    public DistributedTransactionManager getTransactionManager() {
        return factory.getTransactionManager();
    }

    /** Read within an existing transaction (does NOT commit). */
    public Optional<String> getWithinTx(DistributedTransaction tx, String id) throws Exception {
        Get get = Get.newBuilder()
                .namespace(namespace)
                .table(table)
                .partitionKey(Key.ofText(COL_ID, id))
                .build();
        Optional<Result> result = tx.get(get);
        return result.map(r -> r.getText(COL_JSON));
    }

    /** Write within an existing transaction (does NOT commit). */
    public void putWithinTx(DistributedTransaction tx, String id, String json) throws Exception {
        Put put = Put.newBuilder()
                .namespace(namespace)
                .table(table)
                .partitionKey(Key.ofText(COL_ID, id))
                .textValue(COL_JSON, json)
                .bigIntValue(COL_UPDATED_AT, System.currentTimeMillis())
                .enableImplicitPreRead()
                .build();
        tx.put(put);
    }

    private static void abortQuietly(DistributedTransaction tx) {
        if (tx != null) {
            try { tx.abort(); } catch (Exception ignored) { }
        }
    }

    public static final class RepositoryException extends RuntimeException {
        public RepositoryException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}

package com.report.server;

import com.scalar.db.api.*;
import com.scalar.db.io.DataType;
import com.scalar.db.io.Key;
import com.scalar.db.service.TransactionFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

/**
 * ScalarDB-backed version history for template projections.
 *
 * Table schema: template_id (PK) + version_id (CK) + json_data + label + created_at + is_auto
 * Uses group_key secondary index on template_id for listing versions.
 */
public final class VersionRepository {

    private static final Logger log = LoggerFactory.getLogger(VersionRepository.class);

    private static final String NAMESPACE = "report_studio";
    private static final String TABLE = "template_versions";

    private static final String COL_ID = "version_id";
    private static final String COL_TEMPLATE_ID = "template_id";
    private static final String COL_JSON = "json_data";
    private static final String COL_LABEL = "label";
    private static final String COL_CREATED_AT = "created_at";
    private static final String COL_IS_AUTO = "is_auto";

    private static final int MAX_AUTO_VERSIONS = 30;
    private static final int MAX_MANUAL_VERSIONS = 20;
    private static final long AUTO_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

    private final TransactionFactory factory;

    public VersionRepository(TransactionFactory factory) {
        this.factory = factory;
    }

    /** Create table if it doesn't exist. */
    public void ensureTable() {
        try (DistributedTransactionAdmin admin = factory.getTransactionAdmin()) {
            if (!admin.tableExists(NAMESPACE, TABLE)) {
                TableMetadata metadata = TableMetadata.newBuilder()
                        .addColumn(COL_ID, DataType.TEXT)
                        .addColumn(COL_TEMPLATE_ID, DataType.TEXT)
                        .addColumn(COL_JSON, DataType.TEXT)
                        .addColumn(COL_LABEL, DataType.TEXT)
                        .addColumn(COL_CREATED_AT, DataType.BIGINT)
                        .addColumn(COL_IS_AUTO, DataType.BOOLEAN)
                        .addPartitionKey(COL_ID)
                        .addSecondaryIndex(COL_TEMPLATE_ID)
                        .build();
                admin.createTable(NAMESPACE, TABLE, metadata);
                log.info("Created table: {}.{}", NAMESPACE, TABLE);
            }
        } catch (Exception e) {
            throw new IllegalStateException("Failed to ensure table " + NAMESPACE + "." + TABLE, e);
        }
    }

    public record VersionMeta(String versionId, String templateId, String label, long createdAt, boolean isAuto) {}

    /** Create a new version snapshot. Returns the version ID. */
    public String createVersion(String templateId, String json, String label, boolean isAuto) {
        String versionId = "ver-" + System.currentTimeMillis() + "-" + UUID.randomUUID().toString().substring(0, 8);
        DistributedTransactionManager mgr = factory.getTransactionManager();
        DistributedTransaction tx = null;
        try {
            tx = mgr.start();
            Put put = Put.newBuilder()
                    .namespace(NAMESPACE)
                    .table(TABLE)
                    .partitionKey(Key.ofText(COL_ID, versionId))
                    .textValue(COL_TEMPLATE_ID, templateId)
                    .textValue(COL_JSON, json)
                    .textValue(COL_LABEL, label != null ? label : "")
                    .bigIntValue(COL_CREATED_AT, System.currentTimeMillis())
                    .booleanValue(COL_IS_AUTO, isAuto)
                    .build();
            tx.put(put);
            tx.commit();
            log.info("Created {} version {} for template {}", isAuto ? "auto" : "manual", versionId, templateId);
            return versionId;
        } catch (Exception e) {
            abortQuietly(tx);
            throw new JsonBlobRepository.RepositoryException("Failed to create version for " + templateId, e);
        }
    }

    /** List versions for a template, sorted by createdAt descending. */
    public List<VersionMeta> listVersions(String templateId) {
        DistributedTransactionManager mgr = factory.getTransactionManager();
        DistributedTransaction tx = null;
        try {
            tx = mgr.start();
            Scan scan = Scan.newBuilder()
                    .namespace(NAMESPACE)
                    .table(TABLE)
                    .indexKey(Key.ofText(COL_TEMPLATE_ID, templateId))
                    .build();
            List<Result> results = tx.scan(scan);
            tx.commit();

            List<VersionMeta> versions = new ArrayList<>();
            for (Result r : results) {
                versions.add(new VersionMeta(
                        r.getText(COL_ID),
                        r.getText(COL_TEMPLATE_ID),
                        r.getText(COL_LABEL),
                        r.getBigInt(COL_CREATED_AT),
                        r.getBoolean(COL_IS_AUTO)
                ));
            }
            versions.sort(Comparator.comparingLong(VersionMeta::createdAt).reversed());
            return versions;
        } catch (Exception e) {
            abortQuietly(tx);
            throw new JsonBlobRepository.RepositoryException("Failed to list versions for " + templateId, e);
        }
    }

    /** Get version JSON by ID. */
    public Optional<String> getVersion(String versionId) {
        DistributedTransactionManager mgr = factory.getTransactionManager();
        DistributedTransaction tx = null;
        try {
            tx = mgr.start();
            Get get = Get.newBuilder()
                    .namespace(NAMESPACE)
                    .table(TABLE)
                    .partitionKey(Key.ofText(COL_ID, versionId))
                    .build();
            Optional<Result> result = tx.get(get);
            tx.commit();
            return result.map(r -> r.getText(COL_JSON));
        } catch (Exception e) {
            abortQuietly(tx);
            throw new JsonBlobRepository.RepositoryException("Failed to get version " + versionId, e);
        }
    }

    /** Update version label. */
    public void updateLabel(String versionId, String label) {
        DistributedTransactionManager mgr = factory.getTransactionManager();
        DistributedTransaction tx = null;
        try {
            tx = mgr.start();
            Put put = Put.newBuilder()
                    .namespace(NAMESPACE)
                    .table(TABLE)
                    .partitionKey(Key.ofText(COL_ID, versionId))
                    .textValue(COL_LABEL, label != null ? label : "")
                    .enableImplicitPreRead()
                    .build();
            tx.put(put);
            tx.commit();
        } catch (Exception e) {
            abortQuietly(tx);
            throw new JsonBlobRepository.RepositoryException("Failed to update label for " + versionId, e);
        }
    }

    /** Delete a version. */
    public void deleteVersion(String versionId) {
        DistributedTransactionManager mgr = factory.getTransactionManager();
        DistributedTransaction tx = null;
        try {
            tx = mgr.start();
            Delete del = Delete.newBuilder()
                    .namespace(NAMESPACE)
                    .table(TABLE)
                    .partitionKey(Key.ofText(COL_ID, versionId))
                    .build();
            tx.delete(del);
            tx.commit();
            log.info("Deleted version {}", versionId);
        } catch (Exception e) {
            abortQuietly(tx);
            log.warn("Failed to delete version {}: {}", versionId, e.getMessage());
        }
    }

    /**
     * Create an auto-snapshot if enough time has passed since the last one.
     * Also prunes old auto-versions exceeding MAX_AUTO_VERSIONS.
     */
    public boolean createAutoVersionIfNeeded(String templateId, String json) {
        List<VersionMeta> versions = listVersions(templateId);
        // Check time gate: skip if last auto-snapshot was < 5 min ago
        Optional<VersionMeta> lastAuto = versions.stream()
                .filter(VersionMeta::isAuto)
                .findFirst();
        if (lastAuto.isPresent()) {
            long elapsed = System.currentTimeMillis() - lastAuto.get().createdAt();
            if (elapsed < AUTO_SNAPSHOT_INTERVAL_MS) {
                return false;
            }
        }

        createVersion(templateId, json, "", true);

        // Prune oldest auto-versions beyond limit
        List<VersionMeta> autoVersions = versions.stream()
                .filter(VersionMeta::isAuto)
                .toList();
        if (autoVersions.size() >= MAX_AUTO_VERSIONS) {
            // Delete oldest ones (list is sorted desc, so tail is oldest)
            for (int i = MAX_AUTO_VERSIONS - 1; i < autoVersions.size(); i++) {
                deleteVersion(autoVersions.get(i).versionId());
            }
        }
        return true;
    }

    private static void abortQuietly(DistributedTransaction tx) {
        if (tx != null) {
            try { tx.abort(); } catch (Exception ignored) { }
        }
    }
}

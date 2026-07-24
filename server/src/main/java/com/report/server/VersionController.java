package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.scalar.db.api.*;
import com.scalar.db.io.DataType;
import com.scalar.db.io.Key;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.time.Instant;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Handles V2 version management endpoints:
 *
 * <ul>
 *   <li>GET /api/v2/templates/{id}/versions — list versions
 *   <li>POST /api/v2/templates/{id}/versions — create version snapshot
 *   <li>POST /api/v2/templates/{id}/versions/{vid}/restore — restore version
 * </ul>
 *
 * <p>The inner {@link V2VersionRepository} owns the {@code v2_template_versions} table. Versions
 * store the full ReportDefinition JSON. {@code versionNumber} uses {@link
 * System#currentTimeMillis()} for uniqueness in a single-user tool.
 */
public final class VersionController {

    private static final Logger log = LoggerFactory.getLogger(VersionController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final V2VersionRepository versionRepo;
    private final JsonBlobRepository definitionsRepo;

    /** Production constructor — creates its own V2VersionRepository. */
    public VersionController(ScalarDbGateway gateway, JsonBlobRepository definitionsRepo) {
        this(new V2VersionRepository(gateway), definitionsRepo);
    }

    /** Package-private constructor for testing — accepts pre-built repository. */
    VersionController(V2VersionRepository versionRepo, JsonBlobRepository definitionsRepo) {
        this.versionRepo = versionRepo;
        this.definitionsRepo = definitionsRepo;
    }

    /** Create the version table if it doesn't exist. Call once during wiring. */
    public void ensureTable() {
        versionRepo.ensureTable();
    }

    // ── HTTP handlers ─────────────────────────────────────────────────────────

    /**
     * GET /api/v2/templates/{id}/versions Returns array of version items sorted by versionNumber
     * descending.
     */
    public void list(Context ctx) throws Exception {
        String templateId = RequestValidator.validateId(ctx);
        if (templateId == null) return;

        List<V2VersionRepository.VersionMeta> versions = versionRepo.listVersions(templateId);
        ArrayNode items = MAPPER.createArrayNode();
        for (var v : versions) {
            items.add(toListItem(v));
        }
        ctx.contentType("application/json");
        ctx.result(MAPPER.writeValueAsString(items));
    }

    /**
     * POST /api/v2/templates/{id}/versions Snapshots the current definition stored in
     * v2_definitions. Returns the new version item.
     */
    public void create(Context ctx) throws Exception {
        String templateId = RequestValidator.validateId(ctx);
        if (templateId == null) return;

        var stored = definitionsRepo.get(templateId);
        if (stored.isEmpty()) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Template not found");
            return;
        }

        // Extract definition from envelope
        JsonNode envelope = MAPPER.readTree(stored.get());
        JsonNode definition = envelope.path("definition");
        if (definition.isMissingNode()) {
            ApiError.respond(
                    ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Template definition not found");
            return;
        }

        String versionId = UUID.randomUUID().toString();
        long now = System.currentTimeMillis();
        versionRepo.createVersion(
                versionId, templateId, MAPPER.writeValueAsString(definition), now);

        V2VersionRepository.VersionMeta meta =
                new V2VersionRepository.VersionMeta(versionId, templateId, now, null);
        ctx.status(HttpStatus.CREATED);
        ctx.contentType("application/json");
        ctx.result(MAPPER.writeValueAsString(toListItem(meta)));
    }

    /**
     * POST /api/v2/templates/{id}/versions/{vid}/restore Returns the restored ReportDefinition JSON
     * (frontend loads it via loadFromBackend). Validates that the version belongs to this template
     * (ownership check).
     */
    public void restore(Context ctx) throws Exception {
        String templateId = RequestValidator.validateId(ctx);
        if (templateId == null) return;

        String versionId = RequestValidator.validateId(ctx, "vid");
        if (versionId == null) return;

        var versionData = versionRepo.getVersion(versionId, templateId);
        if (versionData.isEmpty()) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Version not found");
            return;
        }

        // Return the canonical envelope so frontend can call loadFromBackend
        // (docs/template-envelope-spec.md)
        ObjectNode resource = MAPPER.createObjectNode();
        resource.put("formatVersion", TemplateEnvelope.CURRENT_FORMAT_VERSION);
        resource.set("definition", MAPPER.readTree(versionData.get()));
        ctx.contentType("application/json");
        ctx.result(MAPPER.writeValueAsString(resource));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static ObjectNode toListItem(V2VersionRepository.VersionMeta v) {
        ObjectNode item = MAPPER.createObjectNode();
        item.put("id", v.versionId());
        item.put("versionNumber", v.versionNumber());
        item.put("createdAt", Instant.ofEpochMilli(v.versionNumber()).toString());
        if (v.createdBy() != null) {
            item.put("createdBy", v.createdBy());
        }
        return item;
    }

    // ── Inner repository ──────────────────────────────────────────────────────

    /**
     * ScalarDB-backed version store for V2 templates. Table: {@code v2_template_versions} Schema:
     * version_id (PK) + template_id (secondary index) + json_data + version_number (BIGINT) +
     * created_by (TEXT)
     */
    static final class V2VersionRepository {

        private static final Logger log = LoggerFactory.getLogger(V2VersionRepository.class);
        private static final String NAMESPACE = "report_studio";
        private static final String TABLE = "v2_template_versions";

        private static final String COL_VERSION_ID = "version_id";
        private static final String COL_TEMPLATE_ID = "template_id";
        private static final String COL_JSON = "json_data";
        private static final String COL_VERSION_NUMBER = "version_number";
        private static final String COL_CREATED_BY = "created_by";

        private final ScalarDbGateway gateway;

        V2VersionRepository(ScalarDbGateway gateway) {
            this.gateway = gateway;
        }

        record VersionMeta(
                String versionId, String templateId, long versionNumber, String createdBy) {}

        void ensureTable() {
            try (DistributedTransactionAdmin admin = gateway.createAdmin()) {
                if (!admin.tableExists(NAMESPACE, TABLE)) {
                    TableMetadata metadata =
                            TableMetadata.newBuilder()
                                    .addColumn(COL_VERSION_ID, DataType.TEXT)
                                    .addColumn(COL_TEMPLATE_ID, DataType.TEXT)
                                    .addColumn(COL_JSON, DataType.TEXT)
                                    .addColumn(COL_VERSION_NUMBER, DataType.BIGINT)
                                    .addColumn(COL_CREATED_BY, DataType.TEXT)
                                    .addPartitionKey(COL_VERSION_ID)
                                    .addSecondaryIndex(COL_TEMPLATE_ID)
                                    .build();
                    admin.createTable(NAMESPACE, TABLE, metadata);
                    log.info("Created table: {}.{}", NAMESPACE, TABLE);
                }
            } catch (Exception e) {
                throw new IllegalStateException(
                        "Failed to ensure table " + NAMESPACE + "." + TABLE, e);
            }
        }

        void createVersion(String versionId, String templateId, String json, long versionNumber) {
            try {
                Put put =
                        Put.newBuilder()
                                .namespace(NAMESPACE)
                                .table(TABLE)
                                .partitionKey(Key.ofText(COL_VERSION_ID, versionId))
                                .textValue(COL_TEMPLATE_ID, templateId)
                                .textValue(COL_JSON, json)
                                .bigIntValue(COL_VERSION_NUMBER, versionNumber)
                                .textValue(COL_CREATED_BY, "")
                                .build();
                gateway.inTransaction(
                        tx -> {
                            tx.put(put);
                            return null;
                        });
                log.info("Created V2 version {} for template {}", versionId, templateId);
            } catch (Exception e) {
                throw new JsonBlobRepository.RepositoryException(
                        "Failed to create V2 version for " + templateId, e);
            }
        }

        /** List versions for a template, sorted by versionNumber descending. */
        List<VersionMeta> listVersions(String templateId) {
            try {
                Scan scan =
                        Scan.newBuilder()
                                .namespace(NAMESPACE)
                                .table(TABLE)
                                .indexKey(Key.ofText(COL_TEMPLATE_ID, templateId))
                                .build();
                List<Result> results = gateway.inTransaction(tx -> tx.scan(scan));

                List<VersionMeta> versions = new ArrayList<>();
                for (Result r : results) {
                    versions.add(
                            new VersionMeta(
                                    r.getText(COL_VERSION_ID),
                                    r.getText(COL_TEMPLATE_ID),
                                    r.getBigInt(COL_VERSION_NUMBER),
                                    nullIfBlank(r.getText(COL_CREATED_BY))));
                }
                versions.sort(Comparator.comparingLong(VersionMeta::versionNumber).reversed());
                return versions;
            } catch (Exception e) {
                throw new JsonBlobRepository.RepositoryException(
                        "Failed to list V2 versions for " + templateId, e);
            }
        }

        /**
         * Get version JSON by ID, with ownership verification. Returns empty if not found OR if the
         * version belongs to a different template.
         */
        Optional<String> getVersion(String versionId, String expectedTemplateId) {
            try {
                Get get =
                        Get.newBuilder()
                                .namespace(NAMESPACE)
                                .table(TABLE)
                                .partitionKey(Key.ofText(COL_VERSION_ID, versionId))
                                .build();
                Optional<Result> result = gateway.inTransaction(tx -> tx.get(get));

                if (result.isEmpty()) return Optional.empty();

                // Ownership check: reject cross-template access
                String storedTemplateId = result.get().getText(COL_TEMPLATE_ID);
                if (!expectedTemplateId.equals(storedTemplateId)) {
                    log.warn(
                            "V2 version ownership mismatch: versionId={} expectedTemplate={} actualTemplate={}",
                            versionId,
                            expectedTemplateId,
                            storedTemplateId);
                    return Optional.empty();
                }

                return Optional.of(result.get().getText(COL_JSON));
            } catch (Exception e) {
                throw new JsonBlobRepository.RepositoryException(
                        "Failed to get V2 version " + versionId, e);
            }
        }

        private static String nullIfBlank(String s) {
            return (s == null || s.isBlank()) ? null : s;
        }
    }
}

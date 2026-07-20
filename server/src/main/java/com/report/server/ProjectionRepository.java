package com.report.server;

import com.scalar.db.api.DistributedTransactionManager;
import com.scalar.db.service.TransactionFactory;
import java.util.Optional;

/**
 * Projection-specific repository backed by JsonBlobRepository. Table:
 * report_studio.designer_projections
 */
public final class ProjectionRepository {

    private static final String NAMESPACE = "report_studio";
    private static final String TABLE = "designer_projections";

    private final JsonBlobRepository blob;

    public ProjectionRepository(TransactionFactory factory, DistributedTransactionManager manager) {
        this.blob = new JsonBlobRepository(factory, manager, NAMESPACE, TABLE);
    }

    public void ensureTable() {
        blob.ensureTable();
    }

    public Optional<String> getProjection(String templateId) {
        return blob.get(templateId);
    }

    public void putProjection(String templateId, String json) {
        blob.put(templateId, json);
    }

    public void deleteProjection(String templateId) {
        blob.delete(templateId);
    }
}

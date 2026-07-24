package com.report.server;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link ScalarDbTableController}.
 *
 * <p>Uses the hand-rolled Mockito {@link Context} pattern from {@link
 * ScalarDbCatalogControllerTest}. No {@code JavalinTest}.
 */
class ScalarDbTableControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private TransactionFactory factory;
    private DistributedTransactionAdmin admin;
    private ScalarDbTableController controller;
    private Context ctx;
    private Object capturedJson;
    private int capturedStatus;

    @BeforeEach
    void setUp() throws Exception {
        factory = mock(TransactionFactory.class);
        admin = mock(DistributedTransactionAdmin.class);
        when(factory.getTransactionAdmin()).thenReturn(admin);

        controller = new ScalarDbTableController(new ScalarDbGateway(factory));
        ctx = mock(Context.class);

        doAnswer(
                        inv -> {
                            capturedJson = inv.getArguments()[0];
                            return null;
                        })
                .when(ctx)
                .json(any());

        doAnswer(
                        inv -> {
                            capturedStatus = (int) inv.getArguments()[0];
                            return ctx;
                        })
                .when(ctx)
                .status(anyInt());

        // Default: namespace does not exist, table does not exist
        when(admin.namespaceExists(anyString())).thenReturn(false);
        when(admin.tableExists(anyString(), anyString())).thenReturn(false);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private void setBody(String json) {
        when(ctx.body()).thenReturn(json);
    }

    private JsonNode body() {
        return MAPPER.valueToTree(capturedJson);
    }

    private static String validBody(String ns, String table) {
        return """
                {
                  "namespace": "%s",
                  "tableName": "%s",
                  "columns": [
                    { "name": "id", "type": "BIGINT" },
                    { "name": "name", "type": "TEXT" }
                  ],
                  "partitionKeys": ["id"],
                  "clusteringKeys": [],
                  "secondaryIndexes": []
                }
                """
                .formatted(ns, table);
    }

    private void stubTableMetadataRoundTrip(String ns, String table) throws Exception {
        TableMetadata meta =
                TableMetadata.newBuilder()
                        .addColumn("id", DataType.BIGINT)
                        .addColumn("name", DataType.TEXT)
                        .addPartitionKey("id")
                        .build();
        when(admin.getTableMetadata(ns, table)).thenReturn(meta);
    }

    // ── (1) Happy path — 201 Created ─────────────────────────────────────────

    @Test
    void happyPath_201Created() throws Exception {
        setBody(validBody("app", "users"));
        stubTableMetadataRoundTrip("app", "users");

        controller.createTable(ctx);

        verify(ctx).status(201);
        JsonNode resp = body();
        assertEquals("users", resp.get("name").asText());
        assertNotNull(resp.get("columns"));
    }

    // ── (2) Missing body → 400 ───────────────────────────────────────────────

    @Test
    void missingBody_400() throws Exception {
        when(ctx.body()).thenReturn(null);

        controller.createTable(ctx);

        verify(ctx).status(400);
    }

    @Test
    void blankBody_400() throws Exception {
        when(ctx.body()).thenReturn("   ");

        controller.createTable(ctx);

        verify(ctx).status(400);
    }

    // ── (3) Invalid JSON → 400 ───────────────────────────────────────────────

    @Test
    void invalidJson_400() throws Exception {
        setBody("not-json");

        controller.createTable(ctx);

        verify(ctx).status(400);
        JsonNode resp = body();
        assertNotNull(resp.get("error"));
    }

    // ── (4) Missing required field → 400 ────────────────────────────────────

    @Test
    void missingNamespace_400() throws Exception {
        setBody(
                """
                {
                  "tableName": "users",
                  "columns": [{ "name": "id", "type": "BIGINT" }],
                  "partitionKeys": ["id"],
                  "clusteringKeys": [],
                  "secondaryIndexes": []
                }
                """);

        controller.createTable(ctx);

        verify(ctx).status(400);
    }

    // ── (5) Invalid identifier → 400 ────────────────────────────────────────

    @Test
    void invalidIdentifier_namespace_400() throws Exception {
        setBody(validBody("9invalid", "users"));

        controller.createTable(ctx);

        verify(ctx).status(400);
        assertTrue(body().get("error").asText().contains("Invalid identifier"));
    }

    // ── (6) Missing partition key → 400 ─────────────────────────────────────

    @Test
    void missingPartitionKey_400() throws Exception {
        setBody(
                """
                {
                  "namespace": "app",
                  "tableName": "users",
                  "columns": [{ "name": "id", "type": "BIGINT" }],
                  "partitionKeys": [],
                  "clusteringKeys": [],
                  "secondaryIndexes": []
                }
                """);

        controller.createTable(ctx);

        verify(ctx).status(400);
        assertTrue(body().get("error").asText().toLowerCase().contains("partition"));
    }

    // ── (7) Duplicate column names → 400 ────────────────────────────────────

    @Test
    void duplicateColumnNames_400() throws Exception {
        setBody(
                """
                {
                  "namespace": "app",
                  "tableName": "users",
                  "columns": [
                    { "name": "id", "type": "BIGINT" },
                    { "name": "id", "type": "TEXT" }
                  ],
                  "partitionKeys": ["id"],
                  "clusteringKeys": [],
                  "secondaryIndexes": []
                }
                """);

        controller.createTable(ctx);

        verify(ctx).status(400);
        assertTrue(body().get("error").asText().toLowerCase().contains("duplicate"));
    }

    // ── (8) Unknown column in PK list → 400 ─────────────────────────────────

    @Test
    void unknownColumnInPartitionKey_400() throws Exception {
        setBody(
                """
                {
                  "namespace": "app",
                  "tableName": "users",
                  "columns": [{ "name": "id", "type": "BIGINT" }],
                  "partitionKeys": ["nonexistent"],
                  "clusteringKeys": [],
                  "secondaryIndexes": []
                }
                """);

        controller.createTable(ctx);

        verify(ctx).status(400);
    }

    // ── (9) columns is not an array → 400 (type-confusion defence) ──────────

    @Test
    void columnsNotArray_400() throws Exception {
        setBody(
                """
                {
                  "namespace": "app",
                  "tableName": "users",
                  "columns": "not-an-array",
                  "partitionKeys": ["id"],
                  "clusteringKeys": [],
                  "secondaryIndexes": []
                }
                """);

        controller.createTable(ctx);

        verify(ctx).status(400);
        assertTrue(body().get("error").asText().toLowerCase().contains("array"));
    }

    // ── (10) columns array cap → 400 ────────────────────────────────────────

    @Test
    void columnsCap_400() throws Exception {
        // Build a JSON body with 201 columns
        StringBuilder cols = new StringBuilder("[");
        for (int i = 0; i < 201; i++) {
            if (i > 0) cols.append(",");
            cols.append("{\"name\":\"col").append(i).append("\",\"type\":\"TEXT\"}");
        }
        cols.append("]");

        setBody(
                """
                {
                  "namespace": "app",
                  "tableName": "users",
                  "columns": %s,
                  "partitionKeys": ["col0"],
                  "clusteringKeys": [],
                  "secondaryIndexes": []
                }
                """
                        .formatted(cols));

        controller.createTable(ctx);

        verify(ctx).status(400);
        assertTrue(body().get("error").asText().toLowerCase().contains("too many"));
    }

    // ── (11) Duplicate entries in partitionKeys → 400 ───────────────────────

    @Test
    void duplicatePartitionKeyEntries_400() throws Exception {
        setBody(
                """
                {
                  "namespace": "app",
                  "tableName": "users",
                  "columns": [{ "name": "id", "type": "BIGINT" }],
                  "partitionKeys": ["id", "id"],
                  "clusteringKeys": [],
                  "secondaryIndexes": []
                }
                """);

        controller.createTable(ctx);

        verify(ctx).status(400);
        assertTrue(body().get("error").asText().toLowerCase().contains("duplicate"));
    }

    // ── (12) tableExists true → 409 ─────────────────────────────────────────

    @Test
    void tableAlreadyExists_409() throws Exception {
        setBody(validBody("app", "users"));
        when(admin.tableExists("app", "users")).thenReturn(true);

        controller.createTable(ctx);

        verify(ctx).status(409);
        assertTrue(body().get("error").asText().contains("already exists"));
    }

    // ── (13) RetriableExecutionException → 503 ──────────────────────────────

    @Test
    void retriableException_503WithCorrelationId() throws Exception {
        setBody(validBody("app", "users"));
        doThrow(new RetriableExecutionException("connection timeout"))
                .when(admin)
                .createTable(anyString(), anyString(), any(TableMetadata.class));

        assertThrows(ServiceUnavailableResponse.class, () -> controller.createTable(ctx));
    }

    // ── (14) ExecutionException isAuthorizationError → 403 ──────────────────

    @Test
    void authorizationException_403() throws Exception {
        setBody(validBody("app", "users"));
        ExecutionException ex =
                new ExecutionException("permission denied", false, false, true, null);
        doThrow(ex).when(admin).createTable(anyString(), anyString(), any(TableMetadata.class));

        assertThrows(ForbiddenResponse.class, () -> controller.createTable(ctx));
    }

    // ── (15) ExecutionException isAuthenticationError → 401 ─────────────────

    @Test
    void authenticationException_401() throws Exception {
        setBody(validBody("app", "users"));
        ExecutionException ex = new ExecutionException("auth failed", true, false, false, null);
        doThrow(ex).when(admin).createTable(anyString(), anyString(), any(TableMetadata.class));

        assertThrows(UnauthorizedResponse.class, () -> controller.createTable(ctx));
    }

    // ── (16) Generic ExecutionException (DDL rejection) → 500 ───────────────

    @Test
    void ddlRejectionException_500() throws Exception {
        setBody(validBody("app", "users"));
        doThrow(new ExecutionException("DDL rejected: reserved word"))
                .when(admin)
                .createTable(anyString(), anyString(), any(TableMetadata.class));
        // Ensure TOCTOU check returns false
        when(admin.tableExists("app", "users")).thenReturn(false);

        assertThrows(InternalServerErrorResponse.class, () -> controller.createTable(ctx));
    }

    // ── (17) TOCTOU — createTable throws but tableExists returns true → 409 ──

    @Test
    void toctou_convertTo409() throws Exception {
        setBody(validBody("app", "users"));
        // First check: does not exist (pre-flight passes)
        when(admin.tableExists("app", "users"))
                .thenReturn(false) // pre-flight
                .thenReturn(true); // TOCTOU re-check in catch block
        doThrow(new ExecutionException("concurrent create"))
                .when(admin)
                .createTable(anyString(), anyString(), any(TableMetadata.class));

        controller.createTable(ctx);

        verify(ctx).status(409);
        assertTrue(body().get("error").asText().contains("already exists"));
    }

    // ── Namespace auto-create ────────────────────────────────────────────────

    @Test
    void autoCreatesNamespace_whenAbsent() throws Exception {
        setBody(validBody("newns", "users"));
        when(admin.namespaceExists("newns")).thenReturn(false);
        stubTableMetadataRoundTrip("newns", "users");

        controller.createTable(ctx);

        verify(admin).createNamespace("newns");
        verify(ctx).status(201);
    }

    @Test
    void skipsNamespaceCreate_whenAlreadyPresent() throws Exception {
        setBody(validBody("existingns", "users"));
        when(admin.namespaceExists("existingns")).thenReturn(true);
        stubTableMetadataRoundTrip("existingns", "users");

        controller.createTable(ctx);

        verify(admin, never()).createNamespace(anyString());
        verify(ctx).status(201);
    }

    // ── Key-list identifier validation ───────────────────────────────────────

    @Test
    void invalidIdentifier_inPartitionKey_400() throws Exception {
        setBody(
                """
                {
                  "namespace": "app",
                  "tableName": "users",
                  "columns": [{ "name": "id", "type": "BIGINT" }],
                  "partitionKeys": ["9invalid"],
                  "clusteringKeys": [],
                  "secondaryIndexes": []
                }
                """);

        controller.createTable(ctx);

        verify(ctx).status(400);
        assertTrue(body().get("error").asText().contains("Invalid identifier"));
    }

    @Test
    void invalidIdentifier_inClusteringKey_400() throws Exception {
        setBody(
                """
                {
                  "namespace": "app",
                  "tableName": "users",
                  "columns": [
                    { "name": "id", "type": "BIGINT" },
                    { "name": "ts", "type": "BIGINT" }
                  ],
                  "partitionKeys": ["id"],
                  "clusteringKeys": ["has-hyphen"],
                  "secondaryIndexes": []
                }
                """);

        controller.createTable(ctx);

        verify(ctx).status(400);
        assertTrue(body().get("error").asText().contains("Invalid identifier"));
    }

    @Test
    void invalidIdentifier_inSecondaryIndex_400() throws Exception {
        setBody(
                """
                {
                  "namespace": "app",
                  "tableName": "users",
                  "columns": [
                    { "name": "id", "type": "BIGINT" },
                    { "name": "email", "type": "TEXT" }
                  ],
                  "partitionKeys": ["id"],
                  "clusteringKeys": [],
                  "secondaryIndexes": ["テーブル"]
                }
                """);

        controller.createTable(ctx);

        verify(ctx).status(400);
        assertTrue(body().get("error").asText().contains("Invalid identifier"));
    }
}

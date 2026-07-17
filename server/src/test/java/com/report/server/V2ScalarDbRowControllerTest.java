package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.report.server.auth.Principal;
import com.report.server.auth.RateLimiter;
import com.scalar.db.api.Delete;
import com.scalar.db.api.DistributedTransaction;
import com.scalar.db.api.DistributedTransactionAdmin;
import com.scalar.db.api.DistributedTransactionManager;
import com.scalar.db.api.Get;
import com.scalar.db.api.Put;
import com.scalar.db.api.Result;
import com.scalar.db.api.TableMetadata;
import com.scalar.db.exception.transaction.CommitConflictException;
import com.scalar.db.exception.transaction.TransactionException;
import com.scalar.db.io.DataType;
import com.scalar.db.service.TransactionFactory;
import io.javalin.http.Context;
import io.javalin.http.ServiceUnavailableResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link V2ScalarDbRowController} — insert/update/delete row
 * paths, auth/rate-limit gating, protected-namespace rejection, key
 * validation and transaction failure mapping.
 *
 * <p>Uses the hand-rolled Mockito {@link Context} pattern from
 * {@link V2ScalarDbTableControllerTest} / {@link V2ScalarDbCatalogControllerTest}.
 */
class V2ScalarDbRowControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Principal USER = new Principal("user1", "User One", Set.of("user"));

    private TransactionFactory factory;
    private DistributedTransactionAdmin admin;
    private DistributedTransactionManager txManager;
    private DistributedTransaction tx;
    private RateLimiter rateLimiter;
    private V2ScalarDbRowController controller;
    private Context ctx;

    @BeforeEach
    void setUp() throws Exception {
        factory = mock(TransactionFactory.class);
        admin = mock(DistributedTransactionAdmin.class);
        txManager = mock(DistributedTransactionManager.class);
        tx = mock(DistributedTransaction.class);
        rateLimiter = mock(RateLimiter.class);

        when(factory.getTransactionAdmin()).thenReturn(admin);
        when(factory.getTransactionManager()).thenReturn(txManager);
        when(txManager.start()).thenReturn(tx);
        when(rateLimiter.isAllowed(anyString())).thenReturn(true);

        controller = new V2ScalarDbRowController(factory, rateLimiter);

        ctx = mock(Context.class);
        when(ctx.status(anyInt())).thenReturn(ctx);
        when(ctx.attribute("principal")).thenReturn(USER);
        when(ctx.pathParam("ns")).thenReturn("app");
        when(ctx.pathParam("table")).thenReturn("items");
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** app.items: id TEXT (partition key), name TEXT, qty INT. */
    private void stubSimpleTable() throws Exception {
        TableMetadata meta = TableMetadata.newBuilder()
                .addColumn("id", DataType.TEXT)
                .addColumn("name", DataType.TEXT)
                .addColumn("qty", DataType.INT)
                .addPartitionKey("id")
                .build();
        when(admin.getTableMetadata("app", "items")).thenReturn(meta);
    }

    /** app.items: id TEXT (partition key), seq BIGINT (clustering key), name TEXT. */
    private void stubClusteredTable() throws Exception {
        TableMetadata meta = TableMetadata.newBuilder()
                .addColumn("id", DataType.TEXT)
                .addColumn("seq", DataType.BIGINT)
                .addColumn("name", DataType.TEXT)
                .addPartitionKey("id")
                .addClusteringKey("seq")
                .build();
        when(admin.getTableMetadata("app", "items")).thenReturn(meta);
    }

    private void setBody(String json) {
        when(ctx.body()).thenReturn(json);
    }

    private JsonNode capturedJson() {
        ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
        verify(ctx).json(captor.capture());
        return MAPPER.valueToTree(captor.getValue());
    }

    // ── Insert — happy path ──────────────────────────────────────────────────

    @Test
    void insert_happyPath_201WithRowEcho() throws Exception {
        stubSimpleTable();
        setBody("{\"values\":{\"id\":\"r1\",\"name\":\"hello\",\"qty\":3}}");

        controller.insertRow(ctx);

        verify(tx).put(any(Put.class));
        verify(tx).commit();
        verify(ctx).status(201);
        JsonNode row = capturedJson().get("row");
        assertEquals("r1", row.get("id").asText());
        assertEquals("hello", row.get("name").asText());
        assertEquals(3, row.get("qty").asInt());
    }

    @Test
    void insert_withClusteringKey_201() throws Exception {
        stubClusteredTable();
        setBody("{\"values\":{\"id\":\"r1\",\"seq\":10,\"name\":\"hello\"}}");

        controller.insertRow(ctx);

        verify(tx).put(any(Put.class));
        verify(tx).commit();
        verify(ctx).status(201);
    }

    @Test
    void insert_doesNotRequireExistingRow() throws Exception {
        stubSimpleTable();
        setBody("{\"values\":{\"id\":\"r1\"}}");

        controller.insertRow(ctx);

        verify(tx, never()).get(any(Get.class));
        verify(ctx).status(201);
    }

    // ── Auth / rate limit gating ─────────────────────────────────────────────

    @Test
    void insert_noPrincipal_401() throws Exception {
        when(ctx.attribute("principal")).thenReturn(null);
        setBody("{\"values\":{\"id\":\"r1\"}}");

        controller.insertRow(ctx);

        verify(ctx).status(401);
        verify(txManager, never()).start();
    }

    @Test
    void insert_anonymousPrincipal_401() throws Exception {
        when(ctx.attribute("principal")).thenReturn(Principal.ANONYMOUS);
        setBody("{\"values\":{\"id\":\"r1\"}}");

        controller.insertRow(ctx);

        verify(ctx).status(401);
    }

    @Test
    void insert_rateLimited_429() throws Exception {
        when(rateLimiter.isAllowed("user1")).thenReturn(false);
        setBody("{\"values\":{\"id\":\"r1\"}}");

        controller.insertRow(ctx);

        verify(ctx).status(429);
        assertTrue(capturedJson().get("error").asText().contains("Rate limit"));
        verify(txManager, never()).start();
    }

    // ── Namespace / identifier validation ────────────────────────────────────

    @Test
    void insert_protectedNamespace_403() throws Exception {
        when(ctx.pathParam("ns")).thenReturn("report_studio");
        setBody("{\"values\":{\"id\":\"r1\"}}");

        controller.insertRow(ctx);

        verify(ctx).status(403);
        verify(txManager, never()).start();
    }

    @Test
    void delete_protectedNamespace_coordinator_403() throws Exception {
        when(ctx.pathParam("ns")).thenReturn("coordinator");
        setBody("{\"keys\":{\"id\":\"r1\"}}");

        controller.deleteRow(ctx);

        verify(ctx).status(403);
    }

    @Test
    void insert_invalidNamespaceIdentifier_400() throws Exception {
        when(ctx.pathParam("ns")).thenReturn("bad-ns;drop");
        setBody("{\"values\":{\"id\":\"r1\"}}");

        controller.insertRow(ctx);

        verify(ctx).status(400);
    }

    @Test
    void insert_invalidTableIdentifier_400() throws Exception {
        when(ctx.pathParam("table")).thenReturn("9table");
        setBody("{\"values\":{\"id\":\"r1\"}}");

        controller.insertRow(ctx);

        verify(ctx).status(400);
    }

    // ── Body validation ──────────────────────────────────────────────────────

    @Test
    void insert_missingBody_400() throws Exception {
        setBody(null);

        controller.insertRow(ctx);

        verify(ctx).status(400);
    }

    @Test
    void insert_oversizedBody_400() throws Exception {
        setBody("{\"values\":{\"id\":\"" + "x".repeat(66_000) + "\"}}");

        controller.insertRow(ctx);

        verify(ctx).status(400);
        assertTrue(capturedJson().get("error").asText().contains("size limit"));
    }

    @Test
    void insert_invalidJson_400() throws Exception {
        setBody("not-json{");

        controller.insertRow(ctx);

        verify(ctx).status(400);
    }

    @Test
    void insert_tableNotFound_404() throws Exception {
        when(admin.getTableMetadata("app", "items")).thenReturn(null);
        setBody("{\"values\":{\"id\":\"r1\"}}");

        controller.insertRow(ctx);

        verify(ctx).status(404);
    }

    @Test
    void insert_missingValuesObject_400() throws Exception {
        stubSimpleTable();
        setBody("{\"other\":{}}");

        controller.insertRow(ctx);

        verify(ctx).status(400);
        assertTrue(capturedJson().get("error").asText().contains("values"));
    }

    @Test
    void insert_missingPartitionKey_400() throws Exception {
        stubSimpleTable();
        setBody("{\"values\":{\"name\":\"no-id\"}}");

        controller.insertRow(ctx);

        verify(ctx).status(400);
        assertTrue(capturedJson().get("error").asText().contains("partition key"));
    }

    @Test
    void insert_missingClusteringKey_400() throws Exception {
        stubClusteredTable();
        setBody("{\"values\":{\"id\":\"r1\",\"name\":\"no-seq\"}}");

        controller.insertRow(ctx);

        verify(ctx).status(400);
        assertTrue(capturedJson().get("error").asText().contains("clustering key"));
    }

    @Test
    void insert_unknownColumn_400() throws Exception {
        stubSimpleTable();
        setBody("{\"values\":{\"id\":\"r1\",\"bogus\":\"x\"}}");

        controller.insertRow(ctx);

        verify(ctx).status(400);
        verify(txManager, never()).start();
    }

    // ── Insert — transaction failure mapping ─────────────────────────────────

    @Test
    void insert_commitConflict_409AndAbort() throws Exception {
        stubSimpleTable();
        setBody("{\"values\":{\"id\":\"r1\"}}");
        doThrow(new CommitConflictException("conflict", "tx-1")).when(tx).commit();

        controller.insertRow(ctx);

        verify(ctx).status(409);
        assertTrue(capturedJson().get("error").asText().contains("Conflict"));
        verify(tx).abort();
    }

    @Test
    void insert_transactionUnreachable_503() throws Exception {
        stubSimpleTable();
        setBody("{\"values\":{\"id\":\"r1\"}}");
        when(txManager.start()).thenThrow(new TransactionException("db down", "tx-1"));

        assertThrows(ServiceUnavailableResponse.class, () -> controller.insertRow(ctx));
    }

    // ── Update ───────────────────────────────────────────────────────────────

    @Test
    void update_existingRow_200() throws Exception {
        stubSimpleTable();
        setBody("{\"values\":{\"id\":\"r1\",\"name\":\"renamed\"}}");
        when(tx.get(any(Get.class))).thenReturn(Optional.of(mock(Result.class)));

        controller.updateRow(ctx);

        verify(tx).get(any(Get.class));
        verify(tx).put(any(Put.class));
        verify(tx).commit();
        verify(ctx).status(200);
        assertEquals("renamed", capturedJson().get("row").get("name").asText());
    }

    @Test
    void update_rowNotFound_404AndAbort() throws Exception {
        stubSimpleTable();
        setBody("{\"values\":{\"id\":\"missing\",\"name\":\"x\"}}");
        when(tx.get(any(Get.class))).thenReturn(Optional.empty());

        controller.updateRow(ctx);

        verify(ctx).status(404);
        assertTrue(capturedJson().get("error").asText().contains("Row not found"));
        verify(tx).abort();
        verify(tx, never()).put(any(Put.class));
        verify(tx, never()).commit();
    }

    @Test
    void update_commitConflict_409() throws Exception {
        stubSimpleTable();
        setBody("{\"values\":{\"id\":\"r1\",\"name\":\"x\"}}");
        when(tx.get(any(Get.class))).thenReturn(Optional.of(mock(Result.class)));
        doThrow(new CommitConflictException("conflict", "tx-1")).when(tx).commit();

        controller.updateRow(ctx);

        verify(ctx).status(409);
        verify(tx).abort();
    }

    // ── Delete ───────────────────────────────────────────────────────────────

    @Test
    void delete_happyPath_204() throws Exception {
        stubSimpleTable();
        setBody("{\"keys\":{\"id\":\"r1\"}}");

        controller.deleteRow(ctx);

        verify(tx).delete(any(Delete.class));
        verify(tx).commit();
        verify(ctx).status(204);
    }

    @Test
    void delete_withClusteringKey_204() throws Exception {
        stubClusteredTable();
        setBody("{\"keys\":{\"id\":\"r1\",\"seq\":10}}");

        controller.deleteRow(ctx);

        verify(tx).delete(any(Delete.class));
        verify(ctx).status(204);
    }

    @Test
    void delete_missingKeysObject_400() throws Exception {
        stubSimpleTable();
        setBody("{\"values\":{\"id\":\"r1\"}}");

        controller.deleteRow(ctx);

        verify(ctx).status(400);
        assertTrue(capturedJson().get("error").asText().contains("keys"));
    }

    @Test
    void delete_missingPartitionKey_400() throws Exception {
        stubSimpleTable();
        setBody("{\"keys\":{}}");

        controller.deleteRow(ctx);

        verify(ctx).status(400);
    }

    @Test
    void delete_missingClusteringKey_400() throws Exception {
        stubClusteredTable();
        setBody("{\"keys\":{\"id\":\"r1\"}}");

        controller.deleteRow(ctx);

        verify(ctx).status(400);
        assertTrue(capturedJson().get("error").asText().contains("clustering key"));
    }

    @Test
    void delete_commitConflict_409AndAbort() throws Exception {
        stubSimpleTable();
        setBody("{\"keys\":{\"id\":\"r1\"}}");
        doThrow(new CommitConflictException("conflict", "tx-1")).when(tx).commit();

        controller.deleteRow(ctx);

        verify(ctx).status(409);
        verify(tx).abort();
    }

    @Test
    void delete_transactionUnreachable_503() throws Exception {
        stubSimpleTable();
        setBody("{\"keys\":{\"id\":\"r1\"}}");
        when(txManager.start()).thenThrow(new TransactionException("db down", "tx-1"));

        assertThrows(ServiceUnavailableResponse.class, () -> controller.deleteRow(ctx));
    }

    // ── Metadata cache ───────────────────────────────────────────────────────

    @Test
    void metadataIsCachedAcrossRequests() throws Exception {
        stubSimpleTable();
        setBody("{\"values\":{\"id\":\"r1\"}}");

        controller.insertRow(ctx);
        controller.insertRow(ctx);

        verify(admin, times(1)).getTableMetadata("app", "items");
    }

    @Test
    void invalidateMetadataCache_forcesRefetch() throws Exception {
        stubSimpleTable();
        setBody("{\"values\":{\"id\":\"r1\"}}");

        controller.insertRow(ctx);
        controller.invalidateMetadataCache("app", "items");
        controller.insertRow(ctx);

        verify(admin, times(2)).getTableMetadata("app", "items");
    }
}

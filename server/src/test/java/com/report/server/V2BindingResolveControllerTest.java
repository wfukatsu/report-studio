package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.report.server.auth.Principal;
import com.report.server.auth.RateLimiter;
import com.scalar.db.api.DistributedTransaction;
import com.scalar.db.api.DistributedTransactionAdmin;
import com.scalar.db.api.DistributedTransactionManager;
import com.scalar.db.api.Get;
import com.scalar.db.api.Result;
import com.scalar.db.api.TableMetadata;
import com.scalar.db.io.DataType;
import com.scalar.db.service.TransactionFactory;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class V2BindingResolveControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private TransactionFactory factory;
    private JsonBlobRepository definitionsRepo;
    private V2BindingResolveController controller;
    private Context ctx;
    private Principal principal;

    @BeforeEach
    void setUp() {
        factory = mock(TransactionFactory.class);
        definitionsRepo = mock(JsonBlobRepository.class);
        // Unlimited rate limiter for tests
        controller = new V2BindingResolveController(factory, definitionsRepo, new RateLimiter(1000, 60_000L));
        ctx = mock(Context.class);
        principal = mock(Principal.class);
        when(principal.userId()).thenReturn("test-user");
        when(ctx.attribute("principal")).thenReturn(principal);
        when(ctx.pathParam("id")).thenReturn("tmpl-1");
    }

    // ── Ownership and security ─────────────────────────────────────────────────

    @Test
    void returns404_whenTemplateNotFound() throws Exception {
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.empty());
        when(ctx.body()).thenReturn("{\"schema\":{\"groups\":[]},\"partitionKeys\":{}}");

        controller.resolve(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
    }

    @Test
    void returns404_whenNonOwnerRequests() throws Exception {
        String envelope = makeEnvelope("other-user", null);
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(envelope));
        when(ctx.body()).thenReturn("{\"schema\":{\"groups\":[]},\"partitionKeys\":{}}");

        controller.resolve(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
    }

    @Test
    void returns400_whenBodyMissing() throws Exception {
        when(ctx.body()).thenReturn("");

        controller.resolve(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
    }

    @Test
    void returns400_whenBodyInvalidJson() throws Exception {
        when(ctx.body()).thenReturn("not json {{{");

        controller.resolve(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
    }

    // ── Detail group handling ──────────────────────────────────────────────────

    @Test
    void detailGroups_returnedInErrors_notResolved() throws Exception {
        String envelope = makeEnvelope("test-user", "default", "customers");
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(envelope));

        String body = MAPPER.writeValueAsString(MAPPER.readTree("""
            {
              "schema": {
                "groups": [
                  { "id": "grp1", "role": "detail",
                    "tableMeta": {"namespace":"default","tableName":"customers"},
                    "fields": [] }
                ]
              },
              "partitionKeys": { "grp1": {} }
            }
            """));
        when(ctx.body()).thenReturn(body);

        controller.resolve(ctx);

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode resp = MAPPER.readTree(captor.getValue());
        assertFalse(resp.path("resolved").has("grp1"));
        assertTrue(resp.path("errors").path("grp1").asText().contains("Phase 2"));
    }

    // ── Table not in schema allowlist ──────────────────────────────────────────

    @Test
    void returns_tableNotBound_whenTableNotInStoredSchema() throws Exception {
        // Template only has "default.orders" bound, but request asks for "default.customers"
        String envelope = makeEnvelope("test-user", "default", "orders");
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(envelope));

        String body = buildBody("grp1", "master", "default", "customers", "cust_id", "C001");
        when(ctx.body()).thenReturn(body);

        controller.resolve(ctx);

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode resp = MAPPER.readTree(captor.getValue());
        assertTrue(resp.path("errors").path("grp1").asText().contains("not bound"));
    }

    // ── Successful resolution ──────────────────────────────────────────────────

    @Test
    void resolvesRowSuccessfully() throws Exception {
        String envelope = makeEnvelope("test-user", "default", "customers");
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(envelope));

        // Mock Admin for TableMetadata
        DistributedTransactionAdmin admin = mock(DistributedTransactionAdmin.class);
        TableMetadata meta = mockTableMetadata("cust_id", DataType.TEXT, "customer_name", DataType.TEXT);
        when(admin.getTableMetadata("default", "customers")).thenReturn(meta);
        when(factory.getTransactionAdmin()).thenReturn(admin);

        // Mock TransactionManager for Get
        DistributedTransactionManager mgr = mock(DistributedTransactionManager.class);
        DistributedTransaction tx = mock(DistributedTransaction.class);
        Result result = mock(Result.class);
        when(mgr.start()).thenReturn(tx);
        when(tx.get(any(Get.class))).thenReturn(Optional.of(result));
        when(result.isNull("customer_name")).thenReturn(false);
        when(result.getText("customer_name")).thenReturn("山田太郎");
        when(factory.getTransactionManager()).thenReturn(mgr);

        String body = buildBody("grp1", "master", "default", "customers", "cust_id", "C001",
                "customer_name", "name");
        when(ctx.body()).thenReturn(body);

        controller.resolve(ctx);

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode resp = MAPPER.readTree(captor.getValue());
        assertEquals("山田太郎", resp.path("resolved").path("grp1").path("name").asText());
        assertTrue(resp.path("errors").path("grp1").isNull());
        assertNotNull(resp.path("requestId").asText());
        verify(tx).commit();
    }

    @Test
    void rowNotFound_returnsErrorForGroup() throws Exception {
        String envelope = makeEnvelope("test-user", "default", "customers");
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(envelope));

        DistributedTransactionAdmin admin = mock(DistributedTransactionAdmin.class);
        TableMetadata meta = mockTableMetadata("cust_id", DataType.TEXT);
        when(admin.getTableMetadata("default", "customers")).thenReturn(meta);
        when(factory.getTransactionAdmin()).thenReturn(admin);

        DistributedTransactionManager mgr = mock(DistributedTransactionManager.class);
        DistributedTransaction tx = mock(DistributedTransaction.class);
        when(mgr.start()).thenReturn(tx);
        when(tx.get(any(Get.class))).thenReturn(Optional.empty()); // row not found
        when(factory.getTransactionManager()).thenReturn(mgr);

        String body = buildBody("grp1", "master", "default", "customers", "cust_id", "NOTEXIST");
        when(ctx.body()).thenReturn(body);

        controller.resolve(ctx);

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode resp = MAPPER.readTree(captor.getValue());
        assertFalse(resp.path("resolved").has("grp1"));
        assertTrue(resp.path("errors").path("grp1").asText().contains("not found"));
    }

    @Test
    void tableRemovedAfterBinding_returnsError_notException() throws Exception {
        String envelope = makeEnvelope("test-user", "default", "customers");
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(envelope));

        DistributedTransactionAdmin admin = mock(DistributedTransactionAdmin.class);
        when(admin.getTableMetadata("default", "customers")).thenReturn(null); // table dropped
        when(factory.getTransactionAdmin()).thenReturn(admin);

        String body = buildBody("grp1", "master", "default", "customers", "cust_id", "C001");
        when(ctx.body()).thenReturn(body);

        controller.resolve(ctx); // must not throw

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode resp = MAPPER.readTree(captor.getValue());
        assertTrue(resp.path("errors").path("grp1").asText().contains("removed"));
    }

    @Test
    void columnOrderShuffle_producesIdenticalResult() throws Exception {
        // Validates name-based mapping — column order must not affect field→value mapping
        String envelope = makeEnvelope("test-user", "default", "customers");
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(envelope));

        DistributedTransactionAdmin admin = mock(DistributedTransactionAdmin.class);
        // Meta with columns in different order than the fields array in the request.
        // cust_id is partition key (first column = partition key convention)
        TableMetadata meta = mockTableMetadata("cust_id", DataType.TEXT, "amount", DataType.INT, "customer_name", DataType.TEXT);
        when(admin.getTableMetadata("default", "customers")).thenReturn(meta);
        when(factory.getTransactionAdmin()).thenReturn(admin);

        DistributedTransactionManager mgr = mock(DistributedTransactionManager.class);
        DistributedTransaction tx = mock(DistributedTransaction.class);
        Result result = mock(Result.class);
        when(mgr.start()).thenReturn(tx);
        when(tx.get(any(Get.class))).thenReturn(Optional.of(result));
        when(result.isNull(anyString())).thenReturn(false);
        when(result.getText("customer_name")).thenReturn("山田");
        when(result.getInt("amount")).thenReturn(9999);
        when(factory.getTransactionManager()).thenReturn(mgr);

        // Fields in request in different order than the meta columns
        String body = buildBody("grp1", "master", "default", "customers", "cust_id", "C001",
                "customer_name", "name", "amount", "price");
        when(ctx.body()).thenReturn(body);

        controller.resolve(ctx);

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode resp = MAPPER.readTree(captor.getValue());
        assertEquals("山田", resp.path("resolved").path("grp1").path("name").asText());
        assertEquals(9999, resp.path("resolved").path("grp1").path("price").asInt());
    }

    @Test
    void invalidIdentifier_returnsBadRequest() throws Exception {
        String envelope = makeEnvelope("test-user", "default", "customers");
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(envelope));

        // tableName with injection attempt
        String body = """
            {"schema":{"groups":[{"id":"g1","role":"master","tableMeta":{"namespace":"default","tableName":"../evil"},"fields":[]}]},"partitionKeys":{"g1":{}}}
            """;
        when(ctx.body()).thenReturn(body.trim());

        controller.resolve(ctx);

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode resp = MAPPER.readTree(captor.getValue());
        assertTrue(resp.path("errors").path("g1").asText().contains("Invalid"));
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private String makeEnvelope(String owner, String namespace, String tableName) throws Exception {
        String schema = namespace != null && tableName != null
                ? """
                  ,"schema":{"groups":[{"id":"stored-grp","role":"master","tableMeta":{"namespace":"%s","tableName":"%s"},"fields":[]}]}
                  """.formatted(namespace, tableName)
                : "";
        return """
               {"id":"tmpl-1","name":"Test","created_by":"%s","definition":{"id":"tmpl-1"%s}}
               """.formatted(owner, schema).trim();
    }

    private String makeEnvelope(String owner, String tablePart) throws Exception {
        return makeEnvelope(owner, null, null);
    }

    private String makeEnvelope(String owner) throws Exception {
        return makeEnvelope(owner, null, null);
    }

    /** Build a resolve-bindings request body with one group, one partition key, and optional extra fields. */
    private String buildBody(String groupId, String role, String namespace, String tableName,
                             String pkCol, String pkVal, String... extraFields) throws Exception {
        var fieldsArr = new StringBuilder("[");
        // pk field
        fieldsArr.append("{\"id\":\"f0\",\"key\":\"pk_key\",\"dbColumnName\":\"%s\"}".formatted(pkCol));
        // extra fieldName/dbColumnName pairs
        for (int i = 0; i < extraFields.length; i += 2) {
            String dbCol = extraFields[i];
            String fieldKey = extraFields[i + 1];
            fieldsArr.append(",{\"id\":\"f%d\",\"key\":\"%s\",\"dbColumnName\":\"%s\"}".formatted(i + 1, fieldKey, dbCol));
        }
        fieldsArr.append("]");

        return """
               {"schema":{"groups":[{"id":"%s","role":"%s","tableMeta":{"namespace":"%s","tableName":"%s"},"fields":%s}]},"partitionKeys":{"%s":{"%s":"%s"}}}
               """.formatted(groupId, role, namespace, tableName, fieldsArr, groupId, pkCol, pkVal).trim();
    }

    private String buildBody(String groupId, String role, String ns, String tbl, String pkCol, String pkVal) throws Exception {
        return buildBody(groupId, role, ns, tbl, pkCol, pkVal, new String[0]);
    }

    /** Create a mock TableMetadata with alternating (columnName, DataType) varargs. */
    private TableMetadata mockTableMetadata(Object... colAndTypes) {
        TableMetadata meta = mock(TableMetadata.class);
        java.util.LinkedHashSet<String> partitionKeys = new java.util.LinkedHashSet<>();
        java.util.LinkedHashSet<String> columnNames = new java.util.LinkedHashSet<>();
        for (int i = 0; i < colAndTypes.length; i += 2) {
            String col = (String) colAndTypes[i];
            DataType dt = (DataType) colAndTypes[i + 1];
            columnNames.add(col);
            when(meta.getColumnDataType(col)).thenReturn(dt);
            if (i == 0) partitionKeys.add(col); // first column is partition key by convention
        }
        when(meta.getColumnNames()).thenReturn(columnNames);
        when(meta.getPartitionKeyNames()).thenReturn(partitionKeys);
        when(meta.getClusteringKeyNames()).thenReturn(new java.util.LinkedHashSet<>());
        when(meta.getSecondaryIndexNames()).thenReturn(new java.util.LinkedHashSet<>());
        return meta;
    }
}

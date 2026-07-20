package com.report.server;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.report.server.auth.Principal;
import com.report.server.auth.RateLimiter;
import com.scalar.db.api.DistributedTransaction;
import com.scalar.db.api.DistributedTransactionAdmin;
import com.scalar.db.api.DistributedTransactionManager;
import com.scalar.db.api.Get;
import com.scalar.db.api.Result;
import com.scalar.db.api.Scan;
import com.scalar.db.api.TableMetadata;
import com.scalar.db.io.DataType;
import com.scalar.db.service.TransactionFactory;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class BindingResolveControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private TransactionFactory factory;
    private DistributedTransactionManager manager;
    private JsonBlobRepository definitionsRepo;
    private BindingResolveController controller;
    private Context ctx;
    private Principal principal;

    @BeforeEach
    void setUp() {
        factory = mock(TransactionFactory.class);
        manager = mock(DistributedTransactionManager.class);
        definitionsRepo = mock(JsonBlobRepository.class);
        // Unlimited rate limiter for tests
        controller =
                new BindingResolveController(
                        factory, manager, definitionsRepo, new RateLimiter(1000, 60_000L));
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
    void detailGroups_nowResolvedAsArrayInPhase2_5() throws Exception {
        // Phase 2.5: detail groups are now resolved (no longer return "not supported" error)
        String envelope = makeEnvelope("test-user", "default", "customers");
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(envelope));

        DistributedTransactionAdmin admin = mock(DistributedTransactionAdmin.class);
        TableMetadata meta = mockTableMetadata("cust_id", DataType.TEXT);
        when(admin.getTableMetadata("default", "customers")).thenReturn(meta);
        when(factory.getTransactionAdmin()).thenReturn(admin);
        DistributedTransaction tx = mock(DistributedTransaction.class);
        when(manager.start()).thenReturn(tx);
        when(tx.scan(any(Scan.class))).thenReturn(List.of()); // empty result is fine

        String body =
                MAPPER.writeValueAsString(
                        MAPPER.readTree(
                                """
            {
              "schema": {
                "groups": [
                  { "id": "grp1", "role": "detail",
                    "tableMeta": {"namespace":"default","tableName":"customers"},
                    "fields": [] }
                ]
              },
              "partitionKeys": { "grp1": {"cust_id": "C001"} }
            }
            """));
        when(ctx.body()).thenReturn(body);

        controller.resolve(ctx);

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode resp = MAPPER.readTree(captor.getValue());
        // Phase 2.5: detail group now returns an array (empty in this case), not an error
        assertTrue(
                resp.path("resolved").path("grp1").isArray(),
                "Phase 2.5: detail groups should return an array");
        assertTrue(
                resp.path("errors").path("grp1").isNull(),
                "Phase 2.5: detail groups should not return error when successful");
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
        TableMetadata meta =
                mockTableMetadata("cust_id", DataType.TEXT, "customer_name", DataType.TEXT);
        when(admin.getTableMetadata("default", "customers")).thenReturn(meta);
        when(factory.getTransactionAdmin()).thenReturn(admin);

        // Mock TransactionManager for Get
        DistributedTransaction tx = mock(DistributedTransaction.class);
        Result result = mock(Result.class);
        when(manager.start()).thenReturn(tx);
        when(tx.get(any(Get.class))).thenReturn(Optional.of(result));
        when(result.isNull("customer_name")).thenReturn(false);
        when(result.getText("customer_name")).thenReturn("山田太郎");

        String body =
                buildBody(
                        "grp1",
                        "master",
                        "default",
                        "customers",
                        "cust_id",
                        "C001",
                        "customer_name",
                        "name");
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
        DistributedTransaction tx = mock(DistributedTransaction.class);
        when(manager.start()).thenReturn(tx);
        when(tx.get(any(Get.class))).thenReturn(Optional.empty()); // row not found

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
        TableMetadata meta =
                mockTableMetadata(
                        "cust_id",
                        DataType.TEXT,
                        "amount",
                        DataType.INT,
                        "customer_name",
                        DataType.TEXT);
        when(admin.getTableMetadata("default", "customers")).thenReturn(meta);
        when(factory.getTransactionAdmin()).thenReturn(admin);
        DistributedTransaction tx = mock(DistributedTransaction.class);
        Result result = mock(Result.class);
        when(manager.start()).thenReturn(tx);
        when(tx.get(any(Get.class))).thenReturn(Optional.of(result));
        when(result.isNull(anyString())).thenReturn(false);
        when(result.getText("customer_name")).thenReturn("山田");
        when(result.getInt("amount")).thenReturn(9999);

        // Fields in request in different order than the meta columns
        String body =
                buildBody(
                        "grp1",
                        "master",
                        "default",
                        "customers",
                        "cust_id",
                        "C001",
                        "customer_name",
                        "name",
                        "amount",
                        "price");
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
        String body =
                """
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
        String schema =
                namespace != null && tableName != null
                        ? """
                  ,"schema":{"groups":[{"id":"stored-grp","role":"master","tableMeta":{"namespace":"%s","tableName":"%s"},"fields":[]}]}
                  """
                                .formatted(namespace, tableName)
                        : "";
        return """
               {"id":"tmpl-1","name":"Test","created_by":"%s","definition":{"id":"tmpl-1"%s}}
               """
                .formatted(owner, schema)
                .trim();
    }

    private String makeEnvelope(String owner, String tablePart) throws Exception {
        return makeEnvelope(owner, null, null);
    }

    private String makeEnvelope(String owner) throws Exception {
        return makeEnvelope(owner, null, null);
    }

    /**
     * Build a resolve-bindings request body with one group, one partition key, and optional extra
     * fields.
     */
    private String buildBody(
            String groupId,
            String role,
            String namespace,
            String tableName,
            String pkCol,
            String pkVal,
            String... extraFields)
            throws Exception {
        var fieldsArr = new StringBuilder("[");
        // pk field
        fieldsArr.append(
                "{\"id\":\"f0\",\"key\":\"pk_key\",\"dbColumnName\":\"%s\"}".formatted(pkCol));
        // extra fieldName/dbColumnName pairs
        for (int i = 0; i < extraFields.length; i += 2) {
            String dbCol = extraFields[i];
            String fieldKey = extraFields[i + 1];
            fieldsArr.append(
                    ",{\"id\":\"f%d\",\"key\":\"%s\",\"dbColumnName\":\"%s\"}"
                            .formatted(i + 1, fieldKey, dbCol));
        }
        fieldsArr.append("]");

        return """
               {"schema":{"groups":[{"id":"%s","role":"%s","tableMeta":{"namespace":"%s","tableName":"%s"},"fields":%s}]},"partitionKeys":{"%s":{"%s":"%s"}}}
               """
                .formatted(groupId, role, namespace, tableName, fieldsArr, groupId, pkCol, pkVal)
                .trim();
    }

    private String buildBody(
            String groupId, String role, String ns, String tbl, String pkCol, String pkVal)
            throws Exception {
        return buildBody(groupId, role, ns, tbl, pkCol, pkVal, new String[0]);
    }

    // ── Phase 2.5: detail group (Scan) tests ──────────────────────────────────

    @Test
    void detailGroup_scanReturnsArrayOfRows() throws Exception {
        String envelope = makeEnvelope("test-user", "default", "order_items");
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(envelope));

        DistributedTransactionAdmin admin = mock(DistributedTransactionAdmin.class);
        TableMetadata meta =
                mockTableMetadata(
                        "order_id", DataType.TEXT, "product", DataType.TEXT, "qty", DataType.INT);
        when(admin.getTableMetadata("default", "order_items")).thenReturn(meta);
        when(factory.getTransactionAdmin()).thenReturn(admin);
        DistributedTransaction tx = mock(DistributedTransaction.class);
        when(manager.start()).thenReturn(tx);

        Result row1 = mock(Result.class);
        when(row1.isNull(anyString())).thenReturn(false);
        when(row1.getText("product")).thenReturn("商品A");
        when(row1.getInt("qty")).thenReturn(3);

        Result row2 = mock(Result.class);
        when(row2.isNull(anyString())).thenReturn(false);
        when(row2.getText("product")).thenReturn("商品B");
        when(row2.getInt("qty")).thenReturn(1);

        when(tx.scan(any(Scan.class))).thenReturn(List.of(row1, row2));

        String body =
                buildDetailBody(
                        "grp1",
                        "default",
                        "order_items",
                        "order_id",
                        "ORD-001",
                        "product",
                        "productName",
                        "qty",
                        "quantity");
        when(ctx.body()).thenReturn(body);

        controller.resolve(ctx);

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode resp = MAPPER.readTree(captor.getValue());
        JsonNode resolvedGroup = resp.path("resolved").path("grp1");
        assertTrue(resolvedGroup.isArray(), "detail group should return array");
        assertEquals(2, resolvedGroup.size());
        assertEquals("商品A", resolvedGroup.get(0).path("productName").asText());
        assertEquals(3, resolvedGroup.get(0).path("quantity").asInt());
        assertEquals("商品B", resolvedGroup.get(1).path("productName").asText());
        assertTrue(resp.path("errors").path("grp1").isNull());
        verify(tx).commit();
    }

    // ── #144: per-row product lookup enrichment ────────────────────────────────

    /** Builds a Scan mock returning one detail row with a product_code column. */
    private DistributedTransaction mockDetailScanWithProductCode(String productCode)
            throws Exception {
        DistributedTransactionAdmin admin = mock(DistributedTransactionAdmin.class);
        TableMetadata meta =
                mockTableMetadata("order_id", DataType.TEXT, "product_code", DataType.TEXT);
        when(admin.getTableMetadata("default", "order_items")).thenReturn(meta);
        when(factory.getTransactionAdmin()).thenReturn(admin);
        DistributedTransaction tx = mock(DistributedTransaction.class);
        when(manager.start()).thenReturn(tx);
        Result row = mock(Result.class);
        when(row.isNull(anyString())).thenReturn(false);
        when(row.getText("product_code")).thenReturn(productCode);
        when(tx.scan(any(Scan.class))).thenReturn(List.of(row));
        return tx;
    }

    /**
     * Request body: detail group with a product_code field + a lookup relation to the product
     * master.
     */
    private String detailBodyWithLookup() {
        return """
            {"schema":{
               "groups":[{"id":"grp1","role":"detail","tableMeta":{"namespace":"default","tableName":"order_items"},
                 "fields":[{"id":"f0","key":"pk_key","dbColumnName":"order_id"},
                           {"id":"f1","key":"itemCode","dbColumnName":"product_code"}]}],
               "relations":[{"id":"rel1","name":"product","from":"grp1","to":"__productMaster__",
                 "on":{"fromColumn":"product_code","toColumn":"code"},"kind":"lookup"}]
             },
             "partitionKeys":{"grp1":{"order_id":"ORD-001"}}}
            """;
    }

    @Test
    void detailGroup_perRowProductLookup_enrichesRowWithPrefixedFields() throws Exception {
        String envelope = makeEnvelope("test-user", "default", "order_items");
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(envelope));
        mockDetailScanWithProductCode("W-001");

        // ProductController returns a product for code W-001.
        ProductController productCtrl = mock(ProductController.class);
        JsonNode product =
                MAPPER.readTree(
                        """
            {"id":"p1","code":"W-001","name":"ワイヤレスマウス","unitPrice":2980,
             "category":"周辺機器","taxType":"standard","stockCount":10,"unit":"個","manufacturer":"ACME","description":""}
            """);
        when(productCtrl.findByCode("W-001")).thenReturn(Optional.of(product));
        controller.setProductController(productCtrl);

        when(ctx.body()).thenReturn(detailBodyWithLookup());
        controller.resolve(ctx);

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode resp = MAPPER.readTree(captor.getValue());
        JsonNode row0 = resp.path("resolved").path("grp1").get(0);
        // The row keeps its own columns AND gains product_* fields from the lookup.
        assertEquals("W-001", row0.path("itemCode").asText());
        assertEquals("ワイヤレスマウス", row0.path("product_name").asText());
        assertEquals(2980, row0.path("product_unitPrice").asInt());
        assertEquals("周辺機器", row0.path("product_category").asText());
        assertTrue(resp.path("errors").path("grp1").isNull());
    }

    @Test
    void detailGroup_perRowProductLookup_missingProductMarksStaleWithoutError() throws Exception {
        String envelope = makeEnvelope("test-user", "default", "order_items");
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(envelope));
        mockDetailScanWithProductCode("GHOST");

        ProductController productCtrl = mock(ProductController.class);
        when(productCtrl.findByCode("GHOST")).thenReturn(Optional.empty());
        controller.setProductController(productCtrl);

        when(ctx.body()).thenReturn(detailBodyWithLookup());
        controller.resolve(ctx);

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode resp = MAPPER.readTree(captor.getValue());
        JsonNode row0 = resp.path("resolved").path("grp1").get(0);
        // Missing product → stale marker, not an error; the row still resolves.
        assertTrue(row0.path("product__stale").asBoolean());
        assertFalse(row0.has("product_name"));
        assertTrue(resp.path("errors").path("grp1").isNull());
    }

    @Test
    void detailGroup_emptyScanReturnsEmptyArray() throws Exception {
        String envelope = makeEnvelope("test-user", "default", "order_items");
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(envelope));

        DistributedTransactionAdmin admin = mock(DistributedTransactionAdmin.class);
        TableMetadata meta = mockTableMetadata("order_id", DataType.TEXT, "product", DataType.TEXT);
        when(admin.getTableMetadata("default", "order_items")).thenReturn(meta);
        when(factory.getTransactionAdmin()).thenReturn(admin);
        DistributedTransaction tx = mock(DistributedTransaction.class);
        when(manager.start()).thenReturn(tx);
        when(tx.scan(any(Scan.class))).thenReturn(List.of()); // empty result

        String body =
                buildDetailBody(
                        "grp1",
                        "default",
                        "order_items",
                        "order_id",
                        "NOT-EXIST",
                        "product",
                        "product");
        when(ctx.body()).thenReturn(body);

        controller.resolve(ctx);

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode resp = MAPPER.readTree(captor.getValue());
        JsonNode resolvedGroup = resp.path("resolved").path("grp1");
        assertTrue(resolvedGroup.isArray(), "empty scan should return empty array, not error");
        assertEquals(0, resolvedGroup.size());
        assertTrue(resp.path("errors").path("grp1").isNull());
    }

    @Test
    void detailGroup_scanRespectsColuOrderIndependently() throws Exception {
        // Validates name-based mapping for detail group — column order must not matter
        String envelope = makeEnvelope("test-user", "default", "order_items");
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(envelope));

        // Meta with columns in reversed order vs request field order
        DistributedTransactionAdmin admin = mock(DistributedTransactionAdmin.class);
        TableMetadata meta =
                mockTableMetadata(
                        "order_id", DataType.TEXT, "qty", DataType.INT, "product", DataType.TEXT);
        when(admin.getTableMetadata("default", "order_items")).thenReturn(meta);
        when(factory.getTransactionAdmin()).thenReturn(admin);
        DistributedTransaction tx = mock(DistributedTransaction.class);
        Result row = mock(Result.class);
        when(row.isNull(anyString())).thenReturn(false);
        when(row.getText("product")).thenReturn("商品X");
        when(row.getInt("qty")).thenReturn(99);
        when(tx.scan(any(Scan.class))).thenReturn(List.of(row));
        when(manager.start()).thenReturn(tx);

        // Request fields in different order than meta columns
        String body =
                buildDetailBody(
                        "grp1",
                        "default",
                        "order_items",
                        "order_id",
                        "ORD-1",
                        "product",
                        "name",
                        "qty",
                        "count");
        when(ctx.body()).thenReturn(body);

        controller.resolve(ctx);

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode resp = MAPPER.readTree(captor.getValue());
        JsonNode row0 = resp.path("resolved").path("grp1").get(0);
        assertEquals("商品X", row0.path("name").asText());
        assertEquals(99, row0.path("count").asInt());
    }

    @Test
    void mixedMasterAndDetail_bothResolvedCorrectly() throws Exception {
        // Setup template with both master and detail tables
        var envNode = MAPPER.createObjectNode().put("id", "tmpl-1").put("created_by", "test-user");
        var defNode = MAPPER.createObjectNode().put("id", "tmpl-1");
        var schemaNode = defNode.putObject("schema");
        var groupsArr = schemaNode.putArray("groups");
        groupsArr
                .addObject()
                .put("id", "master")
                .put("role", "master")
                .putObject("tableMeta")
                .put("namespace", "default")
                .put("tableName", "customers");
        groupsArr
                .addObject()
                .put("id", "detail")
                .put("role", "detail")
                .putObject("tableMeta")
                .put("namespace", "default")
                .put("tableName", "orders");
        envNode.set("definition", defNode);
        when(definitionsRepo.get("tmpl-1"))
                .thenReturn(Optional.of(MAPPER.writeValueAsString(envNode)));

        DistributedTransactionAdmin admin = mock(DistributedTransactionAdmin.class);
        TableMetadata custMeta = mockTableMetadata("cust_id", DataType.TEXT, "name", DataType.TEXT);
        TableMetadata ordMeta =
                mockTableMetadata("cust_id", DataType.TEXT, "product", DataType.TEXT);
        when(admin.getTableMetadata("default", "customers")).thenReturn(custMeta);
        when(admin.getTableMetadata("default", "orders")).thenReturn(ordMeta);
        when(factory.getTransactionAdmin()).thenReturn(admin);
        DistributedTransaction tx = mock(DistributedTransaction.class);

        Result custRow = mock(Result.class);
        when(custRow.isNull(anyString())).thenReturn(false);
        when(custRow.getText("name")).thenReturn("山田");
        when(tx.get(any(Get.class))).thenReturn(Optional.of(custRow));

        Result ordRow = mock(Result.class);
        when(ordRow.isNull(anyString())).thenReturn(false);
        when(ordRow.getText("product")).thenReturn("商品Z");
        when(tx.scan(any(Scan.class))).thenReturn(List.of(ordRow));

        when(manager.start()).thenReturn(tx);

        String body =
                """
                {"schema":{"groups":[
                  {"id":"master","role":"master","tableMeta":{"namespace":"default","tableName":"customers"},
                   "fields":[{"id":"f1","key":"custName","dbColumnName":"name"}]},
                  {"id":"detail","role":"detail","tableMeta":{"namespace":"default","tableName":"orders"},
                   "fields":[{"id":"f2","key":"productName","dbColumnName":"product"}]}
                ]},
                "partitionKeys":{"master":{"cust_id":"C001"},"detail":{"cust_id":"C001"}}}
                """
                        .trim();
        when(ctx.body()).thenReturn(body);

        controller.resolve(ctx);

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode resp = MAPPER.readTree(captor.getValue());
        // master → flat object
        assertFalse(resp.path("resolved").path("master").isArray(), "master should be flat object");
        assertEquals("山田", resp.path("resolved").path("master").path("custName").asText());
        // detail → array
        assertTrue(resp.path("resolved").path("detail").isArray(), "detail should be array");
        assertEquals(
                "商品Z", resp.path("resolved").path("detail").get(0).path("productName").asText());
    }

    // ── Detail body builder ────────────────────────────────────────────────────

    /** Build a resolve-bindings request body with one detail group. */
    private String buildDetailBody(
            String groupId,
            String namespace,
            String tableName,
            String pkCol,
            String pkVal,
            String... fieldPairs)
            throws Exception {
        var fieldsArr = new StringBuilder("[");
        fieldsArr.append(
                "{\"id\":\"f0\",\"key\":\"pk_key\",\"dbColumnName\":\"%s\"}".formatted(pkCol));
        for (int i = 0; i < fieldPairs.length; i += 2) {
            String dbCol = fieldPairs[i];
            String fieldKey = fieldPairs[i + 1];
            fieldsArr.append(
                    ",{\"id\":\"f%d\",\"key\":\"%s\",\"dbColumnName\":\"%s\"}"
                            .formatted(i + 1, fieldKey, dbCol));
        }
        fieldsArr.append("]");
        return """
               {"schema":{"groups":[{"id":"%s","role":"detail","tableMeta":{"namespace":"%s","tableName":"%s"},"fields":%s}]},
                "partitionKeys":{"%s":{"%s":"%s"}}}
               """
                .formatted(groupId, namespace, tableName, fieldsArr, groupId, pkCol, pkVal)
                .trim();
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

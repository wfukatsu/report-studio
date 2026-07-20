package com.report.server;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.scalar.db.api.DistributedTransactionAdmin;
import com.scalar.db.api.TableMetadata;
import com.scalar.db.exception.storage.ExecutionException;
import com.scalar.db.io.DataType;
import com.scalar.db.service.TransactionFactory;
import io.javalin.http.Context;
import io.javalin.http.ServiceUnavailableResponse;
import java.util.LinkedHashSet;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link ScalarDbCatalogController}.
 *
 * <p>Uses the hand-rolled Mockito {@link Context} pattern established by {@link
 * SchemaInferControllerTest}. No {@code JavalinTest}.
 */
class ScalarDbCatalogControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private TransactionFactory factory;
    private DistributedTransactionAdmin admin;
    private ScalarDbCatalogController controller;
    private Context ctx;
    private Object capturedJson;

    @BeforeEach
    void setUp() {
        factory = mock(TransactionFactory.class);
        admin = mock(DistributedTransactionAdmin.class);
        when(factory.getTransactionAdmin()).thenReturn(admin);

        controller = new ScalarDbCatalogController(factory);
        ctx = mock(Context.class);
        doAnswer(
                        inv -> {
                            capturedJson = inv.getArguments()[0];
                            return null;
                        })
                .when(ctx)
                .json(any());
    }

    // ── Happy path ───────────────────────────────────────────────────────────

    @Test
    void emptyScalarDb_returnsEmptyNamespacesList() throws Exception {
        when(admin.getNamespaceNames()).thenReturn(new LinkedHashSet<>());

        controller.getCatalog(ctx);

        JsonNode body = MAPPER.valueToTree(capturedJson);
        JsonNode namespaces = body.get("namespaces");
        assertNotNull(namespaces, "response must contain 'namespaces' key");
        assertEquals(0, namespaces.size());
    }

    @Test
    void happyPath_nestsNamespacesTablesColumns_withFullKeyClassification() throws Exception {
        when(admin.getNamespaceNames()).thenReturn(new LinkedHashSet<>(List.of("app")));
        when(admin.getNamespaceTableNames("app")).thenReturn(new LinkedHashSet<>(List.of("users")));

        // A table with 4 columns covering every key role:
        //   id    BIGINT  (partition key)
        //   seq   BIGINT  (clustering key)
        //   email TEXT    (secondary index)
        //   age   INT     (plain column — no keyType)
        TableMetadata meta = mock(TableMetadata.class);
        when(meta.getColumnNames())
                .thenReturn(new LinkedHashSet<>(List.of("id", "seq", "email", "age")));
        when(meta.getColumnDataType("id")).thenReturn(DataType.BIGINT);
        when(meta.getColumnDataType("seq")).thenReturn(DataType.BIGINT);
        when(meta.getColumnDataType("email")).thenReturn(DataType.TEXT);
        when(meta.getColumnDataType("age")).thenReturn(DataType.INT);
        when(meta.getPartitionKeyNames()).thenReturn(new LinkedHashSet<>(List.of("id")));
        when(meta.getClusteringKeyNames()).thenReturn(new LinkedHashSet<>(List.of("seq")));
        when(meta.getSecondaryIndexNames()).thenReturn(new LinkedHashSet<>(List.of("email")));
        when(admin.getTableMetadata("app", "users")).thenReturn(meta);

        controller.getCatalog(ctx);

        JsonNode body = MAPPER.valueToTree(capturedJson);
        JsonNode namespaces = body.get("namespaces");
        assertEquals(1, namespaces.size());

        JsonNode ns = namespaces.get(0);
        assertEquals("app", ns.get("name").asText());
        JsonNode tables = ns.get("tables");
        assertEquals(1, tables.size());

        JsonNode table = tables.get(0);
        assertEquals("users", table.get("name").asText());
        JsonNode columns = table.get("columns");
        assertEquals(4, columns.size());

        // Map columns by name for order-insensitive assertions.
        JsonNode idCol = findColumnByName(columns, "id");
        assertEquals(
                "BIGINT",
                idCol.get("type").asText(),
                "DataType enum must serialize as UPPERCASE name");
        assertEquals("partition", idCol.get("keyType").asText());

        JsonNode seqCol = findColumnByName(columns, "seq");
        assertEquals("BIGINT", seqCol.get("type").asText());
        assertEquals("clustering", seqCol.get("keyType").asText());

        JsonNode emailCol = findColumnByName(columns, "email");
        assertEquals("TEXT", emailCol.get("type").asText());
        assertEquals("index", emailCol.get("keyType").asText());

        // Plain column: MUST NOT contain "keyType" at all (not null, not "column" — absent)
        JsonNode ageCol = findColumnByName(columns, "age");
        assertEquals("INT", ageCol.get("type").asText());
        assertFalse(
                ageCol.has("keyType"),
                "plain columns must OMIT keyType entirely (not emit null or \"column\")");
    }

    @Test
    void multipleNamespacesAndTables_allIterated() throws Exception {
        when(admin.getNamespaceNames()).thenReturn(new LinkedHashSet<>(List.of("ns1", "ns2")));
        when(admin.getNamespaceTableNames("ns1"))
                .thenReturn(new LinkedHashSet<>(List.of("t1a", "t1b")));
        when(admin.getNamespaceTableNames("ns2")).thenReturn(new LinkedHashSet<>(List.of("t2a")));

        TableMetadata simpleMeta = mock(TableMetadata.class);
        when(simpleMeta.getColumnNames()).thenReturn(new LinkedHashSet<>(List.of("pk")));
        when(simpleMeta.getColumnDataType("pk")).thenReturn(DataType.TEXT);
        when(simpleMeta.getPartitionKeyNames()).thenReturn(new LinkedHashSet<>(List.of("pk")));
        when(simpleMeta.getClusteringKeyNames()).thenReturn(new LinkedHashSet<>());
        when(simpleMeta.getSecondaryIndexNames()).thenReturn(new LinkedHashSet<>());
        when(admin.getTableMetadata(any(String.class), any(String.class))).thenReturn(simpleMeta);

        controller.getCatalog(ctx);

        JsonNode body = MAPPER.valueToTree(capturedJson);
        JsonNode namespaces = body.get("namespaces");
        assertEquals(2, namespaces.size());

        int totalTables = 0;
        for (JsonNode ns : namespaces) totalTables += ns.get("tables").size();
        assertEquals(3, totalTables, "every table in every namespace must appear");
    }

    // ── Error paths ──────────────────────────────────────────────────────────

    @Test
    void adminThrowsExecutionException_mapsToServiceUnavailable() throws Exception {
        when(admin.getNamespaceNames()).thenThrow(new ExecutionException("connection refused"));

        assertThrows(
                ServiceUnavailableResponse.class,
                () -> controller.getCatalog(ctx),
                "ExecutionException must be translated to ServiceUnavailableResponse (503)");
    }

    @Test
    void adminThrowsGenericException_mapsToServiceUnavailable() throws Exception {
        // Defensive: any other runtime failure during admin work should also surface as 503
        // rather than a 500 — the root cause is "ScalarDB unreachable", not "bug in our code".
        when(admin.getNamespaceNames()).thenThrow(new RuntimeException("unexpected boom"));

        assertThrows(ServiceUnavailableResponse.class, () -> controller.getCatalog(ctx));
    }

    @Test
    void serviceUnavailable_doesNotLeakDriverDetails() throws Exception {
        // Security: the 503 message must NOT contain raw driver exception text
        // (which can include hostnames, JDBC URLs, or credentials).
        when(admin.getNamespaceNames())
                .thenThrow(
                        new ExecutionException(
                                "Connection refused: jdbc:mysql://internal-host:3306/prod?user=admin&password=secret"));

        ServiceUnavailableResponse ex =
                assertThrows(ServiceUnavailableResponse.class, () -> controller.getCatalog(ctx));

        // The exception message passed to ServiceUnavailableResponse must be
        // the generic string only — no JDBC URL, no hostname, no credentials.
        assertFalse(
                ex.getMessage().contains("jdbc"),
                "503 response must not leak JDBC connection details");
        assertFalse(
                ex.getMessage().contains("internal-host"),
                "503 response must not leak internal hostnames");
        assertFalse(
                ex.getMessage().contains("password"),
                "503 response must not leak credential strings");
        assertEquals("ScalarDb unreachable", ex.getMessage());
    }

    @Test
    void adminIsClosedViaTryWithResources() throws Exception {
        when(admin.getNamespaceNames()).thenReturn(new LinkedHashSet<>());

        controller.getCatalog(ctx);

        verify(admin, times(1)).close();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static JsonNode findColumnByName(JsonNode columns, String name) {
        for (JsonNode c : columns) {
            if (name.equals(c.get("name").asText())) return c;
        }
        fail("column not found: " + name);
        return null; // unreachable
    }
}

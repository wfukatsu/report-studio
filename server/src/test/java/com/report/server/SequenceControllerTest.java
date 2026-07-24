package com.report.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.report.server.auth.Principal;
import com.scalar.db.api.DistributedTransaction;
import com.scalar.db.api.DistributedTransactionManager;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * Unit tests for {@link SequenceController} — document auto-numbering (採番) config CRUD, including
 * the transactional counter-preserving config update (#207) and the ownership guard (#198). The
 * atomic increment ({@code nextAndStamp}) is covered by {@link DocumentNumberServiceTest} (#419).
 *
 * <p>Mocks {@link JsonBlobRepository} (Mockito inline mock maker) following the pattern of {@code
 * UserRepositoryTest}.
 */
class SequenceControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Principal ADMIN = new Principal("admin", "管理者", Set.of("admin", "user"));

    private JsonBlobRepository seqRepo;
    private JsonBlobRepository definitionsRepo;
    private DistributedTransactionManager txManager;
    private DistributedTransaction tx;
    private SequenceController controller;
    private Context ctx;

    /** Template envelope owned by the given user (empty = legacy/no owner). */
    private static String envelopeOwnedBy(String owner) {
        return "{\"id\":\"tpl_1\",\"created_by\":\"" + owner + "\"}";
    }

    @BeforeEach
    void setUp() throws Exception {
        seqRepo = mock(JsonBlobRepository.class);
        definitionsRepo = mock(JsonBlobRepository.class);
        txManager = mock(DistributedTransactionManager.class);
        tx = mock(DistributedTransaction.class);
        when(seqRepo.getTransactionManager()).thenReturn(txManager);
        when(txManager.start()).thenReturn(tx);

        controller = new SequenceController(seqRepo, definitionsRepo);

        ctx = mock(Context.class);
        when(ctx.pathParam("templateId")).thenReturn("tpl_1");
        when(ctx.attribute("principal")).thenReturn(ADMIN);
        // Default: the caller owns the template, so ownership guard (#198) lets requests through.
        when(definitionsRepo.get("tpl_1")).thenReturn(Optional.of(envelopeOwnedBy("admin")));
    }

    private JsonNode capturedJson() {
        ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
        verify(ctx).json(captor.capture());
        return MAPPER.valueToTree(captor.getValue());
    }

    private String capturedResult() {
        ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        return captor.getValue();
    }

    // ── GET /api/v1/sequences/{templateId} ───────────────────────────────────

    @Test
    void getConfig_unconfigured_returnsConfiguredFalse() throws Exception {
        when(seqRepo.get("tpl_1")).thenReturn(Optional.empty());

        controller.getConfig(ctx);

        assertEquals(false, capturedJson().get("configured").asBoolean());
    }

    @Test
    void getConfig_configured_returnsStoredJson() throws Exception {
        String stored = "{\"prefix\":\"INV-\",\"digits\":4,\"counter\":7}";
        when(seqRepo.get("tpl_1")).thenReturn(Optional.of(stored));

        controller.getConfig(ctx);

        verify(ctx).contentType("application/json");
        assertEquals(stored, capturedResult());
    }

    @Test
    void getConfig_invalidTemplateId_400() throws Exception {
        when(ctx.pathParam("templateId")).thenReturn("../etc/passwd");

        controller.getConfig(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(seqRepo, never()).get(anyString());
    }

    // ── Ownership guard (issue #198, IDOR) ─────────────────────────────────────

    @Test
    void getConfig_otherUsersTemplate_404_noSequenceRead() throws Exception {
        when(ctx.status(any(HttpStatus.class))).thenReturn(ctx);
        when(definitionsRepo.get("tpl_1")).thenReturn(Optional.of(envelopeOwnedBy("someone-else")));

        controller.getConfig(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
        verify(seqRepo, never()).get("tpl_1");
    }

    @Test
    void getConfig_unknownTemplate_404() throws Exception {
        when(ctx.status(any(HttpStatus.class))).thenReturn(ctx);
        when(definitionsRepo.get("tpl_1")).thenReturn(Optional.empty());

        controller.getConfig(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
        verify(seqRepo, never()).get("tpl_1");
    }

    @Test
    void putConfig_otherUsersTemplate_404_noWrite() throws Exception {
        when(ctx.status(any(HttpStatus.class))).thenReturn(ctx);
        when(definitionsRepo.get("tpl_1")).thenReturn(Optional.of(envelopeOwnedBy("someone-else")));
        when(ctx.body()).thenReturn("{\"prefix\":\"INV-\",\"digits\":4}");

        controller.putConfig(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
        verify(seqRepo, never()).putWithinTx(any(), anyString(), anyString());
    }

    // ── PUT /api/v1/sequences/{templateId} ───────────────────────────────────

    @Test
    void putConfig_anonymous_401() throws Exception {
        when(ctx.attribute("principal")).thenReturn(Principal.ANONYMOUS);

        controller.putConfig(ctx);

        verify(ctx).status(HttpStatus.UNAUTHORIZED);
        verify(seqRepo, never()).putWithinTx(any(), anyString(), anyString());
    }

    @Test
    void putConfig_noPrincipal_401() throws Exception {
        when(ctx.attribute("principal")).thenReturn(null);

        controller.putConfig(ctx);

        verify(ctx).status(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void putConfig_invalidJson_400() throws Exception {
        when(ctx.body()).thenReturn("{not json");

        controller.putConfig(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(seqRepo, never()).putWithinTx(any(), anyString(), anyString());
    }

    /** Captures the config JSON written within the transaction and commits (#207). */
    private JsonNode putConfigAndCaptureWrite() throws Exception {
        controller.putConfig(ctx);
        ArgumentCaptor<String> saved = ArgumentCaptor.forClass(String.class);
        verify(seqRepo).putWithinTx(eq(tx), eq("tpl_1"), saved.capture());
        verify(tx).commit();
        verify(seqRepo, never())
                .put(anyString(), anyString()); // non-transactional write must not be used
        return MAPPER.readTree(saved.getValue());
    }

    @Test
    void putConfig_createsConfigWithCounterInitialized() throws Exception {
        when(seqRepo.getWithinTx(tx, "tpl_1")).thenReturn(Optional.empty());
        when(ctx.body())
                .thenReturn(
                        "{\"prefix\":\"INV-\",\"suffix\":\"-X\",\"digits\":4,\"resetOn\":\"year\"}");

        JsonNode config = putConfigAndCaptureWrite();
        assertEquals("INV-", config.get("prefix").asText());
        assertEquals("-X", config.get("suffix").asText());
        assertEquals(4, config.get("digits").asInt());
        assertEquals("year", config.get("resetOn").asText());
        assertEquals(0, config.get("counter").asInt());
        assertEquals(0, config.get("resetYear").asInt());
    }

    @Test
    void putConfig_clampsDigitsBetween1And10() throws Exception {
        when(seqRepo.getWithinTx(tx, "tpl_1")).thenReturn(Optional.empty());
        when(ctx.body()).thenReturn("{\"digits\":99}");

        assertEquals(10, putConfigAndCaptureWrite().get("digits").asInt());
    }

    @Test
    void putConfig_invalidResetOn_storedAsNull() throws Exception {
        when(seqRepo.getWithinTx(tx, "tpl_1")).thenReturn(Optional.empty());
        when(ctx.body()).thenReturn("{\"resetOn\":\"month\"}");

        assertTrue(putConfigAndCaptureWrite().get("resetOn").isNull());
    }

    @Test
    void putConfig_preservesExistingCounter_readWithinTx() throws Exception {
        // The counter must be re-read inside the transaction so a concurrent nextAndStamp
        // increment cannot be clobbered by a stale value (#207).
        when(seqRepo.getWithinTx(tx, "tpl_1"))
                .thenReturn(Optional.of("{\"prefix\":\"OLD-\",\"counter\":42,\"resetYear\":2025}"));
        when(ctx.body()).thenReturn("{\"prefix\":\"NEW-\"}");

        JsonNode config = putConfigAndCaptureWrite();
        assertEquals("NEW-", config.get("prefix").asText());
        assertEquals(42, config.get("counter").asInt(), "counter must survive config updates");
    }
}

package com.report.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.scalar.db.api.DistributedTransaction;
import com.scalar.db.api.DistributedTransactionManager;
import com.scalar.db.exception.transaction.CommitConflictException;
import com.scalar.db.exception.transaction.CrudConflictException;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * Unit tests for {@link DocumentNumberService} — the atomic {@code nextAndStamp} increment,
 * including counter integrity, zero-padding, year reset and OCC retry behavior (moved from {@code
 * SequenceControllerTest} with the #419 extraction).
 *
 * <p>Mocks {@link JsonBlobRepository} (Mockito inline mock maker) following the pattern of {@code
 * UserRepositoryTest}.
 */
class DocumentNumberServiceTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private JsonBlobRepository seqRepo;
    private JsonBlobRepository responseRepo;
    private DistributedTransactionManager txManager;
    private DistributedTransaction tx;
    private DocumentNumberService service;

    @BeforeEach
    void setUp() throws Exception {
        seqRepo = mock(JsonBlobRepository.class);
        responseRepo = mock(JsonBlobRepository.class);
        txManager = mock(DistributedTransactionManager.class);
        tx = mock(DistributedTransaction.class);
        when(seqRepo.getTransactionManager()).thenReturn(txManager);
        when(txManager.start()).thenReturn(tx);

        service = new DocumentNumberService(seqRepo);
    }

    // ── nextAndStamp — 採番整合性 ────────────────────────────────────────────

    @Test
    void nextAndStamp_unconfigured_returnsNullWithoutTransaction() throws Exception {
        when(seqRepo.get("tpl_1")).thenReturn(Optional.empty());

        String result = service.nextAndStamp("tpl_1", responseRepo, "resp-1", "{}", "tpl_1");

        assertNull(result);
        verify(txManager, never()).start();
    }

    @Test
    void nextAndStamp_configWithoutFormatFields_returnsNull() throws Exception {
        // Only bookkeeping fields — not "configured" in the format sense
        when(seqRepo.get("tpl_1")).thenReturn(Optional.of("{\"counter\":3,\"resetYear\":0}"));

        String result = service.nextAndStamp("tpl_1", responseRepo, "resp-1", "{}", "tpl_1");

        assertNull(result);
        verify(txManager, never()).start();
    }

    @Test
    void nextAndStamp_incrementsCounterAndFormatsNumber() throws Exception {
        String config =
                "{\"prefix\":\"INV-\",\"suffix\":\"-T\",\"digits\":4,\"counter\":41,\"resetYear\":0}";
        when(seqRepo.get("tpl_1")).thenReturn(Optional.of(config));
        when(seqRepo.getWithinTx(tx, "tpl_1")).thenReturn(Optional.of(config));

        String docNumber =
                service.nextAndStamp("tpl_1", responseRepo, "resp-1", "{\"fields\":{}}", "tpl_1");

        assertEquals("INV-0042-T", docNumber);

        // Sequence counter persisted as 42 in the same TX
        ArgumentCaptor<String> savedSeq = ArgumentCaptor.forClass(String.class);
        verify(seqRepo).putWithinTx(eq(tx), eq("tpl_1"), savedSeq.capture());
        assertEquals(42, MAPPER.readTree(savedSeq.getValue()).get("counter").asInt());

        // Response stamped with documentNumber in the same TX
        ArgumentCaptor<String> savedResp = ArgumentCaptor.forClass(String.class);
        verify(responseRepo).putWithinTx(eq(tx), eq("resp-1"), savedResp.capture(), eq("tpl_1"));
        assertEquals(
                "INV-0042-T", MAPPER.readTree(savedResp.getValue()).get("documentNumber").asText());

        verify(tx).commit();
        verify(tx, never()).abort();
    }

    @Test
    void nextAndStamp_sequentialCallsProduceConsecutiveNumbers() throws Exception {
        // Simulate persistence: getWithinTx replays what the previous putWithinTx stored
        final String[] stored = {"{\"prefix\":\"NO-\",\"digits\":3,\"counter\":0,\"resetYear\":0}"};
        when(seqRepo.get("tpl_1")).thenAnswer(inv -> Optional.of(stored[0]));
        when(seqRepo.getWithinTx(any(), eq("tpl_1"))).thenAnswer(inv -> Optional.of(stored[0]));
        org.mockito.Mockito.doAnswer(
                        inv -> {
                            stored[0] = inv.getArgument(2);
                            return null;
                        })
                .when(seqRepo)
                .putWithinTx(any(), eq("tpl_1"), anyString());

        assertEquals("NO-001", service.nextAndStamp("tpl_1", responseRepo, "r1", "{}", "tpl_1"));
        assertEquals("NO-002", service.nextAndStamp("tpl_1", responseRepo, "r2", "{}", "tpl_1"));
        assertEquals("NO-003", service.nextAndStamp("tpl_1", responseRepo, "r3", "{}", "tpl_1"));
    }

    @Test
    void nextAndStamp_configDeletedInsideTx_abortsAndReturnsNull() throws Exception {
        when(seqRepo.get("tpl_1")).thenReturn(Optional.of("{\"prefix\":\"INV-\",\"counter\":1}"));
        when(seqRepo.getWithinTx(tx, "tpl_1")).thenReturn(Optional.empty());

        String result = service.nextAndStamp("tpl_1", responseRepo, "resp-1", "{}", "tpl_1");

        assertNull(result);
        verify(tx).abort();
        verify(tx, never()).commit();
    }

    @Test
    void nextAndStamp_yearReset_restartsCounterAndUpdatesResetYear() throws Exception {
        int currentYear = ZonedDateTime.now(ZoneId.of("Asia/Tokyo")).getYear();
        String config =
                "{\"prefix\":\"A-\",\"digits\":4,\"counter\":250,"
                        + "\"resetOn\":\"year\",\"resetYear\":"
                        + (currentYear - 1)
                        + "}";
        when(seqRepo.get("tpl_1")).thenReturn(Optional.of(config));
        when(seqRepo.getWithinTx(tx, "tpl_1")).thenReturn(Optional.of(config));

        String docNumber = service.nextAndStamp("tpl_1", responseRepo, "resp-1", "{}", "tpl_1");

        assertEquals("A-0001", docNumber, "counter must restart at 1 in a new year");
        ArgumentCaptor<String> savedSeq = ArgumentCaptor.forClass(String.class);
        verify(seqRepo).putWithinTx(eq(tx), eq("tpl_1"), savedSeq.capture());
        JsonNode saved = MAPPER.readTree(savedSeq.getValue());
        assertEquals(1, saved.get("counter").asInt());
        assertEquals(currentYear, saved.get("resetYear").asInt());
    }

    @Test
    void nextAndStamp_sameYear_noReset() throws Exception {
        int currentYear = ZonedDateTime.now(ZoneId.of("Asia/Tokyo")).getYear();
        String config =
                "{\"prefix\":\"A-\",\"digits\":4,\"counter\":250,"
                        + "\"resetOn\":\"year\",\"resetYear\":"
                        + currentYear
                        + "}";
        when(seqRepo.get("tpl_1")).thenReturn(Optional.of(config));
        when(seqRepo.getWithinTx(tx, "tpl_1")).thenReturn(Optional.of(config));

        assertEquals(
                "A-0251", service.nextAndStamp("tpl_1", responseRepo, "resp-1", "{}", "tpl_1"));
    }

    // ── OCC retry ────────────────────────────────────────────────────────────

    @Test
    void nextAndStamp_retriesOnCommitConflictAndSucceeds() throws Exception {
        String config = "{\"prefix\":\"INV-\",\"digits\":4,\"counter\":9,\"resetYear\":0}";
        DistributedTransaction tx2 = mock(DistributedTransaction.class);
        when(txManager.start()).thenReturn(tx, tx2);
        when(seqRepo.get("tpl_1")).thenReturn(Optional.of(config));
        when(seqRepo.getWithinTx(any(), eq("tpl_1"))).thenReturn(Optional.of(config));
        doThrow(new CommitConflictException("conflict", "tx-1")).when(tx).commit();

        String docNumber = service.nextAndStamp("tpl_1", responseRepo, "resp-1", "{}", "tpl_1");

        assertEquals("INV-0010", docNumber);
        verify(tx).abort();
        verify(tx2).commit();
    }

    @Test
    void nextAndStamp_retriesOnCrudConflictAndSucceeds() throws Exception {
        // A read-phase CrudConflictException is also a transient OCC conflict and must be retried.
        String config = "{\"prefix\":\"INV-\",\"digits\":4,\"counter\":9,\"resetYear\":0}";
        DistributedTransaction tx2 = mock(DistributedTransaction.class);
        when(txManager.start()).thenReturn(tx, tx2);
        when(seqRepo.get("tpl_1")).thenReturn(Optional.of(config));
        // First attempt: conflict during the in-tx read; second attempt: succeeds.
        when(seqRepo.getWithinTx(tx, "tpl_1"))
                .thenThrow(new CrudConflictException("conflict", "tx-1"));
        when(seqRepo.getWithinTx(tx2, "tpl_1")).thenReturn(Optional.of(config));

        String docNumber = service.nextAndStamp("tpl_1", responseRepo, "resp-1", "{}", "tpl_1");

        assertEquals("INV-0010", docNumber);
        verify(tx).abort();
        verify(tx2).commit();
    }

    @Test
    void nextAndStamp_exhaustsOccRetries_throws() throws Exception {
        String config = "{\"prefix\":\"INV-\",\"digits\":4,\"counter\":1,\"resetYear\":0}";
        when(seqRepo.get("tpl_1")).thenReturn(Optional.of(config));
        when(seqRepo.getWithinTx(any(), eq("tpl_1"))).thenReturn(Optional.of(config));
        doThrow(new CommitConflictException("conflict", "tx-1")).when(tx).commit();

        RuntimeException e =
                assertThrows(
                        RuntimeException.class,
                        () -> service.nextAndStamp("tpl_1", responseRepo, "resp-1", "{}", "tpl_1"));

        assertTrue(e.getMessage().contains("OCC conflict unresolved"));
        verify(tx, times(5)).commit();
        verify(tx, times(5)).abort();
    }

    @Test
    void nextAndStamp_nonConflictError_abortsAndRethrows() throws Exception {
        String config = "{\"prefix\":\"INV-\",\"digits\":4,\"counter\":1,\"resetYear\":0}";
        when(seqRepo.get("tpl_1")).thenReturn(Optional.of(config));
        when(seqRepo.getWithinTx(tx, "tpl_1")).thenReturn(Optional.of(config));
        doThrow(new IllegalStateException("boom"))
                .when(seqRepo)
                .putWithinTx(eq(tx), eq("tpl_1"), anyString());

        assertThrows(
                IllegalStateException.class,
                () -> service.nextAndStamp("tpl_1", responseRepo, "resp-1", "{}", "tpl_1"));

        verify(tx).abort();
        verify(tx, never()).commit();
    }
}

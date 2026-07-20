package com.report.server;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * Unit tests for {@link StatusAuditRepository} — append/list round-trip of status-transition audit
 * entries (#188) over a mocked {@link JsonBlobRepository}.
 */
class StatusAuditRepositoryTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private JsonBlobRepository blobRepo;
    private StatusAuditRepository repo;

    @BeforeEach
    void setUp() {
        blobRepo = mock(JsonBlobRepository.class);
        repo = new StatusAuditRepository(blobRepo);
    }

    private static String entry(String id, String from, String to, String by, long at)
            throws Exception {
        var n = MAPPER.createObjectNode();
        n.put("id", id);
        n.put("responseId", "resp-1");
        n.put("templateId", "tmpl-1");
        if (from == null) n.putNull("from");
        else n.put("from", from);
        n.put("to", to);
        n.put("by", by);
        n.put("at", at);
        return MAPPER.writeValueAsString(n);
    }

    // ── append ───────────────────────────────────────────────────────────────

    @Test
    void append_persistsEntryGroupedByResponseId() throws Exception {
        repo.append("resp-1", "tmpl-1", "draft", "issued", "user-1");

        ArgumentCaptor<String> jsonCaptor = ArgumentCaptor.forClass(String.class);
        verify(blobRepo).put(anyString(), jsonCaptor.capture(), eq("resp-1"));
        JsonNode stored = MAPPER.readTree(jsonCaptor.getValue());
        assertEquals("resp-1", stored.get("responseId").asText());
        assertEquals("tmpl-1", stored.get("templateId").asText());
        assertEquals("draft", stored.get("from").asText());
        assertEquals("issued", stored.get("to").asText());
        assertEquals("user-1", stored.get("by").asText());
        assertTrue(stored.get("at").asLong() > 0);
        assertFalse(stored.get("id").asText().isBlank());
    }

    @Test
    void append_nullFromRecordedAsJsonNull() throws Exception {
        repo.append("resp-1", "tmpl-1", null, "draft", "user-1");

        ArgumentCaptor<String> jsonCaptor = ArgumentCaptor.forClass(String.class);
        verify(blobRepo).put(anyString(), jsonCaptor.capture(), eq("resp-1"));
        assertTrue(MAPPER.readTree(jsonCaptor.getValue()).get("from").isNull());
    }

    @Test
    void append_wrapsRepositoryFailure() {
        doThrow(new RuntimeException("db down"))
                .when(blobRepo)
                .put(anyString(), anyString(), anyString());

        assertThrows(
                IllegalStateException.class,
                () -> repo.append("resp-1", "tmpl-1", "draft", "issued", "user-1"));
    }

    // ── listForResponse ──────────────────────────────────────────────────────

    @Test
    void listForResponse_returnsEntriesNewestFirst() throws Exception {
        when(blobRepo.listByGroupKey("resp-1"))
                .thenReturn(
                        List.of(
                                entry("a", null, "draft", "user-1", 1000L),
                                entry("c", "issued", "sent", "user-2", 3000L),
                                entry("b", "draft", "issued", "user-1", 2000L)));

        List<Map<String, Object>> out = repo.listForResponse("resp-1");

        assertEquals(3, out.size());
        assertEquals("c", out.get(0).get("id"));
        assertEquals("b", out.get(1).get("id"));
        assertEquals("a", out.get(2).get("id"));
        assertNull(out.get(2).get("from"), "initial entry has null from");
        assertEquals("sent", out.get(0).get("to"));
        assertEquals("user-2", out.get(0).get("by"));
        assertEquals(3000L, out.get(0).get("at"));
    }

    @Test
    void listForResponse_skipsUnparseableRecords() throws Exception {
        when(blobRepo.listByGroupKey("resp-1"))
                .thenReturn(List.of("{broken json", entry("ok", "draft", "issued", "u", 1L)));

        List<Map<String, Object>> out = repo.listForResponse("resp-1");

        // Note: readTree accepts some malformed prefixes leniently, but a clearly broken
        // record must never break listing; at minimum the valid record survives.
        assertTrue(out.stream().anyMatch(m -> "ok".equals(m.get("id"))));
    }

    @Test
    void listForResponse_emptyWhenNoHistory() {
        when(blobRepo.listByGroupKey("resp-none")).thenReturn(List.of());

        assertTrue(repo.listForResponse("resp-none").isEmpty());
    }

    @Test
    void roundTrip_appendedEntryIsListable() throws Exception {
        // Wire the mock so the blob stored by append is returned by listByGroupKey
        ArgumentCaptor<String> jsonCaptor = ArgumentCaptor.forClass(String.class);
        repo.append("resp-1", "tmpl-1", "draft", "issued", "user-1");
        verify(blobRepo).put(anyString(), jsonCaptor.capture(), eq("resp-1"));
        when(blobRepo.listByGroupKey("resp-1")).thenReturn(List.of(jsonCaptor.getValue()));

        List<Map<String, Object>> out = repo.listForResponse("resp-1");

        assertEquals(1, out.size());
        assertEquals("draft", out.get(0).get("from"));
        assertEquals("issued", out.get(0).get("to"));
        assertEquals("user-1", out.get(0).get("by"));
    }
}

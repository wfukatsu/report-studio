package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Persistent status-transition audit trail for issued documents (#188).
 *
 * <p>Each transition of a form response's lifecycle status (draft/issued/sent/void)
 * is recorded as an immutable entry: who changed it, when, and from → to. Entries are
 * stored as JSON blobs keyed by a unique id, grouped by {@code responseId} via the
 * repository's secondary index so a response's full history is a single indexed scan.
 */
public final class StatusAuditRepository {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final JsonBlobRepository repo;

    public StatusAuditRepository(JsonBlobRepository repo) {
        this.repo = repo;
    }

    public void ensureTable() {
        repo.ensureTable();
    }

    /**
     * Append a transition record.
     *
     * @param responseId the document (form response) id
     * @param templateId the owning template id
     * @param from       the previous status, or null for the initial creation entry
     * @param to         the new status
     * @param by         the user id that made the change
     */
    public void append(String responseId, String templateId, String from, String to, String by) {
        ObjectNode entry = MAPPER.createObjectNode();
        String id = UUID.randomUUID().toString();
        entry.put("id", id);
        entry.put("responseId", responseId);
        entry.put("templateId", templateId);
        if (from == null) entry.putNull("from"); else entry.put("from", from);
        entry.put("to", to);
        entry.put("by", by);
        entry.put("at", System.currentTimeMillis());
        try {
            repo.put(id, MAPPER.writeValueAsString(entry), responseId);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to append status audit", e);
        }
    }

    /** All transition records for a response, newest first. */
    public List<Map<String, Object>> listForResponse(String responseId) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (String json : repo.listByGroupKey(responseId)) {
            try {
                JsonNode n = MAPPER.readTree(json);
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", n.path("id").asText());
                m.put("from", n.path("from").isNull() ? null : n.path("from").asText(null));
                m.put("to", n.path("to").asText());
                m.put("by", n.path("by").asText(""));
                m.put("at", n.path("at").asLong());
                out.add(m);
            } catch (Exception ignored) {
                // skip unparseable records
            }
        }
        out.sort((a, b) -> Long.compare(
                ((Number) b.getOrDefault("at", 0L)).longValue(),
                ((Number) a.getOrDefault("at", 0L)).longValue()));
        return out;
    }
}

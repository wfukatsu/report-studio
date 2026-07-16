package com.report.server;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class TemplateEnvelopeTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    // ── unwrap (lenient: PUT boundary) ─────────────────────────────────────────

    @Test
    void unwrap_acceptsCanonicalV2Envelope() throws Exception {
        var root = MAPPER.readTree("{\"formatVersion\":2,\"definition\":{\"id\":\"t1\"}}");
        var result = TemplateEnvelope.unwrap(root);
        assertFalse(result.isError());
        assertEquals("t1", result.definition().path("id").asText());
    }

    @Test
    void unwrap_acceptsBareDefinitionAsDeprecatedForm() throws Exception {
        var root = MAPPER.readTree("{\"id\":\"t1\",\"pages\":[]}");
        var result = TemplateEnvelope.unwrap(root);
        assertFalse(result.isError());
        assertEquals("t1", result.definition().path("id").asText());
    }

    @Test
    void unwrap_migratesV1SchemaMarker() throws Exception {
        var root = MAPPER.readTree("{\"$schema\":\"report-definition/v1\",\"id\":\"t1\",\"pages\":[]}");
        var result = TemplateEnvelope.unwrap(root);
        assertFalse(result.isError());
        assertEquals("t1", result.definition().path("id").asText());
        assertFalse(result.definition().has("$schema"), "$schema marker must be stripped");
    }

    @Test
    void unwrap_rejectsNewerFormatVersion() throws Exception {
        var root = MAPPER.readTree("{\"formatVersion\":3,\"definition\":{}}");
        var result = TemplateEnvelope.unwrap(root);
        assertTrue(result.isError());
        assertTrue(result.error().contains("Unsupported format version: 3"));
    }

    @Test
    void unwrap_rejectsNonIntegerFormatVersion() throws Exception {
        var root = MAPPER.readTree("{\"formatVersion\":\"2\",\"definition\":{}}");
        var result = TemplateEnvelope.unwrap(root);
        assertTrue(result.isError());
        assertTrue(result.error().contains("must be an integer"));
    }

    @Test
    void unwrap_rejectsEnvelopeWithoutDefinition() throws Exception {
        var root = MAPPER.readTree("{\"formatVersion\":2}");
        var result = TemplateEnvelope.unwrap(root);
        assertTrue(result.isError());
        assertTrue(result.error().contains("definition"));
    }

    @Test
    void unwrap_rejectsUnknownSchemaMarker() throws Exception {
        var root = MAPPER.readTree("{\"$schema\":\"unknown/v99\",\"id\":\"t1\"}");
        var result = TemplateEnvelope.unwrap(root);
        assertTrue(result.isError());
        assertTrue(result.error().contains("Unsupported schema"));
    }

    @Test
    void unwrap_rejectsNonObjectBody() throws Exception {
        var root = MAPPER.readTree("[1,2,3]");
        var result = TemplateEnvelope.unwrap(root);
        assertTrue(result.isError());
    }

    // ── unwrapStrict (import boundary) ─────────────────────────────────────────

    @Test
    void unwrapStrict_rejectsBareDefinition() throws Exception {
        var root = MAPPER.readTree("{\"id\":\"t1\",\"pages\":[]}");
        var result = TemplateEnvelope.unwrapStrict(root);
        assertTrue(result.isError());
        assertTrue(result.error().contains("Unsupported format version: 0"));
    }

    @Test
    void unwrapStrict_acceptsCanonicalEnvelope() throws Exception {
        var root = MAPPER.readTree("{\"formatVersion\":2,\"definition\":{\"id\":\"t1\"}}");
        var result = TemplateEnvelope.unwrapStrict(root);
        assertFalse(result.isError());
    }

    @Test
    void unwrapStrict_acceptsV1SchemaMarker() throws Exception {
        var root = MAPPER.readTree("{\"$schema\":\"report-definition/v1\",\"id\":\"t1\",\"pages\":[]}");
        var result = TemplateEnvelope.unwrapStrict(root);
        assertFalse(result.isError());
        assertEquals("t1", result.definition().path("id").asText());
    }
}

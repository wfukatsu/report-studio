package com.report.server;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class V2ResponseExportControllerTest {

    // ── CSV formula injection prevention ─────────────────────────────────────

    @Test
    void escapeCsvField_nullReturnsEmpty() {
        assertEquals("\"\"", V2ResponseExportController.escapeCsvField(null));
    }

    @Test
    void escapeCsvField_normalValueQuoted() {
        assertEquals("\"hello\"", V2ResponseExportController.escapeCsvField("hello"));
    }

    @Test
    void escapeCsvField_prefixesEqualsSign() {
        String result = V2ResponseExportController.escapeCsvField("=SUM(A1)");
        assertTrue(result.startsWith("\"'="), "Should prefix = with single quote");
    }

    @Test
    void escapeCsvField_prefixesPlusSign() {
        String result = V2ResponseExportController.escapeCsvField("+cmd");
        assertTrue(result.startsWith("\"'"), "Should prefix + with single quote");
    }

    @Test
    void escapeCsvField_prefixesMinusSign() {
        String result = V2ResponseExportController.escapeCsvField("-1+1");
        assertTrue(result.startsWith("\"'"), "Should prefix - with single quote");
    }

    @Test
    void escapeCsvField_prefixesAtSign() {
        String result = V2ResponseExportController.escapeCsvField("@user");
        assertTrue(result.startsWith("\"'"), "Should prefix @ with single quote");
    }

    @Test
    void escapeCsvField_prefixesPipeChar() {
        String result = V2ResponseExportController.escapeCsvField("|pipe");
        assertTrue(result.startsWith("\"'"), "Should prefix | with single quote");
    }

    @Test
    void escapeCsvField_escapesEmbeddedQuotes() {
        String result = V2ResponseExportController.escapeCsvField("say \"hello\"");
        assertEquals("\"say \"\"hello\"\"\"", result);
    }

    @Test
    void escapeCsvField_removesNullBytes() {
        String result = V2ResponseExportController.escapeCsvField("val\u0000ue");
        assertFalse(result.contains("\u0000"), "Should remove null bytes");
        assertTrue(result.contains("value"), "Should preserve other chars");
    }

    @Test
    void escapeCsvField_emptyStringReturnsQuoted() {
        assertEquals("\"\"", V2ResponseExportController.escapeCsvField(""));
    }
}

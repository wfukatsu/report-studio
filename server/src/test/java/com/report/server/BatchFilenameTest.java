package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

/** Unit tests for the batch output filename templating (#194). */
class BatchFilenameTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static ObjectNode data() {
        ObjectNode d = MAPPER.createObjectNode();
        d.put("name", "評価商事");
        ObjectNode customer = d.putObject("customer");
        customer.put("name", "山田太郎");
        return d;
    }

    @Test
    void nullTemplate_fallsBackToSeqAndDate() {
        assertEquals(
                "003_20260720.pdf",
                BatchPdfController.buildFilename(null, "003", "20260720", "", "", data()));
    }

    @Test
    void expandsBuiltInTokens() {
        assertEquals(
                "INV-0007_issued.pdf",
                BatchPdfController.buildFilename(
                        "{documentNo}_{status}.pdf",
                        "003",
                        "20260720",
                        "INV-0007",
                        "issued",
                        data()));
    }

    @Test
    void expandsFlatAndNestedDataFields() {
        assertEquals(
                "評価商事_山田太郎.pdf",
                BatchPdfController.buildFilename(
                        "{name}_{customer.name}.pdf", "001", "20260720", "", "", data()));
    }

    @Test
    void unknownTokensResolveEmptyAndCollapse() {
        // {missing} → "" ; leading/trailing/duplicate underscores collapse
        assertEquals(
                "A.pdf",
                BatchPdfController.buildFilename(
                        "{missing}_A_{missing}.pdf", "001", "20260720", "", "", data()));
    }

    @Test
    void appendsPdfExtensionWhenMissing() {
        assertTrue(
                BatchPdfController.buildFilename("{seq}", "005", "20260720", "", "", data())
                        .endsWith(".pdf"));
    }

    @Test
    void sanitizesPathSeparatorsAndUnsafeChars() {
        String out =
                BatchPdfController.buildFilename(
                        "{name}", "001", "20260720", "", "", jsonWith("name", "a/b:c*d"));
        assertFalse(out.contains("/"));
        assertFalse(out.contains(":"));
        assertFalse(out.contains("*"));
        assertTrue(out.endsWith(".pdf"));
    }

    @Test
    void sanitizeFilename_stripsTrailingDots() {
        assertEquals("abc", BatchPdfController.sanitizeFilename("abc..."));
    }

    private static ObjectNode jsonWith(String key, String value) {
        ObjectNode n = MAPPER.createObjectNode();
        n.put(key, value);
        return n;
    }
}

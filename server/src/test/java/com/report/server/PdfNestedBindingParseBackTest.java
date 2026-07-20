package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.report.server.testsupport.PdfProbe;
import java.io.IOException;
import org.junit.jupiter.api.Test;

/**
 * Parse-back tests for dot-notation data binding (frontend parity): {@code fieldKey:
 * "document.documentNo"} must traverse nested formData objects the way the designer's resolveField
 * does.
 */
class PdfNestedBindingParseBackTest {

    private static String json(String fieldKey, String formData) {
        return """
            {"templates":[{
              "id":"t1","name":"Nested",
              "sections":[{
                "id":"s1","type":"free","y":0,"height":100,
                "elements":[
                  {"id":"df1","kind":"dataField","fieldKey":"%s",
                   "frame":{"x":10,"y":10,"width":120,"height":10,"rotation":0},
                   "props":{"fontSize":10}}
                ]
              }]
            }],
            "_formData":%s}"""
                .formatted(fieldKey, formData);
    }

    @Test
    void dotNotationKey_traversesNestedObjects() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.render(
                                json(
                                        "document.documentNo",
                                        "{\"document\":{\"documentNo\":\"QT-2026-0042\"}}")));
        assertTrue(probe.pageContains(0, "QT-2026-0042"), probe.pageText(0));
    }

    @Test
    void flatKey_stillResolvesDirectly() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.render(json("documentNo", "{\"documentNo\":\"FLAT-001\"}")));
        assertTrue(probe.pageContains(0, "FLAT-001"), probe.pageText(0));
    }

    @Test
    void flatKeyContainingDot_winsOverTraversal() throws IOException {
        // Legacy projections may carry literal dotted keys — exact match first
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.render(
                                json("a.b", "{\"a.b\":\"EXACT\",\"a\":{\"b\":\"NESTED\"}}")));
        assertTrue(probe.pageContains(0, "EXACT"), probe.pageText(0));
    }

    @Test
    void unresolvedPath_rendersNothing() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.render(
                                json("document.missing", "{\"document\":{\"documentNo\":\"X\"}}")));
        assertFalse(probe.pageContains(0, "X"), probe.pageText(0));
    }
}

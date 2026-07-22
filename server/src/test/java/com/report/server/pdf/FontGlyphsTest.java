package com.report.server.pdf;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import java.util.TreeSet;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;

/** #329 Phase 5: unencodable glyphs are dropped to whitespace and reported (not silent). */
class FontGlyphsTest {

    // Helvetica (WinAnsi) covers Latin but has no Japanese/other-script glyphs — a stand-in for
    // "font that can't encode script X" without loading the embedded CJK font.
    private static final PDFont HELVETICA = new PDType1Font(Standard14Fonts.FontName.HELVETICA);

    @Test
    void encodableTextPassesThroughUnchanged() {
        FontGlyphs.SanitizeResult r = FontGlyphs.sanitize(HELVETICA, "Invoice #42");
        assertEquals("Invoice #42", r.text());
        assertFalse(r.hasDropped());
        assertTrue(r.droppedCodePoints().isEmpty());
    }

    @Test
    void unencodableGlyphsBecomeWhitespaceAndAreReported() {
        FontGlyphs.SanitizeResult r = FontGlyphs.sanitize(HELVETICA, "AB中C");
        assertEquals("AB C", r.text());
        assertTrue(r.hasDropped());
        assertEquals(1, r.droppedCodePoints().size());
        assertTrue(r.droppedCodePoints().contains(0x4E2D)); // 中
    }

    @Test
    void reportsDistinctDroppedCodePoints() {
        FontGlyphs.SanitizeResult r = FontGlyphs.sanitize(HELVETICA, "가나가"); // Hangul, one repeated
        assertEquals("   ", r.text());
        assertEquals(2, r.droppedCodePoints().size()); // 가(AC00), 나(B098) — distinct
    }

    @Test
    void handlesEmptyAndNull() {
        assertEquals("", FontGlyphs.sanitize(HELVETICA, "").text());
        assertFalse(FontGlyphs.sanitize(HELVETICA, "").hasDropped());
        assertEquals("", FontGlyphs.sanitize(HELVETICA, null).text());
        assertFalse(FontGlyphs.sanitize(HELVETICA, null).hasDropped());
    }

    @Test
    void summarizeFormatsAndCapsTheList() {
        TreeSet<Integer> cps = new TreeSet<>(List.of(0x4E2D, 0xAC00, 0x0E01));
        assertEquals("U+0E01, U+4E2D, U+AC00", FontGlyphs.summarize(cps, 10));
        assertEquals("U+0E01 (+2 more)", FontGlyphs.summarize(cps, 1));
    }
}

package com.report.server.pdf;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

/** Serif-family resolution for {@link FontProvider#isSerifFamily} (#317). */
class FontProviderSerifTest {

    @Test
    void genericSerifKeywordMapsToSerif() {
        assertTrue(FontProvider.isSerifFamily("serif"));
    }

    @Test
    void sansSerifKeywordStaysSans() {
        assertFalse(FontProvider.isSerifFamily("sans-serif"));
        assertFalse(FontProvider.isSerifFamily("Noto Sans JP"));
    }

    @Test
    void namedSerifFamiliesMapToSerif() {
        assertTrue(FontProvider.isSerifFamily("Noto Serif JP"));
        assertTrue(FontProvider.isSerifFamily("Yu Mincho"));
        assertTrue(FontProvider.isSerifFamily("MS Mincho"));
        assertTrue(FontProvider.isSerifFamily("BIZ UDPMincho"));
        assertTrue(FontProvider.isSerifFamily("游明朝"));
    }

    @Test
    void nullAndOthersStaySans() {
        assertFalse(FontProvider.isSerifFamily(null));
        assertFalse(FontProvider.isSerifFamily("monospace"));
        assertFalse(FontProvider.isSerifFamily("Meiryo"));
    }
}

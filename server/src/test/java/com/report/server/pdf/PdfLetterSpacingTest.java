package com.report.server.pdf;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;

/** Letter-spacing–aware width math in {@link PdfUtils} (#319). */
class PdfLetterSpacingTest {

    private static final PDType1Font HELVETICA =
            new PDType1Font(Standard14Fonts.FontName.HELVETICA);

    @Test
    void wrapTextBreaksEarlierWithCharSpacing() {
        // Width that fits the whole string without spacing…
        String text = "aaaaaaaaaa"; // 10 chars
        float fontSize = 10f;
        float noSpacingWidth = safeWidth(text, fontSize);
        List<String> without = PdfUtils.wrapText(text, HELVETICA, fontSize, noSpacingWidth + 1f);
        assertEquals(1, without.size());

        // …but wraps once spacing inflates the line width
        List<String> with = PdfUtils.wrapText(text, HELVETICA, fontSize, noSpacingWidth + 1f, 5f);
        assertTrue(with.size() > 1, "spacing must consume width and force a wrap");
    }

    @Test
    void wrapTextWithZeroSpacingMatchesLegacyOverload() {
        String text = "hello world example text";
        for (float w : new float[] {30f, 60f, 200f}) {
            assertEquals(
                    PdfUtils.wrapText(text, HELVETICA, 10f, w),
                    PdfUtils.wrapText(text, HELVETICA, 10f, w, 0f));
        }
    }

    @Test
    void truncateToWidthAccountsForSpacing() {
        String text = "abcdefghij";
        float fontSize = 10f;
        float full = safeWidth(text, fontSize);
        assertEquals(text, PdfUtils.truncateToWidth(text, HELVETICA, fontSize, full + 1f));
        String truncated = PdfUtils.truncateToWidth(text, HELVETICA, fontSize, full + 1f, 5f);
        assertTrue(
                truncated.length() < text.length(),
                "spacing must consume width and force truncation");
    }

    private static float safeWidth(String s, float fontSize) {
        try {
            return HELVETICA.getStringWidth(s) / 1000 * fontSize;
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}

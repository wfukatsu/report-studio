package com.report.server.pdf;

import java.util.Collections;
import java.util.SortedSet;
import java.util.TreeSet;
import org.apache.pdfbox.pdmodel.font.PDFont;

/**
 * Drops code points a PDF font cannot encode so PDFBox {@code showText} never throws mid-render.
 *
 * <p><b>Font coverage strategy (#329 Phase 5).</b> Report PDFs embed Noto Sans/Serif JP, which
 * cover Latin (including English) and Japanese. Text in other scripts (Hangul, Simplified Chinese,
 * Thai, …) has no glyph in these fonts and is replaced with whitespace. Callers should log a WARN
 * (see {@link SanitizeResult#hasDropped()}) so the gap is visible in operations instead of a silent
 * blank — the missing-glyph handling this class centralizes was previously silent. Adding Noto Sans
 * SC/KR (etc.) is a future option, gated on the embedded-font size increase it would add to every
 * generated PDF.
 */
public final class FontGlyphs {

    private FontGlyphs() {}

    /** Sanitized text plus the distinct code points that had no glyph (empty set when none). */
    public record SanitizeResult(String text, SortedSet<Integer> droppedCodePoints) {
        public boolean hasDropped() {
            return !droppedCodePoints.isEmpty();
        }
    }

    /**
     * Return {@code text} unchanged when the font can encode all of it; otherwise replace each
     * unencodable code point with a space and report which ones were dropped.
     */
    public static SanitizeResult sanitize(PDFont font, String text) {
        if (text == null || text.isEmpty()) {
            return new SanitizeResult(text == null ? "" : text, Collections.emptySortedSet());
        }
        try {
            font.getStringWidth(text);
            return new SanitizeResult(text, Collections.emptySortedSet());
        } catch (Exception e) {
            StringBuilder sb = new StringBuilder(text.length());
            SortedSet<Integer> dropped = new TreeSet<>();
            text.codePoints()
                    .forEach(
                            cp -> {
                                String ch = new String(Character.toChars(cp));
                                try {
                                    font.getStringWidth(ch);
                                    sb.append(ch);
                                } catch (Exception ignored) {
                                    sb.append(' ');
                                    dropped.add(cp);
                                }
                            });
            return new SanitizeResult(sb.toString(), dropped);
        }
    }

    /** Compact {@code "U+AC00, U+4E2D (+N more)"} summary for logs; lists at most {@code max}. */
    public static String summarize(SortedSet<Integer> codePoints, int max) {
        StringBuilder sb = new StringBuilder();
        int i = 0;
        for (int cp : codePoints) {
            if (i == max) {
                sb.append(" (+").append(codePoints.size() - max).append(" more)");
                break;
            }
            if (i > 0) sb.append(", ");
            sb.append(String.format("U+%04X", cp));
            i++;
        }
        return sb.toString();
    }
}

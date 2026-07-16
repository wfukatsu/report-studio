package com.report.server.pdf;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Provides PDF fonts with JVM-level byte caching.
 * Font bytes are loaded once at class initialization;
 * PDFont instances are created per-document (required for subsetting).
 */
public final class FontProvider {

    private static final Logger log = LoggerFactory.getLogger(FontProvider.class);
    private static final byte[] NOTO_SANS_JP_BYTES;
    private static final byte[] NOTO_SANS_JP_BOLD_BYTES;
    private static final byte[] NOTO_SERIF_JP_BYTES;
    private static final boolean CJK_AVAILABLE;
    private static final boolean CJK_BOLD_AVAILABLE;

    static {
        byte[] sansBytes = null;
        try (InputStream is = FontProvider.class.getResourceAsStream("/fonts/NotoSansJP-Regular.ttf")) {
            if (is != null) {
                sansBytes = is.readAllBytes();
                log.info("Loaded Noto Sans JP font ({} bytes)", sansBytes.length);
            } else {
                log.warn("Noto Sans JP font not found on classpath — Japanese text will not render correctly");
            }
        } catch (IOException e) {
            log.warn("Failed to load Noto Sans JP font: {}", e.getMessage());
        }
        NOTO_SANS_JP_BYTES = sansBytes;
        CJK_AVAILABLE = sansBytes != null;

        // Real Bold weight (OFL) — a true bold face for Japanese, replacing the
        // stroke-widened synthetic bold when present (issue #56)
        byte[] boldBytes = null;
        try (InputStream is = FontProvider.class.getResourceAsStream("/fonts/NotoSansJP-Bold.ttf")) {
            if (is != null) {
                boldBytes = is.readAllBytes();
                log.info("Loaded Noto Sans JP Bold font ({} bytes)", boldBytes.length);
            } else {
                log.info("Noto Sans JP Bold font not found — bold falls back to synthetic (stroke)");
            }
        } catch (IOException e) {
            log.warn("Failed to load Noto Sans JP Bold font: {}", e.getMessage());
        }
        NOTO_SANS_JP_BOLD_BYTES = boldBytes;
        CJK_BOLD_AVAILABLE = boldBytes != null;

        byte[] serifBytes = null;
        try (InputStream is = FontProvider.class.getResourceAsStream("/fonts/NotoSerifJP-Regular.otf")) {
            if (is != null) {
                serifBytes = is.readAllBytes();
                log.info("Loaded Noto Serif JP font ({} bytes)", serifBytes.length);
            } else {
                log.info("Noto Serif JP font not found — serif text will fall back to sans-serif");
            }
        } catch (IOException e) {
            log.warn("Failed to load Noto Serif JP font: {}", e.getMessage());
        }
        NOTO_SERIF_JP_BYTES = serifBytes;
    }

    private FontProvider() {}

    /** Check if CJK font is available */
    public static boolean isCjkAvailable() {
        return CJK_AVAILABLE;
    }

    /**
     * Get a font for the given document.
     * Uses Noto Sans JP if available, falls back to Helvetica.
     * Font instances are cached per document in the provided cache map.
     *
     * @param doc       the PDF document (font is bound to document for subsetting)
     * @param fontCache per-document cache — pass the same map for all calls within one render()
     * @return a font suitable for Japanese text
     */
    public static PDFont getFont(PDDocument doc, Map<String, PDFont> fontCache) {
        return fontCache.computeIfAbsent("regular", k -> loadFont(doc));
    }

    /**
     * Get a bold font variant. Uses the embedded Noto Sans JP Bold face when
     * available (issue #56); otherwise falls back to the regular CJK font
     * (callers may apply synthetic bold — see {@link #isSyntheticBold}) or
     * Helvetica-Bold when no CJK font is present.
     */
    public static PDFont getBoldFont(PDDocument doc, Map<String, PDFont> fontCache) {
        return fontCache.computeIfAbsent("bold", k -> {
            if (CJK_BOLD_AVAILABLE) {
                try {
                    return PDType0Font.load(doc, new ByteArrayInputStream(NOTO_SANS_JP_BOLD_BYTES), true);
                } catch (IOException e) {
                    log.warn("Failed to load Bold CJK font, falling back: {}", e.getMessage());
                }
            }
            if (CJK_AVAILABLE) return loadCjkFont(doc);
            return new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
        });
    }

    /**
     * Whether a bold request for {@code fontFamily} resolves to a face without a
     * real bold weight, so the caller should stroke-widen glyphs (synthetic
     * bold). True for bold serif (no serif bold bundled) and for bold sans when
     * the Bold face is unavailable.
     */
    public static boolean isSyntheticBold(String fontFamily, boolean bold) {
        if (!bold) return false;
        boolean serif = fontFamily != null && (fontFamily.contains("Serif") || fontFamily.contains("Mincho"));
        if (serif) return true;             // no serif bold face bundled
        return !CJK_BOLD_AVAILABLE;          // sans: real bold only when the Bold TTF is present
    }

    /** Whether a real (embedded) Japanese bold face is available. */
    public static boolean isCjkBoldAvailable() {
        return CJK_BOLD_AVAILABLE;
    }

    private static PDFont loadFont(PDDocument doc) {
        if (CJK_AVAILABLE) {
            return loadCjkFont(doc);
        }
        return new PDType1Font(Standard14Fonts.FontName.HELVETICA);
    }

    /**
     * Get the appropriate font based on fontFamily property.
     * Serif families ("Mincho", "Noto Serif JP") use Noto Serif JP;
     * everything else uses Noto Sans JP.
     */
    public static PDFont getFontForFamily(PDDocument doc, Map<String, PDFont> fontCache,
                                           String fontFamily, boolean bold) {
        if (fontFamily != null && (fontFamily.contains("Serif") || fontFamily.contains("Mincho"))) {
            return fontCache.computeIfAbsent("serif", k -> loadSerifFont(doc));
        }
        return bold ? getBoldFont(doc, fontCache) : getFont(doc, fontCache);
    }

    private static PDFont loadCjkFont(PDDocument doc) {
        try {
            return PDType0Font.load(doc, new ByteArrayInputStream(NOTO_SANS_JP_BYTES), true);
        } catch (IOException e) {
            log.warn("Failed to load CJK font for document, falling back to Helvetica: {}", e.getMessage());
            return new PDType1Font(Standard14Fonts.FontName.HELVETICA);
        }
    }

    private static PDFont loadSerifFont(PDDocument doc) {
        if (NOTO_SERIF_JP_BYTES != null) {
            try {
                return PDType0Font.load(doc, new ByteArrayInputStream(NOTO_SERIF_JP_BYTES), true);
            } catch (IOException e) {
                log.warn("Failed to load Serif font, falling back to sans-serif: {}", e.getMessage());
            }
        }
        // Fall back to sans-serif if serif not available
        return loadCjkFont(doc);
    }
}

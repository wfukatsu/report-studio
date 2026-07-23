package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import java.awt.Color;
import java.io.IOException;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;

/** Shared utilities for PDF element renderers. */
public final class PdfUtils {

    private PdfUtils() {}

    public static String textOf(JsonNode node, String field, String defaultValue) {
        JsonNode v = node.get(field);
        return v != null && v.isTextual() ? v.asText() : defaultValue;
    }

    public static float floatOf(JsonNode node, String field) {
        return floatOf(node, field, 0);
    }

    public static float floatOf(JsonNode node, String field, float defaultValue) {
        JsonNode v = node.get(field);
        return v != null && v.isNumber() ? v.floatValue() : defaultValue;
    }

    public static int intOf(JsonNode node, String field, int defaultValue) {
        JsonNode v = node.get(field);
        return v != null && v.isNumber() ? v.intValue() : defaultValue;
    }

    public static boolean boolOf(JsonNode node, String field, boolean defaultValue) {
        JsonNode v = node.get(field);
        return v != null && !v.isNull() ? v.asBoolean(defaultValue) : defaultValue;
    }

    /**
     * Read a field that V2 elements store at the element top level and V1 elements store in {@code
     * props}: top level wins, then props, then default.
     */
    public static String elementTextOf(JsonNode el, String field, String defaultValue) {
        String v = textOf(el, field, "");
        if (!v.isEmpty()) return v;
        JsonNode props = el.get("props");
        return props != null ? textOf(props, field, defaultValue) : defaultValue;
    }

    /** Numeric variant of {@link #elementTextOf}. */
    public static float elementFloatOf(JsonNode el, String field, float defaultValue) {
        JsonNode v = el.get(field);
        if (v != null && v.isNumber()) return v.floatValue();
        JsonNode props = el.get("props");
        return props != null ? floatOf(props, field, defaultValue) : defaultValue;
    }

    /** Integer variant of {@link #elementTextOf}. */
    public static int elementIntOf(JsonNode el, String field, int defaultValue) {
        JsonNode v = el.get(field);
        if (v != null && v.isNumber()) return v.intValue();
        JsonNode props = el.get("props");
        return props != null ? intOf(props, field, defaultValue) : defaultValue;
    }

    /**
     * Whether a style/props node requests bold. Recognizes both the boolean {@code bold: true} and
     * the CSS-style {@code fontWeight: "bold"} the frontend TextStyle uses — so bold authored
     * either way renders bold.
     */
    public static boolean isBold(JsonNode styleOrProps) {
        if (styleOrProps == null) return false;
        if (styleOrProps.path("bold").asBoolean(false)) return true;
        String fw = textOf(styleOrProps, "fontWeight", "");
        if ("bold".equals(fw) || "bolder".equals(fw)) return true;
        // numeric weight ≥ 600 is bold
        JsonNode fwNode = styleOrProps.get("fontWeight");
        return fwNode != null && fwNode.isNumber() && fwNode.asInt() >= 600;
    }

    /** Boolean variant of {@link #elementTextOf}. */
    public static boolean elementBoolOf(JsonNode el, String field, boolean defaultValue) {
        JsonNode v = el.get(field);
        if (v != null && v.isBoolean()) return v.asBoolean();
        JsonNode props = el.get("props");
        return props != null ? boolOf(props, field, defaultValue) : defaultValue;
    }

    /** Parse a {@code #RRGGBB} or {@code #RGB} hex color; fall back on anything else. */
    public static Color parseColor(String value, Color defaultColor) {
        if (value == null || value.isBlank()) return defaultColor;
        String v = value.trim();
        try {
            if (v.startsWith("#")) {
                String hex = v.substring(1);
                // #RGB / #RGBA → expand each nibble; alpha nibble dropped (#373)
                if (hex.length() == 3 || hex.length() == 4) {
                    StringBuilder sb = new StringBuilder(6);
                    for (int i = 0; i < 3; i++) sb.append(hex.charAt(i)).append(hex.charAt(i));
                    hex = sb.toString();
                } else if (hex.length() == 8) {
                    hex = hex.substring(0, 6); // #RRGGBBAA → drop alpha
                }
                if (hex.length() == 6) {
                    return new Color(
                            Integer.parseInt(hex.substring(0, 2), 16),
                            Integer.parseInt(hex.substring(2, 4), 16),
                            Integer.parseInt(hex.substring(4, 6), 16));
                }
                return defaultColor;
            }
            // rgb()/rgba() — the alpha channel is ignored (opaque draw); previously black (#373)
            String lower = v.toLowerCase();
            if (lower.startsWith("rgb(") || lower.startsWith("rgba(")) {
                int open = v.indexOf('(');
                int close = v.indexOf(')');
                if (open >= 0 && close > open) {
                    String[] p = v.substring(open + 1, close).split(",");
                    if (p.length >= 3) {
                        return new Color(colorByte(p[0]), colorByte(p[1]), colorByte(p[2]));
                    }
                }
            }
        } catch (RuntimeException ignored) {
            // fall through to default
        }
        return defaultColor;
    }

    /** Parse one rgb() component (integer, float, or percentage) to a clamped 0–255 byte. */
    private static int colorByte(String s) {
        String t = s.trim();
        float val =
                t.endsWith("%")
                        ? Float.parseFloat(t.substring(0, t.length() - 1)) * 255f / 100f
                        : Float.parseFloat(t);
        return Math.max(0, Math.min(255, Math.round(val)));
    }

    /**
     * Greedy word/character wrapping to fit {@code maxWidth} (issue #56). Honors explicit newlines,
     * breaks Latin runs at spaces when possible, and falls back to per-character breaks (CJK {@code
     * break-all} semantics). Returns at least one line (possibly empty).
     */
    public static java.util.List<String> wrapText(
            String text, PDFont font, float fontSize, float maxWidth) {
        return wrapText(text, font, fontSize, maxWidth, 0f);
    }

    /**
     * {@link #wrapText(String, PDFont, float, float)} with CSS-style letter spacing: {@code
     * charSpacing} points are added after every character (including the last, matching the
     * browser's inline-box width), so wrap points stay aligned with the frontend (#319).
     */
    public static java.util.List<String> wrapText(
            String text, PDFont font, float fontSize, float maxWidth, float charSpacing) {
        java.util.List<String> lines = new java.util.ArrayList<>();
        if (text == null) {
            lines.add("");
            return lines;
        }
        for (String paragraph : text.split("\n", -1)) {
            if (paragraph.isEmpty()) {
                lines.add("");
                continue;
            }
            StringBuilder line = new StringBuilder();
            int lineCps = 0; // code points in `line`
            int lastBreak = -1; // index in `line` after the last space (Latin break point)
            for (int i = 0; i < paragraph.length(); ) {
                int cp = paragraph.codePointAt(i);
                String ch = new String(Character.toChars(cp));
                float w = safeWidth(font, line + ch, fontSize) + (lineCps + 1) * charSpacing;
                if (w > maxWidth && line.length() > 0) {
                    boolean latinBreak =
                            lastBreak > 0 && cp < 0x3000 && !Character.isWhitespace(cp);
                    if (latinBreak) {
                        lines.add(line.substring(0, lastBreak).stripTrailing());
                        line.delete(0, lastBreak);
                    } else {
                        lines.add(line.toString());
                        line.setLength(0);
                    }
                    lineCps = line.codePointCount(0, line.length());
                    lastBreak = -1;
                }
                line.append(ch);
                lineCps++;
                if (cp == ' ') lastBreak = line.length();
                i += Character.charCount(cp);
            }
            lines.add(line.toString());
        }
        return lines;
    }

    private static float safeWidth(PDFont font, String s, float fontSize) {
        try {
            return font.getStringWidth(s) / 1000 * fontSize;
        } catch (Exception e) {
            return s.length() * fontSize; // conservative fallback
        }
    }

    /**
     * Truncate text to fit within maxWidth. O(n) single-pass accumulation instead of O(n log n)
     * binary search with repeated substring scans.
     */
    public static String truncateToWidth(String text, PDFont font, float fontSize, float maxWidth) {
        return truncateToWidth(text, font, fontSize, maxWidth, 0f);
    }

    /** Truncation with CSS-style letter spacing added after every character (#319). */
    public static String truncateToWidth(
            String text, PDFont font, float fontSize, float maxWidth, float charSpacing) {
        float scale = fontSize / 1000f;
        float accumulated = 0;
        for (int i = 0; i < text.length(); ) {
            int cp = text.codePointAt(i);
            try {
                accumulated += font.getWidth(cp) * scale + charSpacing;
            } catch (IOException e) {
                return text.substring(0, i);
            }
            if (accumulated > maxWidth) {
                return i > 0 ? text.substring(0, i) : "";
            }
            i += Character.charCount(cp);
        }
        return text;
    }

    /**
     * Draw a uniform grid. All lines are batched into a single stroke() call. Draws both outer
     * border and inner dividers.
     *
     * @param cs content stream
     * @param x left edge (PDF points)
     * @param y top edge (PDF points, PDF coordinate space)
     * @param w total width
     * @param h total height
     * @param cols number of columns
     * @param rows number of rows
     * @param lineWidth stroke width
     * @param lineColor stroke color
     */
    public static void drawGrid(
            PDPageContentStream cs,
            float x,
            float y,
            float w,
            float h,
            int cols,
            int rows,
            float lineWidth,
            Color lineColor)
            throws IOException {
        float colW = w / cols;
        float rowH = h / rows;

        cs.setStrokingColor(lineColor);
        cs.setLineWidth(lineWidth);

        // Horizontal lines (top to bottom, including top and bottom edges)
        for (int r = 0; r <= rows; r++) {
            float lineY = y - r * rowH;
            cs.moveTo(x, lineY);
            cs.lineTo(x + w, lineY);
        }

        // Vertical lines (left to right, including left and right edges)
        for (int c = 0; c <= cols; c++) {
            float lineX = x + c * colW;
            cs.moveTo(lineX, y);
            cs.lineTo(lineX, y - h);
        }

        cs.stroke(); // single stroke for all lines
    }

    /** Render a light-gray border rectangle (fallback for unsupported kinds). */
    public static void renderBorder(PDPageContentStream cs, float x, float y, float w, float h)
            throws IOException {
        cs.setStrokingColor(Color.LIGHT_GRAY);
        cs.setLineWidth(0.5f);
        cs.addRect(x, y - h, w, h);
        cs.stroke();
    }
}

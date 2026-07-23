package com.report.server.pdf;

import static com.report.server.pdf.PdfUtils.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.awt.Color;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;

/**
 * Renders formTable elements to PDF.
 *
 * <p>Iterates rows and cells from the V2 FormTableElement structure:
 *
 * <ul>
 *   <li>{@code columns[]} — each with {@code width} (mm)
 *   <li>{@code rows[]} — each with {@code height} (mm), {@code role} (header/body/footer), {@code
 *       cells[]}
 *   <li>{@code cells[]} — each with {@code type} (label/input/dataField), {@code text}, {@code
 *       fieldKey}, {@code colspan}, {@code rowspan}, {@code mergedInto}, {@code style}
 * </ul>
 *
 * <p>Cells with {@code mergedInto} set are skipped (spanned into another cell). For {@code type:
 * "dataField"} cells, the value is resolved from {@code _formData} in the projection JSON (passed
 * as a prop or resolved upstream).
 */
public final class FormTablePdfRenderer implements ElementPdfRenderer {

    private static final float MM_TO_PT = SectionRenderHelper.MM_TO_PT;
    private static final float CELL_PADDING_PT = 2f;
    private static final Color DEFAULT_BORDER_COLOR = Color.BLACK;
    private static final float DEFAULT_BORDER_WIDTH = 0.3f;
    private static final float DEFAULT_FONT_SIZE = 10f;

    @Override
    public String kind() {
        return "formTable";
    }

    @Override
    public void render(
            PDPageContentStream cs,
            JsonNode el,
            float x,
            float y,
            float w,
            float h,
            float pageHeight,
            PDDocument doc,
            Map<String, PDFont> fontCache)
            throws IOException {
        // Read element-level props — V2 elements store columns/rows at top level or in props
        JsonNode columns = resolveArray(el, "columns");
        JsonNode rows = resolveArray(el, "rows");
        if (columns == null || rows == null || columns.isEmpty() || rows.isEmpty()) {
            renderBorder(cs, x, y, w, h);
            return;
        }

        // Element-level border settings
        JsonNode props = el.get("props");
        Color borderColor =
                parseColor(
                        props != null
                                ? textOf(props, "borderColor", "")
                                : textOf(el, "borderColor", ""),
                        DEFAULT_BORDER_COLOR);
        float borderWidth =
                props != null
                        ? floatOf(props, "borderWidth", DEFAULT_BORDER_WIDTH)
                        : floatOf(el, "borderWidth", DEFAULT_BORDER_WIDTH);

        // Form data for dataField resolution
        JsonNode formData = el.get("_formData");

        // Row expansion (#352): when dataSource points at an array in _formData, repeat the body
        // rows once per record (header/footer render once), mirroring FormTableLiveRenderer.
        String dataSource =
                props != null ? textOf(props, "dataSource", "") : textOf(el, "dataSource", "");
        JsonNode records = null;
        if (!dataSource.isEmpty() && formData != null) {
            JsonNode arr = formData.get(dataSource);
            if (arr != null && arr.isArray()) records = arr;
        }
        int maxItems = props != null ? intOf(props, "maxItems", 0) : intOf(el, "maxItems", 0);
        List<RowCtx> plan = buildRowPlan(rows, records, maxItems, formData);

        // Pre-compute column X offsets (mm -> pt)
        float[] colXPt = computeColumnOffsets(columns, x);
        float[] colWidthPt = computeColumnWidths(columns);

        // Pre-compute row Y offsets (from top of element, going downward)
        float[] rowYPt = computeRowOffsets(plan, y);
        float[] rowHeightPt = computeRowHeights(plan);

        cs.saveGraphicsState();
        try {
            // Render cells: backgrounds, text, then borders
            renderCellBackgrounds(cs, el, plan, columns, colXPt, colWidthPt, rowYPt, rowHeightPt);
            renderCellText(
                    cs, el, plan, columns, colXPt, colWidthPt, rowYPt, rowHeightPt, doc, fontCache);
            renderCellBorders(
                    cs,
                    plan,
                    columns,
                    colXPt,
                    colWidthPt,
                    rowYPt,
                    rowHeightPt,
                    borderColor,
                    borderWidth);
        } finally {
            cs.restoreGraphicsState();
        }
    }

    // ── Row plan (expansion) ──────────────────────────────────────────────────

    /**
     * A row slot in the rendered table: the template {@code row}, the {@code data} object its
     * dataField cells resolve against, and its {@code recordIdx} (0-based for repeated body rows,
     * -1 for header/footer or non-repeated body).
     */
    private record RowCtx(JsonNode row, JsonNode data, int recordIdx) {}

    /**
     * Build the ordered list of rendered rows: header rows once, then the body-row block repeated
     * per record (each resolving dataField cells against its record), then footer rows once. When
     * there is no bound {@code records} array, body rows render once against the root form data —
     * preserving the pre-#352 single-row behavior.
     */
    private static List<RowCtx> buildRowPlan(
            JsonNode rows, JsonNode records, int maxItems, JsonNode root) {
        List<JsonNode> header = new ArrayList<>();
        List<JsonNode> body = new ArrayList<>();
        List<JsonNode> footer = new ArrayList<>();
        for (JsonNode row : rows) {
            String role = textOf(row, "role", "body");
            if ("header".equals(role)) header.add(row);
            else if ("footer".equals(role)) footer.add(row);
            else body.add(row);
        }

        List<RowCtx> plan = new ArrayList<>();
        for (JsonNode row : header) plan.add(new RowCtx(row, root, -1));
        if (records != null) {
            int n = maxItems > 0 ? Math.min(maxItems, records.size()) : records.size();
            for (int i = 0; i < n; i++) {
                JsonNode rec = records.get(i);
                for (JsonNode row : body) plan.add(new RowCtx(row, rec, i));
            }
        } else {
            for (JsonNode row : body) plan.add(new RowCtx(row, root, -1));
        }
        for (JsonNode row : footer) plan.add(new RowCtx(row, root, -1));
        return plan;
    }

    // ── Column/Row geometry ───────────────────────────────────────────────────

    private static float[] computeColumnOffsets(JsonNode columns, float startX) {
        float[] offsets = new float[columns.size()];
        float currentX = startX;
        for (int i = 0; i < columns.size(); i++) {
            offsets[i] = currentX;
            float widthMm = floatOf(columns.get(i), "width", 20f);
            currentX += widthMm * MM_TO_PT;
        }
        return offsets;
    }

    private static float[] computeColumnWidths(JsonNode columns) {
        float[] widths = new float[columns.size()];
        for (int i = 0; i < columns.size(); i++) {
            widths[i] = floatOf(columns.get(i), "width", 20f) * MM_TO_PT;
        }
        return widths;
    }

    private static float[] computeRowOffsets(List<RowCtx> plan, float startY) {
        // PDF Y axis goes up; startY is top of element in PDF coords
        float[] offsets = new float[plan.size()];
        float currentY = startY;
        for (int i = 0; i < plan.size(); i++) {
            offsets[i] = currentY;
            float heightMm = floatOf(plan.get(i).row(), "height", 8f);
            currentY -= heightMm * MM_TO_PT;
        }
        return offsets;
    }

    private static float[] computeRowHeights(List<RowCtx> plan) {
        float[] heights = new float[plan.size()];
        for (int i = 0; i < plan.size(); i++) {
            heights[i] = floatOf(plan.get(i).row(), "height", 8f) * MM_TO_PT;
        }
        return heights;
    }

    // ── Cell backgrounds ──────────────────────────────────────────────────────

    private static void renderCellBackgrounds(
            PDPageContentStream cs,
            JsonNode el,
            List<RowCtx> plan,
            JsonNode columns,
            float[] colXPt,
            float[] colWidthPt,
            float[] rowYPt,
            float[] rowHeightPt)
            throws IOException {
        // Element-level header/body styles
        JsonNode headerStyle =
                el.has("headerStyle")
                        ? el.get("headerStyle")
                        : (el.has("props") ? el.get("props").get("headerStyle") : null);
        JsonNode bodyStyle =
                el.has("bodyStyle")
                        ? el.get("bodyStyle")
                        : (el.has("props") ? el.get("props").get("bodyStyle") : null);

        for (int rowIdx = 0; rowIdx < plan.size(); rowIdx++) {
            JsonNode row = plan.get(rowIdx).row();
            String role = textOf(row, "role", "body");
            JsonNode cells = row.get("cells");
            if (cells == null || !cells.isArray()) continue;

            for (int colIdx = 0; colIdx < Math.min(cells.size(), columns.size()); colIdx++) {
                JsonNode cell = cells.get(colIdx);
                if (isMergedInto(cell)) continue;

                // Cell background color: cell.style.backgroundColor > row role style > none
                String bgColor = resolveBgColor(cell, role, headerStyle, bodyStyle);
                if (bgColor == null || bgColor.isBlank()) continue;

                Color bg = parseColor(bgColor, null);
                if (bg == null) continue;

                CellBounds bounds =
                        computeCellBounds(
                                colIdx,
                                rowIdx,
                                cell,
                                columns.size(),
                                plan.size(),
                                colXPt,
                                colWidthPt,
                                rowYPt,
                                rowHeightPt);

                cs.setNonStrokingColor(bg);
                cs.addRect(bounds.x, bounds.y - bounds.h, bounds.w, bounds.h);
                cs.fill();
            }
        }
    }

    // ── Cell text ─────────────────────────────────────────────────────────────

    private static void renderCellText(
            PDPageContentStream cs,
            JsonNode el,
            List<RowCtx> plan,
            JsonNode columns,
            float[] colXPt,
            float[] colWidthPt,
            float[] rowYPt,
            float[] rowHeightPt,
            PDDocument doc,
            Map<String, PDFont> fontCache)
            throws IOException {
        for (int rowIdx = 0; rowIdx < plan.size(); rowIdx++) {
            RowCtx ctx = plan.get(rowIdx);
            JsonNode row = ctx.row();
            JsonNode rowData = ctx.data();
            JsonNode cells = row.get("cells");
            if (cells == null || !cells.isArray()) continue;

            for (int colIdx = 0; colIdx < Math.min(cells.size(), columns.size()); colIdx++) {
                JsonNode cell = cells.get(colIdx);
                if (isMergedInto(cell)) continue;

                String text = resolveCellText(cell, rowData);
                if (text == null || text.isEmpty()) continue;

                CellBounds bounds =
                        computeCellBounds(
                                colIdx,
                                rowIdx,
                                cell,
                                columns.size(),
                                plan.size(),
                                colXPt,
                                colWidthPt,
                                rowYPt,
                                rowHeightPt);

                // Resolve font from cell style
                JsonNode style = cell.get("style");
                float fontSize =
                        style != null
                                ? floatOf(style, "fontSize", DEFAULT_FONT_SIZE)
                                : DEFAULT_FONT_SIZE;
                boolean bold = isBold(style);
                String fontFamily = style != null ? textOf(style, "fontFamily", "") : "";
                PDFont font = FontProvider.getFontForFamily(doc, fontCache, fontFamily, bold);

                // Text color
                String colorStr = style != null ? textOf(style, "color", "") : "";
                Color textColor = parseColor(colorStr, Color.BLACK);

                // Text alignment
                String textAlign = style != null ? textOf(style, "textAlign", "left") : "left";
                String verticalAlign =
                        style != null ? textOf(style, "verticalAlign", "middle") : "middle";

                // Truncate text to fit cell width
                float availableWidth = bounds.w - 2 * CELL_PADDING_PT;
                if (availableWidth <= 0) continue;
                String truncated = truncateToWidth(text, font, fontSize, availableWidth);

                // Compute text X position based on alignment
                float textWidth = estimateTextWidth(truncated, font, fontSize);
                float textX = computeTextX(bounds.x, bounds.w, textWidth, textAlign);

                // Compute text Y position based on vertical alignment
                float textY = computeTextY(bounds.y, bounds.h, fontSize, verticalAlign);

                cs.beginText();
                cs.setFont(font, fontSize);
                cs.setNonStrokingColor(textColor);
                cs.newLineAtOffset(textX, textY);
                cs.showText(truncated);
                cs.endText();
            }
        }
    }

    // ── Cell borders ──────────────────────────────────────────────────────────

    private static void renderCellBorders(
            PDPageContentStream cs,
            List<RowCtx> plan,
            JsonNode columns,
            float[] colXPt,
            float[] colWidthPt,
            float[] rowYPt,
            float[] rowHeightPt,
            Color borderColor,
            float borderWidth)
            throws IOException {
        cs.setStrokingColor(borderColor);
        cs.setLineWidth(borderWidth * MM_TO_PT);

        for (int rowIdx = 0; rowIdx < plan.size(); rowIdx++) {
            JsonNode row = plan.get(rowIdx).row();
            JsonNode cells = row.get("cells");
            if (cells == null || !cells.isArray()) continue;

            for (int colIdx = 0; colIdx < Math.min(cells.size(), columns.size()); colIdx++) {
                JsonNode cell = cells.get(colIdx);
                if (isMergedInto(cell)) continue;

                CellBounds bounds =
                        computeCellBounds(
                                colIdx,
                                rowIdx,
                                cell,
                                columns.size(),
                                plan.size(),
                                colXPt,
                                colWidthPt,
                                rowYPt,
                                rowHeightPt);

                cs.addRect(bounds.x, bounds.y - bounds.h, bounds.w, bounds.h);
            }
        }
        cs.stroke();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Immutable cell bounds in PDF points. */
    private record CellBounds(float x, float y, float w, float h) {}

    private static CellBounds computeCellBounds(
            int colIdx,
            int rowIdx,
            JsonNode cell,
            int totalCols,
            int totalRows,
            float[] colXPt,
            float[] colWidthPt,
            float[] rowYPt,
            float[] rowHeightPt) {
        int colspan = Math.max(1, intOf(cell, "colspan", 1));
        int rowspan = Math.max(1, intOf(cell, "rowspan", 1));

        float cellX = colXPt[colIdx];
        float cellY = rowYPt[rowIdx];

        // Width spans multiple columns
        float cellW = 0;
        for (int c = colIdx; c < Math.min(colIdx + colspan, totalCols); c++) {
            cellW += colWidthPt[c];
        }

        // Height spans multiple rows
        float cellH = 0;
        for (int r = rowIdx; r < Math.min(rowIdx + rowspan, totalRows); r++) {
            cellH += rowHeightPt[r];
        }

        return new CellBounds(cellX, cellY, cellW, cellH);
    }

    private static boolean isMergedInto(JsonNode cell) {
        JsonNode mergedInto = cell.get("mergedInto");
        return mergedInto != null && !mergedInto.isNull() && !mergedInto.asText("").isEmpty();
    }

    private static String resolveCellText(JsonNode cell, JsonNode formData) {
        String cellType = textOf(cell, "type", "label");
        if ("dataField".equals(cellType)) {
            String fieldKey = textOf(cell, "fieldKey", "");
            if (!fieldKey.isEmpty() && formData != null) {
                // Dot-notation keys traverse nested objects (frontend parity)
                JsonNode value = SectionRenderHelper.resolveDataPath(formData, fieldKey);
                if (value != null && !value.isNull()) {
                    if (value.isTextual()) return value.asText();
                    if (value.isNumber())
                        return value.isInt()
                                ? String.valueOf(value.asInt())
                                : String.valueOf(value.asDouble());
                    if (value.isBoolean()) return String.valueOf(value.asBoolean());
                    return value.asText("");
                }
            }
            return "";
        }
        if ("checkbox".equals(cellType)) {
            boolean checked = cell.path("checked").asBoolean(false);
            // Data binding: if checkboxDataSource resolves to non-empty, checked
            String ds = textOf(cell, "checkboxDataSource", "");
            if (!ds.isEmpty() && formData != null) {
                JsonNode val = formData.get(ds);
                checked = val != null && !val.isNull() && !val.asText("").isEmpty();
            }
            String mark = textOf(cell, "checkmark", "✓");
            String label = textOf(cell, "text", "");
            return checked
                    ? (mark + (label.isEmpty() ? "" : " " + label))
                    : (label.isEmpty() ? "" : "□ " + label);
        }
        if ("eraSelect".equals(cellType)) {
            String ds = textOf(cell, "eraDataSource", "");
            String selected = "";
            if (!ds.isEmpty() && formData != null) {
                JsonNode val = formData.get(ds);
                if (val != null) selected = val.asText("");
            }
            String[] eras = {"明", "大", "昭", "平", "令"};
            StringBuilder sb = new StringBuilder();
            for (String era : eras) {
                if (sb.length() > 0) sb.append(" ");
                sb.append(era.equals(selected) ? "●" : "○").append(era);
            }
            return sb.toString();
        }
        // label or input: use text content
        return textOf(cell, "text", "");
    }

    private static String resolveBgColor(
            JsonNode cell, String role, JsonNode headerStyle, JsonNode bodyStyle) {
        // Cell-level style takes priority
        JsonNode style = cell.get("style");
        if (style != null) {
            String bg = textOf(style, "backgroundColor", "");
            if (!bg.isEmpty()) return bg;
        }
        // Fall back to role-level style
        if ("header".equals(role) && headerStyle != null) {
            return textOf(headerStyle, "backgroundColor", "");
        }
        if (("body".equals(role) || "footer".equals(role)) && bodyStyle != null) {
            return textOf(bodyStyle, "backgroundColor", "");
        }
        return "";
    }

    private static Color parseColor(String hex, Color defaultColor) {
        if (hex == null || hex.isEmpty()) return defaultColor;
        try {
            if (hex.startsWith("#") && hex.length() == 7) {
                return new Color(
                        Integer.parseInt(hex.substring(1, 3), 16),
                        Integer.parseInt(hex.substring(3, 5), 16),
                        Integer.parseInt(hex.substring(5, 7), 16));
            }
        } catch (NumberFormatException e) {
            // fall through
        }
        return defaultColor;
    }

    private static float computeTextX(float cellX, float cellW, float textW, String align) {
        return switch (align) {
            case "center" -> cellX + (cellW - textW) / 2;
            case "right" -> cellX + cellW - textW - CELL_PADDING_PT;
            default -> cellX + CELL_PADDING_PT;
        };
    }

    private static float computeTextY(
            float cellY, float cellH, float fontSize, String verticalAlign) {
        return switch (verticalAlign) {
            case "top" -> cellY - fontSize - CELL_PADDING_PT;
            case "bottom" -> cellY - cellH + CELL_PADDING_PT;
            default -> cellY - (cellH + fontSize) / 2; // middle
        };
    }

    private static float estimateTextWidth(String text, PDFont font, float fontSize) {
        try {
            return font.getStringWidth(text) / 1000f * fontSize;
        } catch (IOException e) {
            return text.length() * fontSize * 0.5f;
        }
    }

    /**
     * Resolve an array field that may exist at element top level or in props. V2 elements store
     * columns/rows at top level; props-wrapped format is also supported.
     */
    private static JsonNode resolveArray(JsonNode el, String fieldName) {
        JsonNode node = el.get(fieldName);
        if (node != null && node.isArray()) return node;
        JsonNode props = el.get("props");
        if (props != null) {
            node = props.get(fieldName);
            if (node != null && node.isArray()) return node;
        }
        return null;
    }
}

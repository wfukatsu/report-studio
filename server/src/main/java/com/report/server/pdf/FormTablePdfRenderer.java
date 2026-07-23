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
import org.apache.pdfbox.util.Matrix;

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
    // Front default cell font size (constants.ts DEFAULT_CELL_FONT_SIZE_PT); server matches (#353)
    private static final float DEFAULT_FONT_SIZE = 8f;
    private static final String DEFAULT_HEADER_BG = "#f3f4f6";
    private static final String DEFAULT_FOOTER_BG = "#f9fafb";
    // Cell-widget parity constants (front CellContent, Renderer.tsx) — #373
    private static final Color INPUT_PLACEHOLDER_COLOR = new Color(0x9c, 0xa3, 0xaf); // #9ca3af
    private static final float ITALIC_SHEAR = 0.21f; // ~12° synthetic italic (matches #368)
    private static final String[] DEFAULT_ERAS = {"明", "大", "昭", "平", "令"};
    private static final float CHECKBOX_SIZE_PT = 3f * MM_TO_PT;
    private static final float CHECKBOX_BORDER_PT = 0.25f * MM_TO_PT;
    private static final float CHECKMARK_FONT_PT = 2.2f * MM_TO_PT;
    private static final float CHECKBOX_GAP_PT = 0.5f * MM_TO_PT;
    private static final float ERA_FONT_PT = 2f * MM_TO_PT;
    private static final float ERA_GAP_PT = 0.2f * MM_TO_PT;

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
            renderCellWidgets(
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
        // Element-level header style + zebra colors (#353; body bg is zebra-only, front parity)
        JsonNode headerStyle = elementSubStyle(el, "headerStyle");
        String oddRowColor = elementTextOf(el, "oddRowColor", "");
        String evenRowColor = elementTextOf(el, "evenRowColor", "");

        for (int rowIdx = 0; rowIdx < plan.size(); rowIdx++) {
            RowCtx ctx = plan.get(rowIdx);
            JsonNode row = ctx.row();
            String role = textOf(row, "role", "body");
            JsonNode cells = row.get("cells");
            if (cells == null || !cells.isArray()) continue;

            for (int colIdx = 0; colIdx < Math.min(cells.size(), columns.size()); colIdx++) {
                JsonNode cell = cells.get(colIdx);
                if (isMergedInto(cell)) continue;

                // Cell background: cell.style > role default > zebra (front parity, #353)
                String bgColor =
                        resolveBgColor(
                                cell,
                                role,
                                headerStyle,
                                ctx.recordIdx(),
                                oddRowColor,
                                evenRowColor);
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
        JsonNode headerStyle = elementSubStyle(el, "headerStyle");
        JsonNode bodyStyle = elementSubStyle(el, "bodyStyle");

        for (int rowIdx = 0; rowIdx < plan.size(); rowIdx++) {
            RowCtx ctx = plan.get(rowIdx);
            JsonNode row = ctx.row();
            JsonNode rowData = ctx.data();
            String role = textOf(row, "role", "body");
            JsonNode cells = row.get("cells");
            if (cells == null || !cells.isArray()) continue;

            for (int colIdx = 0; colIdx < Math.min(cells.size(), columns.size()); colIdx++) {
                JsonNode cell = cells.get(colIdx);
                if (isMergedInto(cell)) continue;

                // checkbox / eraSelect are drawn as widgets (box, era markers) in a later pass.
                String cellType = textOf(cell, "type", "label");
                if ("checkbox".equals(cellType) || "eraSelect".equals(cellType)) continue;

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

                // Resolve style with cell → column → role priority (#353, front parity)
                JsonNode style = cell.get("style");
                JsonNode col = columns.get(colIdx);
                float fontSize = resolveFontSize(style, col, headerStyle, role);
                boolean bold = resolveBold(headerStyle, bodyStyle, role);
                String fontFamily = style != null ? textOf(style, "fontFamily", "") : "";
                PDFont font = FontProvider.getFontForFamily(doc, fontCache, fontFamily, bold);

                // input placeholder renders faint gray-italic (front CellContent); others per
                // style.
                boolean isInput = "input".equals(cellType);
                Color textColor =
                        isInput
                                ? INPUT_PLACEHOLDER_COLOR
                                : resolveTextColor(style, col, headerStyle, role);
                boolean italic =
                        isInput
                                || "italic"
                                        .equals(
                                                style != null
                                                        ? textOf(style, "fontStyle", "")
                                                        : "");
                String textAlign = resolveTextAlign(style, col);
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
                if (italic) {
                    cs.setTextMatrix(new Matrix(1, 0, ITALIC_SHEAR, 1, textX, textY));
                } else {
                    cs.newLineAtOffset(textX, textY);
                }
                cs.showText(truncated);
                cs.endText();
            }
        }
    }

    // ── Cell widgets (checkbox box, era markers) ──────────────────────────────

    /**
     * Draw the non-text cell types that the frontend {@code CellContent} renders as widgets rather
     * than plain text (#373): {@code checkbox} (a bordered box + optional checkmark and label) and
     * {@code eraSelect} (○/● markers with era names in a row or column). Mirrors the frontend
     * geometry so the PDF matches the on-screen form rather than an ASCII approximation.
     */
    private static void renderCellWidgets(
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
        JsonNode headerStyle = elementSubStyle(el, "headerStyle");
        PDFont font = FontProvider.getFont(doc, fontCache);

        for (int rowIdx = 0; rowIdx < plan.size(); rowIdx++) {
            RowCtx ctx = plan.get(rowIdx);
            JsonNode row = ctx.row();
            JsonNode rowData = ctx.data();
            String role = textOf(row, "role", "body");
            JsonNode cells = row.get("cells");
            if (cells == null || !cells.isArray()) continue;

            for (int colIdx = 0; colIdx < Math.min(cells.size(), columns.size()); colIdx++) {
                JsonNode cell = cells.get(colIdx);
                if (isMergedInto(cell)) continue;
                String cellType = textOf(cell, "type", "label");
                boolean isCheckbox = "checkbox".equals(cellType);
                boolean isEra = "eraSelect".equals(cellType);
                if (!isCheckbox && !isEra) continue;

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

                if (isCheckbox) {
                    JsonNode col = columns.get(colIdx);
                    float labelSize = resolveFontSize(cell.get("style"), col, headerStyle, role);
                    drawCheckboxCell(cs, font, cell, rowData, bounds, labelSize);
                } else {
                    drawEraSelectCell(cs, font, cell, rowData, bounds);
                }
            }
        }
    }

    /** Bordered box, centered checkmark when checked, then the optional label to its right. */
    private static void drawCheckboxCell(
            PDPageContentStream cs,
            PDFont font,
            JsonNode cell,
            JsonNode rowData,
            CellBounds bounds,
            float labelSize)
            throws IOException {
        boolean checked = cell.path("checked").asBoolean(false);
        String ds = textOf(cell, "checkboxDataSource", "");
        if (!ds.isEmpty() && rowData != null) {
            JsonNode val = SectionRenderHelper.resolveDataPath(rowData, ds);
            checked = val != null && !val.isNull() && !val.asText("").isEmpty();
        }

        float boxX = bounds.x + CELL_PADDING_PT;
        float centerY = bounds.y - bounds.h / 2;
        float boxBottom = centerY - CHECKBOX_SIZE_PT / 2;

        cs.setStrokingColor(Color.BLACK);
        cs.setLineWidth(CHECKBOX_BORDER_PT);
        cs.addRect(boxX, boxBottom, CHECKBOX_SIZE_PT, CHECKBOX_SIZE_PT);
        cs.stroke();

        if (checked) {
            String mark = textOf(cell, "checkmark", "✓");
            if (!mark.isEmpty()) {
                float markW = estimateTextWidth(mark, font, CHECKMARK_FONT_PT);
                float markX = boxX + (CHECKBOX_SIZE_PT - markW) / 2;
                cs.beginText();
                cs.setFont(font, CHECKMARK_FONT_PT);
                cs.setNonStrokingColor(Color.BLACK);
                cs.newLineAtOffset(markX, centerY - CHECKMARK_FONT_PT * 0.35f);
                cs.showText(mark);
                cs.endText();
            }
        }

        String label = textOf(cell, "text", "");
        if (!label.isEmpty()) {
            float labelX = boxX + CHECKBOX_SIZE_PT + CHECKBOX_GAP_PT;
            cs.beginText();
            cs.setFont(font, labelSize);
            cs.setNonStrokingColor(Color.BLACK);
            cs.newLineAtOffset(labelX, centerY - labelSize * 0.35f);
            cs.showText(label);
            cs.endText();
        }
    }

    /**
     * Era markers spread across the cell: {@code row} layout distributes items horizontally (each
     * centered in an equal slot), {@code column} stacks them vertically. Each item is a ○/● marker
     * and the era name drawn as separate glyph runs with a 0.2mm gap (front flex gap).
     */
    private static void drawEraSelectCell(
            PDPageContentStream cs, PDFont font, JsonNode cell, JsonNode rowData, CellBounds bounds)
            throws IOException {
        String ds = textOf(cell, "eraDataSource", "");
        String selected = "";
        if (!ds.isEmpty() && rowData != null) {
            JsonNode val = SectionRenderHelper.resolveDataPath(rowData, ds);
            if (val != null && !val.isNull()) selected = val.asText("");
        }
        String layout = textOf(cell, "eraLayout", "column");
        boolean rowLayout = "row".equals(layout);
        int count = DEFAULT_ERAS.length;

        cs.setNonStrokingColor(Color.BLACK);
        for (int i = 0; i < count; i++) {
            String era = DEFAULT_ERAS[i];
            String marker = era.equals(selected) ? "●" : "○";
            float markerW = estimateTextWidth(marker, font, ERA_FONT_PT);
            float eraW = estimateTextWidth(era, font, ERA_FONT_PT);
            float itemW = markerW + ERA_GAP_PT + eraW;

            float itemX;
            float centerY;
            if (rowLayout) {
                float slotW = bounds.w / count;
                itemX = bounds.x + slotW * i + Math.max(0, (slotW - itemW) / 2);
                centerY = bounds.y - bounds.h / 2;
            } else {
                float slotH = bounds.h / count;
                itemX = bounds.x + CELL_PADDING_PT;
                centerY = bounds.y - slotH * i - slotH / 2;
            }
            float baselineY = centerY - ERA_FONT_PT * 0.35f;

            cs.beginText();
            cs.setFont(font, ERA_FONT_PT);
            cs.newLineAtOffset(itemX, baselineY);
            cs.showText(marker);
            cs.endText();

            cs.beginText();
            cs.setFont(font, ERA_FONT_PT);
            cs.newLineAtOffset(itemX + markerW + ERA_GAP_PT, baselineY);
            cs.showText(era);
            cs.endText();
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
        if ("input".equals(cellType)) {
            // Front renders the placeholder as faint gray-italic filler text.
            return textOf(cell, "placeholder", "");
        }
        // checkbox / eraSelect are drawn as widgets, not here (see renderCellWidgets).
        // label: use text content
        return textOf(cell, "text", "");
    }

    /**
     * Cell background, mirroring the frontend {@code resolveBackground} (#353): cell style wins;
     * header falls back to {@code headerStyle.backgroundColor} then {@code #f3f4f6}; footer to
     * {@code #f9fafb}; repeated body rows use zebra {@code odd/evenRowColor} by record index.
     * Non-repeated body rows ({@code recordIdx < 0}) get no background — matching the frontend,
     * which never applies {@code bodyStyle.backgroundColor} to body cells.
     */
    private static String resolveBgColor(
            JsonNode cell,
            String role,
            JsonNode headerStyle,
            int recordIdx,
            String oddRowColor,
            String evenRowColor) {
        JsonNode style = cell.get("style");
        if (style != null) {
            String bg = textOf(style, "backgroundColor", "");
            if (!bg.isEmpty()) return bg;
        }
        if ("header".equals(role)) {
            String hb = headerStyle != null ? textOf(headerStyle, "backgroundColor", "") : "";
            return hb.isEmpty() ? DEFAULT_HEADER_BG : hb;
        }
        if ("footer".equals(role)) {
            return DEFAULT_FOOTER_BG;
        }
        if ("body".equals(role) && recordIdx >= 0) {
            return recordIdx % 2 == 0 ? oddRowColor : evenRowColor;
        }
        return "";
    }

    // ── Cell style cascade (cell → column → role), front parity (#353) ─────────

    /**
     * Element-level sub-style object ({@code headerStyle}/{@code bodyStyle}), top level or props.
     */
    private static JsonNode elementSubStyle(JsonNode el, String key) {
        if (el.has(key)) return el.get(key);
        JsonNode props = el.get("props");
        return props != null ? props.get(key) : null;
    }

    /** Alignment: cell.style.textAlign → column.align → "left". */
    private static String resolveTextAlign(JsonNode cellStyle, JsonNode col) {
        if (cellStyle != null) {
            String a = textOf(cellStyle, "textAlign", "");
            if (!a.isEmpty()) return a;
        }
        if (col != null) {
            String a = textOf(col, "align", "");
            if (!a.isEmpty()) return a;
        }
        return "left";
    }

    /** Font size: cell.style → column.style → headerStyle (header rows) → default 8pt. */
    private static float resolveFontSize(
            JsonNode cellStyle, JsonNode col, JsonNode headerStyle, String role) {
        if (cellStyle != null && cellStyle.hasNonNull("fontSize")) {
            return floatOf(cellStyle, "fontSize", DEFAULT_FONT_SIZE);
        }
        JsonNode colStyle = col != null ? col.get("style") : null;
        if (colStyle != null && colStyle.hasNonNull("fontSize")) {
            return floatOf(colStyle, "fontSize", DEFAULT_FONT_SIZE);
        }
        if ("header".equals(role) && headerStyle != null && headerStyle.hasNonNull("fontSize")) {
            return floatOf(headerStyle, "fontSize", DEFAULT_FONT_SIZE);
        }
        return DEFAULT_FONT_SIZE;
    }

    /** Text color: cell.style → column.style → headerStyle (header rows) → black. */
    private static Color resolveTextColor(
            JsonNode cellStyle, JsonNode col, JsonNode headerStyle, String role) {
        String c = cellStyle != null ? textOf(cellStyle, "color", "") : "";
        if (c.isEmpty() && col != null) {
            JsonNode colStyle = col.get("style");
            if (colStyle != null) c = textOf(colStyle, "color", "");
        }
        if (c.isEmpty() && "header".equals(role) && headerStyle != null) {
            c = textOf(headerStyle, "color", "");
        }
        return parseColor(c, Color.BLACK);
    }

    /**
     * Bold: header/footer default to bold (unless {@code headerStyle.fontWeight} says otherwise);
     * body follows {@code bodyStyle.fontWeight}. Mirrors the frontend {@code resolveFontWeight}.
     */
    private static boolean resolveBold(JsonNode headerStyle, JsonNode bodyStyle, String role) {
        if ("header".equals(role) || "footer".equals(role)) {
            if (headerStyle != null && headerStyle.hasNonNull("fontWeight")) {
                return isBold(headerStyle);
            }
            return true;
        }
        return isBold(bodyStyle);
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

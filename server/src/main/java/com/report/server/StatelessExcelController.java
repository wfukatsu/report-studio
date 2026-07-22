package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.javalin.http.Context;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.util.WorkbookUtil;
import org.apache.poi.xssf.streaming.SXSSFSheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Stateless XLSX generation endpoint — accepts template + data inline and returns the report's
 * underlying data as a multi-sheet Excel workbook (issue #118).
 *
 * <p>POST /api/v2/excel/generate
 *
 * <pre>
 * Body: { "template": { V2 ReportDefinition }, "data": { key-value pairs } }
 * Response: 200 application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
 *           | 400/413/500 JSON error
 * </pre>
 *
 * <p>Table selection mirrors the client-side CSV export:
 *
 * <ol>
 *   <li>arrays referenced by a repeating element's {@code dataSource} (the report's real line-item
 *       tables), then
 *   <li>any remaining top-level array-of-objects.
 * </ol>
 *
 * Scalar master fields become a leading 項目/値 sheet.
 *
 * <p>Security: all cells use {@link CellType#STRING} to prevent formula execution.
 */
public final class StatelessExcelController {

    private static final Logger log = LoggerFactory.getLogger(StatelessExcelController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int MAX_BODY_BYTES = 512 * 1024; // 512KB — matches stateless PDF

    /**
     * Localized labels for generated sheet names / headers (#329 Phase 3). The report's own data
     * (field keys, cell values) is user content and stays as-is; only these generated chrome
     * strings switch by request locale. Package-private so tests can assert the English variant.
     */
    record Labels(
            String itemsSheet,
            String itemHeader,
            String valueHeader,
            String dataSheet,
            String noData,
            String sheetFallback) {}

    static final Labels JA = new Labels("項目", "項目", "値", "データ", "出力できるデータがありません", "シート");
    static final Labels EN =
            new Labels("Items", "Item", "Value", "Data", "No data available for export", "Sheet");

    /** Pick labels from a request locale: {@code ?locale=en} or Accept-Language "en*" → English. */
    static Labels labelsFor(Context ctx) {
        String q = ctx.queryParam("locale");
        String src = (q != null && !q.isBlank()) ? q : ctx.header("Accept-Language");
        boolean en = src != null && src.toLowerCase(Locale.ROOT).startsWith("en");
        return en ? EN : JA;
    }

    /** POST /api/v2/excel/generate */
    public void generate(Context ctx) {
        String body = ctx.body();
        if (body == null || body.isBlank()) {
            ApiError.respond(ctx, 400, "VALIDATION_ERROR", "Request body is required");
            return;
        }
        if (body.length() > MAX_BODY_BYTES) {
            ApiError.respond(ctx, 413, "PAYLOAD_TOO_LARGE", "Request body too large (max 512KB)");
            return;
        }

        JsonNode root;
        try {
            root = MAPPER.readTree(body);
        } catch (Exception e) {
            ApiError.respond(ctx, 400, "VALIDATION_ERROR", "Invalid JSON");
            return;
        }

        // Reuse the same structural validation as stateless PDF (size/depth/pages).
        String validationError = RequestValidator.validatePdfGenerateRequest(root);
        if (validationError != null) {
            ApiError.respond(ctx, 400, "VALIDATION_ERROR", validationError);
            return;
        }

        JsonNode template = root.get("template");
        JsonNode data =
                root.has("data") && root.get("data").isObject()
                        ? root.get("data")
                        : MAPPER.createObjectNode();

        try {
            byte[] xlsx = buildWorkbook(template, data, labelsFor(ctx));
            ctx.contentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            ctx.header("Content-Disposition", "attachment; filename=\"report-data.xlsx\"");
            ctx.result(xlsx);
        } catch (Exception e) {
            log.error("Failed to generate XLSX", e);
            ApiError.respond(ctx, 500, "INTERNAL_ERROR", "Failed to generate Excel workbook");
        }
    }

    // ── Workbook assembly ───────────────────────────────────────────────────

    /** Backwards-compatible entry point (Japanese labels). */
    static byte[] buildWorkbook(JsonNode template, JsonNode data) throws Exception {
        return buildWorkbook(template, data, JA);
    }

    static byte[] buildWorkbook(JsonNode template, JsonNode data, Labels labels) throws Exception {
        List<String> preferredKeys = collectDataSourceKeys(template);

        try (SXSSFWorkbook wb = new SXSSFWorkbook(100)) {
            LinkedHashSet<String> usedSheetNames = new LinkedHashSet<>();

            // 1. Scalar master fields → 項目/値 sheet
            List<String[]> scalars = collectScalars(data);
            if (!scalars.isEmpty()) {
                SXSSFSheet sheet =
                        wb.createSheet(
                                uniqueSheetName(
                                        labels.itemsSheet(),
                                        usedSheetNames,
                                        labels.sheetFallback()));
                Row header = sheet.createRow(0);
                header.createCell(0, CellType.STRING).setCellValue(labels.itemHeader());
                header.createCell(1, CellType.STRING).setCellValue(labels.valueHeader());
                int r = 1;
                for (String[] kv : scalars) {
                    Row row = sheet.createRow(r++);
                    row.createCell(0, CellType.STRING).setCellValue(kv[0]);
                    row.createCell(1, CellType.STRING).setCellValue(kv[1]);
                }
            }

            // 2. Tables: dataSource-referenced arrays first, then other top-level arrays
            LinkedHashSet<String> tableKeys = new LinkedHashSet<>();
            for (String key : preferredKeys) {
                if (isRowArray(data.get(key))) tableKeys.add(key);
            }
            Iterator<String> fields = data.fieldNames();
            while (fields.hasNext()) {
                String key = fields.next();
                if (isRowArray(data.get(key))) tableKeys.add(key);
            }

            for (String key : tableKeys) {
                writeTableSheet(
                        wb,
                        uniqueSheetName(key, usedSheetNames, labels.sheetFallback()),
                        data.get(key));
            }

            // 3. Ensure the workbook always has at least one sheet
            if (wb.getNumberOfSheets() == 0) {
                SXSSFSheet sheet =
                        wb.createSheet(
                                uniqueSheetName(
                                        labels.dataSheet(),
                                        usedSheetNames,
                                        labels.sheetFallback()));
                sheet.createRow(0).createCell(0, CellType.STRING).setCellValue(labels.noData());
            }

            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            wb.write(bos);
            wb.dispose();
            return bos.toByteArray();
        }
    }

    private static void writeTableSheet(SXSSFWorkbook wb, String sheetName, JsonNode rows) {
        // Ordered union of keys across all rows (first-appearance order)
        LinkedHashSet<String> columns = new LinkedHashSet<>();
        for (JsonNode row : rows) {
            Iterator<String> it = row.fieldNames();
            while (it.hasNext()) columns.add(it.next());
        }
        List<String> cols = new ArrayList<>(columns);

        SXSSFSheet sheet = wb.createSheet(sheetName);
        Row header = sheet.createRow(0);
        for (int c = 0; c < cols.size(); c++) {
            header.createCell(c, CellType.STRING).setCellValue(cols.get(c));
        }
        int r = 1;
        for (JsonNode row : rows) {
            Row out = sheet.createRow(r++);
            for (int c = 0; c < cols.size(); c++) {
                out.createCell(c, CellType.STRING).setCellValue(cellValue(row.get(cols.get(c))));
            }
        }
    }

    // ── Data extraction ─────────────────────────────────────────────────────

    /** Collect dataSource keys from repeatingBand/repeatingList elements. */
    static List<String> collectDataSourceKeys(JsonNode template) {
        List<String> keys = new ArrayList<>();
        LinkedHashSet<String> seen = new LinkedHashSet<>();
        JsonNode pages = template.get("pages");
        if (pages == null || !pages.isArray()) return keys;
        for (JsonNode page : pages) {
            JsonNode sections = page.get("sections");
            if (sections == null || !sections.isArray()) continue;
            for (JsonNode section : sections) {
                JsonNode elements = section.get("elements");
                if (elements == null || !elements.isArray()) continue;
                for (JsonNode el : elements) {
                    String type = el.path("type").asText("");
                    if (!type.equals("repeatingBand") && !type.equals("repeatingList")) continue;
                    JsonNode ds = el.get("dataSource");
                    if (ds != null
                            && ds.isTextual()
                            && !ds.asText().isBlank()
                            && seen.add(ds.asText())) {
                        keys.add(ds.asText());
                    }
                }
            }
        }
        return keys;
    }

    /** Top-level scalar (non-object, non-array) fields as {key, value} pairs. */
    static List<String[]> collectScalars(JsonNode data) {
        List<String[]> out = new ArrayList<>();
        Iterator<String> fields = data.fieldNames();
        while (fields.hasNext()) {
            String key = fields.next();
            JsonNode v = data.get(key);
            if (v == null || v.isObject() || v.isArray()) continue;
            out.add(new String[] {key, cellValue(v)});
        }
        return out;
    }

    private static boolean isRowArray(JsonNode node) {
        if (node == null || !node.isArray() || node.isEmpty()) return false;
        for (JsonNode el : node) {
            if (el == null || !el.isObject()) return false;
        }
        return true;
    }

    /** Render a JSON value as a plain cell string (objects/arrays as compact JSON). */
    private static String cellValue(JsonNode v) {
        if (v == null || v.isNull() || v.isMissingNode()) return "";
        if (v.isValueNode()) return v.asText();
        return v.toString();
    }

    /** Sanitize + de-duplicate a sheet name within Excel's 31-char / charset limits. */
    private static String uniqueSheetName(String raw, LinkedHashSet<String> used, String fallback) {
        String safe =
                WorkbookUtil.createSafeSheetName(raw == null || raw.isBlank() ? fallback : raw);
        String candidate = safe;
        int n = 2;
        while (!used.add(candidate)) {
            String suffix = " (" + n++ + ")";
            int keep = Math.min(safe.length(), 31 - suffix.length());
            candidate = safe.substring(0, keep) + suffix;
        }
        return candidate;
    }
}

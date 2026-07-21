package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.report.server.auth.Principal;
import com.report.server.auth.RateLimiter;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.io.ByteArrayOutputStream;
import java.util.*;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.xssf.streaming.SXSSFSheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Handles V2 form response export:
 *
 * <ul>
 *   <li>GET /api/v2/templates/{id}/responses/export?format=csv — UTF-8 CSV with BOM
 *   <li>GET /api/v2/templates/{id}/responses/export?format=excel — XLSX via Apache POI SXSSF
 * </ul>
 *
 * <p>Security:
 *
 * <ul>
 *   <li>Authentication required (enforced by before-filter)
 *   <li>Template ownership verified before export
 *   <li>Rate limited to 3 exports per userId per minute
 *   <li>CSV formula injection neutralised (=+-@\t\r|)
 *   <li>Excel cells always use {@code CellType.STRING} to prevent formula execution
 * </ul>
 */
public final class ResponseExportController {

    private static final Logger log = LoggerFactory.getLogger(ResponseExportController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final JsonBlobRepository responseRepo;
    private final JsonBlobRepository definitionsRepo;
    private final RateLimiter exportLimiter;

    public ResponseExportController(
            JsonBlobRepository responseRepo,
            JsonBlobRepository definitionsRepo,
            RateLimiter exportLimiter) {
        this.responseRepo = responseRepo;
        this.definitionsRepo = definitionsRepo;
        this.exportLimiter = exportLimiter;
    }

    /** GET /api/v2/templates/{id}/responses/export?format=csv|excel */
    public void export(Context ctx) {
        String templateId = RequestValidator.validateId(ctx);
        if (templateId == null) return;

        Principal principal = ctx.attribute("principal");

        // Rate limit by userId
        if (!exportLimiter.isAllowed(principal.userId())) {
            ApiError.respond(ctx, 429, "RATE_LIMITED", "Too many export requests. Please wait.");
            return;
        }

        // Verify template ownership
        Optional<String> defBlob = definitionsRepo.get(templateId);
        if (defBlob.isEmpty()) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Template not found");
            return;
        }
        try {
            JsonNode envelope = MAPPER.readTree(defBlob.get());
            String createdBy = envelope.path("created_by").asText("");
            if (!createdBy.isEmpty() && !principal.userId().equals(createdBy)) {
                ApiError.respond(ctx, HttpStatus.FORBIDDEN, "FORBIDDEN", "Access denied");
                return;
            }
        } catch (Exception e) {
            ApiError.respond(
                    ctx,
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "Failed to load template");
            return;
        }

        // Load responses
        List<String> jsonList;
        try {
            jsonList = responseRepo.listByGroupKey(templateId);
        } catch (Exception e) {
            log.error("Failed to load responses for V2 export, template {}", templateId, e);
            ApiError.respond(
                    ctx,
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "Failed to load responses");
            return;
        }

        if (jsonList.isEmpty()) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "No responses found");
            return;
        }

        // Parse all responses and collect union of field keys
        List<ParsedResponse> responses = new ArrayList<>();
        LinkedHashSet<String> allKeys = new LinkedHashSet<>();
        allKeys.add("id");
        allKeys.add("submittedAt");
        allKeys.add("submittedBy");
        allKeys.add("status"); // document lifecycle status (#171)

        for (String json : jsonList) {
            try {
                JsonNode node = MAPPER.readTree(json);
                responses.add(ParsedResponse.from(node));
                if (node.has("data") && node.get("data").isObject()) {
                    node.get("data").fieldNames().forEachRemaining(allKeys::add);
                }
            } catch (Exception e) {
                // skip malformed responses
            }
        }

        // Sort by submittedAt descending
        responses.sort(Comparator.comparingLong(ParsedResponse::submittedAt).reversed());

        String format = ctx.queryParam("format");
        try {
            if ("excel".equalsIgnoreCase(format)) {
                exportExcel(responses, allKeys, templateId, ctx);
            } else {
                exportCsv(responses, allKeys, templateId, ctx);
            }
        } catch (Exception e) {
            log.error("V2 export failed for template {}", templateId, e);
            ApiError.respond(
                    ctx, HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Export failed");
        }
    }

    // ── CSV ───────────────────────────────────────────────────────────────────

    private static void exportCsv(
            List<ParsedResponse> responses,
            LinkedHashSet<String> allKeys,
            String templateId,
            Context ctx) {
        List<String> keys = new ArrayList<>(allKeys);
        StringBuilder csv = new StringBuilder();
        csv.append('\uFEFF'); // UTF-8 BOM for Excel compatibility
        csv.append(
                String.join(
                        ",", keys.stream().map(ResponseExportController::escapeCsvField).toList()));
        csv.append("\r\n");

        for (ParsedResponse resp : responses) {
            for (int i = 0; i < keys.size(); i++) {
                if (i > 0) csv.append(',');
                String key = keys.get(i);
                String value =
                        switch (key) {
                            case "id" -> resp.id();
                            case "submittedAt" -> String.valueOf(resp.submittedAt());
                            case "submittedBy" -> resp.submittedBy();
                            case "status" -> resp.status();
                            default -> resp.dataValue(key);
                        };
                csv.append(escapeCsvField(value));
            }
            csv.append("\r\n");
        }

        ctx.contentType("text/csv; charset=utf-8");
        ctx.header(
                "Content-Disposition", "attachment; filename=\"responses-" + templateId + ".csv\"");
        ctx.result(csv.toString());
    }

    // ── Excel ─────────────────────────────────────────────────────────────────

    private static void exportExcel(
            List<ParsedResponse> responses,
            LinkedHashSet<String> allKeys,
            String templateId,
            Context ctx)
            throws Exception {
        List<String> keys = new ArrayList<>(allKeys);

        // SXSSFWorkbook: streaming mode, keeps only last 100 rows in memory
        try (SXSSFWorkbook wb = new SXSSFWorkbook(100)) {
            SXSSFSheet sheet = wb.createSheet("Responses");

            // Header row
            Row header = sheet.createRow(0);
            int col = 0;
            for (String key : keys) {
                Cell cell = header.createCell(col++, CellType.STRING);
                cell.setCellValue(key);
            }

            // Data rows
            int rowNum = 1;
            for (ParsedResponse resp : responses) {
                Row row = sheet.createRow(rowNum++);
                int colIdx = 0;
                for (String key : keys) {
                    String value =
                            switch (key) {
                                case "id" -> resp.id();
                                case "submittedAt" -> String.valueOf(resp.submittedAt());
                                case "submittedBy" -> resp.submittedBy();
                                case "status" -> resp.status();
                                default -> resp.dataValue(key);
                            };
                    // Always STRING type — prevents formula execution in Excel
                    Cell cell = row.createCell(colIdx++, CellType.STRING);
                    cell.setCellValue(value);
                }
            }

            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            wb.write(bos);
            wb.dispose();

            ctx.contentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            ctx.header(
                    "Content-Disposition",
                    "attachment; filename=\"responses-" + templateId + ".xlsx\"");
            ctx.result(bos.toByteArray());
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Escape a field value for CSV output. Neutralises formula injection characters at position 0,
     * removes null bytes, and always double-quotes the value for maximum safety.
     */
    static String escapeCsvField(String value) {
        if (value == null) return "\"\"";
        // Formula injection: prefix dangerous characters (=+-@\t\r|) with single-quote
        if (!value.isEmpty() && "=+-@\t\r|".indexOf(value.charAt(0)) >= 0) {
            value = "'" + value;
        }
        value = value.replace("\0", ""); // remove null bytes
        // Always quote — safest strategy
        return "\"" + value.replace("\"", "\"\"") + "\"";
    }

    /** Parsed form response for export. Immutable. */
    private record ParsedResponse(
            String id,
            long submittedAt,
            String submittedBy,
            String status,
            Map<String, String> data) {
        static ParsedResponse from(JsonNode node) {
            String id = node.path("id").asText("");
            long submittedAt = node.path("submittedAt").asLong(0);
            String submittedBy = node.path("submittedBy").asText("");
            // Document lifecycle status; default for legacy responses (#171).
            String status = node.path("status").asText("issued");
            Map<String, String> data = new LinkedHashMap<>();
            JsonNode dataNode = node.path("data");
            if (dataNode.isObject()) {
                dataNode.fields()
                        .forEachRemaining(
                                e -> {
                                    String v =
                                            e.getValue().isTextual()
                                                    ? e.getValue().asText()
                                                    : e.getValue().toString();
                                    data.put(e.getKey(), v);
                                });
            }
            return new ParsedResponse(id, submittedAt, submittedBy, status, data);
        }

        String dataValue(String key) {
            return data.getOrDefault(key, "");
        }
    }
}

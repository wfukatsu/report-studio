package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.report.server.auth.Principal;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.ByteArrayOutputStream;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Generates a PDF summary for a single V2 form response.
 *
 * <p>GET /api/v2/templates/{id}/responses/{rid}/pdf
 *
 * <p>Renders a simple key-value table PDF using Apache PDFBox directly.
 * Template definition is loaded server-side; client cannot supply projection JSON
 * (prevents SSRF / injection via crafted projection).
 *
 * <p>PDF generation runs on the {@code pdfExecutor} thread pool with a 30-second timeout.
 */
public final class V2ResponsePdfController {

    private static final Logger log = LoggerFactory.getLogger(V2ResponsePdfController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int TIMEOUT_SECONDS = 30;

    private static final float PAGE_MARGIN = 50f;
    private static final float LINE_HEIGHT = 16f;
    private static final float LABEL_COL_WIDTH = 180f;
    private static final float VALUE_COL_WIDTH = 300f;
    private static final float FONT_SIZE_TITLE = 14f;
    private static final float FONT_SIZE_HEADER = 10f;
    private static final float FONT_SIZE_BODY = 9f;

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter
        .ofPattern("yyyy-MM-dd HH:mm:ss")
        .withZone(ZoneId.systemDefault());

    private final JsonBlobRepository responseRepo;
    private final JsonBlobRepository definitionsRepo;
    private final ExecutorService pdfExecutor;

    public V2ResponsePdfController(
            JsonBlobRepository responseRepo,
            JsonBlobRepository definitionsRepo,
            ExecutorService pdfExecutor) {
        this.responseRepo = responseRepo;
        this.definitionsRepo = definitionsRepo;
        this.pdfExecutor = pdfExecutor;
    }

    /** GET /api/v2/templates/{id}/responses/{rid}/pdf */
    public void generatePdf(Context ctx) throws Exception {
        String templateId = RequestValidator.validateId(ctx);
        String responseId = RequestValidator.validateId(ctx, "rid");
        if (templateId == null || responseId == null) return;

        Principal principal = ctx.attribute("principal");

        // Load template
        Optional<String> defBlob = definitionsRepo.get(templateId);
        if (defBlob.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Template not found"));
            return;
        }

        // Ownership check
        try {
            JsonNode envelope = MAPPER.readTree(defBlob.get());
            String createdBy = envelope.path("created_by").asText("");
            if (!createdBy.isEmpty() && !principal.userId().equals(createdBy)) {
                ctx.status(HttpStatus.FORBIDDEN);
                ctx.json(Map.of("error", "Access denied"));
                return;
            }
        } catch (Exception e) {
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Failed to load template"));
            return;
        }

        // Load response
        Optional<String> responseBlob = responseRepo.get(responseId);
        if (responseBlob.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Response not found"));
            return;
        }

        JsonNode responseNode;
        try {
            responseNode = MAPPER.readTree(responseBlob.get());
        } catch (Exception e) {
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Failed to read response"));
            return;
        }

        // Verify response belongs to this template
        if (!templateId.equals(responseNode.path("templateId").asText(""))) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Response not found"));
            return;
        }

        // Build PDF asynchronously with timeout
        final JsonNode finalResponseNode = responseNode;
        final String finalDefBlob = defBlob.get();
        try {
            byte[] pdf = CompletableFuture
                .supplyAsync(() -> buildPdf(finalResponseNode, finalDefBlob), pdfExecutor)
                .get(TIMEOUT_SECONDS, TimeUnit.SECONDS);

            ctx.contentType("application/pdf");
            ctx.header("Content-Disposition",
                "attachment; filename=\"response-" + responseId + ".pdf\"");
            ctx.result(pdf);
        } catch (TimeoutException e) {
            log.warn("V2 response PDF generation timed out for response {}", responseId);
            ctx.status(504);
            ctx.json(Map.of("error", "PDF generation timed out"));
        } catch (Exception e) {
            log.error("V2 response PDF generation failed for response {}", responseId, e);
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "PDF generation failed"));
        }
    }

    // ── PDF rendering ─────────────────────────────────────────────────────────

    private static byte[] buildPdf(JsonNode responseNode, String defBlob) {
        try {
            // Extract template name
            String templateName = "フォーム回答票";
            try {
                JsonNode envelope = MAPPER.readTree(defBlob);
                String name = envelope.path("name").asText("");
                if (!name.isBlank()) templateName = name;
            } catch (Exception ignored) {}

            String responseId = responseNode.path("id").asText("");
            long submittedAt = responseNode.path("submittedAt").asLong(0);
            String submittedBy = responseNode.path("submittedBy").asText("unknown");
            JsonNode data = responseNode.path("data");

            // Collect data entries
            List<String[]> rows = new ArrayList<>();
            if (data.isObject()) {
                data.fields().forEachRemaining(e -> {
                    String key = e.getKey();
                    String value = e.getValue().isTextual()
                        ? e.getValue().asText()
                        : e.getValue().toString();
                    rows.add(new String[]{key, value});
                });
            }

            try (PDDocument doc = new PDDocument()) {
                PDType1Font fontBold = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
                PDType1Font fontRegular = new PDType1Font(Standard14Fonts.FontName.HELVETICA);

                float pageWidth = PDRectangle.A4.getWidth();
                float pageHeight = PDRectangle.A4.getHeight();
                float contentWidth = pageWidth - 2 * PAGE_MARGIN;

                // Estimate rows per page
                int rowsPerPage = (int) ((pageHeight - 2 * PAGE_MARGIN - 80f) / LINE_HEIGHT);
                int totalPages = Math.max(1, (int) Math.ceil((double) rows.size() / rowsPerPage));

                for (int pageIdx = 0; pageIdx < totalPages; pageIdx++) {
                    PDPage page = new PDPage(PDRectangle.A4);
                    doc.addPage(page);

                    try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                        float y = pageHeight - PAGE_MARGIN;

                        if (pageIdx == 0) {
                            // Title
                            cs.beginText();
                            cs.setFont(fontBold, FONT_SIZE_TITLE);
                            cs.newLineAtOffset(PAGE_MARGIN, y);
                            cs.showText(sanitize(templateName) + " — 回答票");
                            cs.endText();
                            y -= 24f;

                            // Meta info
                            cs.beginText();
                            cs.setFont(fontRegular, FONT_SIZE_HEADER);
                            cs.newLineAtOffset(PAGE_MARGIN, y);
                            cs.showText("ID: " + sanitize(responseId));
                            cs.endText();
                            y -= LINE_HEIGHT;

                            cs.beginText();
                            cs.setFont(fontRegular, FONT_SIZE_HEADER);
                            cs.newLineAtOffset(PAGE_MARGIN, y);
                            cs.showText("提出日時: " + formatDate(submittedAt));
                            cs.endText();
                            y -= LINE_HEIGHT;

                            cs.beginText();
                            cs.setFont(fontRegular, FONT_SIZE_HEADER);
                            cs.newLineAtOffset(PAGE_MARGIN, y);
                            cs.showText("提出者: " + sanitize(submittedBy));
                            cs.endText();
                            y -= 24f;

                            // Column headers
                            cs.setLineWidth(0.5f);
                            cs.moveTo(PAGE_MARGIN, y);
                            cs.lineTo(PAGE_MARGIN + contentWidth, y);
                            cs.stroke();
                            y -= LINE_HEIGHT;

                            cs.beginText();
                            cs.setFont(fontBold, FONT_SIZE_BODY);
                            cs.newLineAtOffset(PAGE_MARGIN, y);
                            cs.showText("フィールド");
                            cs.endText();

                            cs.beginText();
                            cs.setFont(fontBold, FONT_SIZE_BODY);
                            cs.newLineAtOffset(PAGE_MARGIN + LABEL_COL_WIDTH, y);
                            cs.showText("値");
                            cs.endText();
                            y -= LINE_HEIGHT;

                            cs.moveTo(PAGE_MARGIN, y);
                            cs.lineTo(PAGE_MARGIN + contentWidth, y);
                            cs.stroke();
                            y -= LINE_HEIGHT;
                        }

                        // Data rows for this page
                        int startRow = pageIdx * rowsPerPage;
                        int endRow = Math.min(startRow + rowsPerPage, rows.size());

                        for (int i = startRow; i < endRow; i++) {
                            String[] row = rows.get(i);
                            String label = truncate(sanitize(row[0]), 30);
                            String value = truncate(sanitize(row[1]), 50);

                            cs.beginText();
                            cs.setFont(fontRegular, FONT_SIZE_BODY);
                            cs.newLineAtOffset(PAGE_MARGIN, y);
                            cs.showText(label);
                            cs.endText();

                            cs.beginText();
                            cs.setFont(fontRegular, FONT_SIZE_BODY);
                            cs.newLineAtOffset(PAGE_MARGIN + LABEL_COL_WIDTH, y);
                            cs.showText(value);
                            cs.endText();

                            y -= LINE_HEIGHT;
                        }

                        // Page number
                        cs.beginText();
                        cs.setFont(fontRegular, FONT_SIZE_HEADER - 1f);
                        cs.newLineAtOffset(PAGE_MARGIN, PAGE_MARGIN - 10f);
                        cs.showText((pageIdx + 1) + " / " + totalPages);
                        cs.endText();
                    }
                }

                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                doc.save(bos);
                return bos.toByteArray();
            }
        } catch (Exception e) {
            throw new RuntimeException("PDF build failed", e);
        }
    }

    /** Remove non-ASCII and control chars safe for PDType1Font rendering. */
    private static String sanitize(String text) {
        if (text == null) return "";
        return text.chars()
            .filter(c -> c >= 0x20 && c <= 0x7E)
            .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append)
            .toString();
    }

    private static String truncate(String text, int maxLen) {
        if (text == null) return "";
        return text.length() > maxLen ? text.substring(0, maxLen) + "..." : text;
    }

    private static String formatDate(long epochMilli) {
        if (epochMilli == 0) return "unknown";
        return DATE_FMT.format(Instant.ofEpochMilli(epochMilli));
    }
}

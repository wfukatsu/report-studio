package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;

import java.awt.Color;
import java.io.IOException;
import java.util.Map;

import static com.report.server.pdf.PdfUtils.*;

/**
 * Renders shape elements (rectangle, ellipse) to PDF.
 * Phase 2 will add rounded-rectangle, triangle, diamond.
 */
public final class ShapePdfRenderer implements ElementPdfRenderer {

    @Override
    public String kind() {
        return "shape";
    }

    @Override
    public void render(PDPageContentStream cs, JsonNode el, float x, float y,
                       float w, float h, float pageHeight, PDDocument doc,
                       Map<String, PDFont> fontCache) throws IOException {
        JsonNode props = el.get("props");
        String shapeType = props != null ? textOf(props, "shapeType", "rectangle") : "rectangle";

        cs.setStrokingColor(Color.BLACK);
        cs.setLineWidth(1);

        cs.saveGraphicsState();
        cs.setStrokingColor(Color.BLACK);
        cs.setLineWidth(1);

        switch (shapeType) {
            case "ellipse" -> renderEllipse(cs, x, y, w, h);
            case "rounded-rectangle", "roundedRectangle" -> renderRoundedRect(cs, x, y, w, h, Math.min(w, h) * 0.15f);
            case "triangle" -> renderTriangle(cs, x, y, w, h);
            case "diamond" -> renderDiamond(cs, x, y, w, h);
            case "polygon" -> renderPolygon(cs, x, y, w, h, 6);
            default -> {
                cs.addRect(x, y - h, w, h);
                cs.stroke();
            }
        }

        cs.restoreGraphicsState();
    }

    private static void renderEllipse(PDPageContentStream cs, float x, float y, float w, float h) throws IOException {
        float cx = x + w / 2;
        float cy = y - h / 2;
        float rx = w / 2;
        float ry = h / 2;
        float k = 0.5522848f;
        cs.moveTo(cx - rx, cy);
        cs.curveTo(cx - rx, cy + ry * k, cx - rx * k, cy + ry, cx, cy + ry);
        cs.curveTo(cx + rx * k, cy + ry, cx + rx, cy + ry * k, cx + rx, cy);
        cs.curveTo(cx + rx, cy - ry * k, cx + rx * k, cy - ry, cx, cy - ry);
        cs.curveTo(cx - rx * k, cy - ry, cx - rx, cy - ry * k, cx - rx, cy);
        cs.stroke();
    }

    private static void renderRoundedRect(PDPageContentStream cs, float x, float y, float w, float h, float r) throws IOException {
        float bottom = y - h;
        float k = 0.5522848f * r;
        cs.moveTo(x + r, y);
        cs.lineTo(x + w - r, y);
        cs.curveTo(x + w - r + k, y, x + w, y - k, x + w, y - r);
        cs.lineTo(x + w, bottom + r);
        cs.curveTo(x + w, bottom + r - k, x + w - r + k, bottom, x + w - r, bottom);
        cs.lineTo(x + r, bottom);
        cs.curveTo(x + r - k, bottom, x, bottom + r - k, x, bottom + r);
        cs.lineTo(x, y - r);
        cs.curveTo(x, y - r + k, x + r - k, y, x + r, y);
        cs.closePath();
        cs.stroke();
    }

    private static void renderTriangle(PDPageContentStream cs, float x, float y, float w, float h) throws IOException {
        float midX = x + w / 2f;
        float bottom = y - h;
        cs.moveTo(midX, y);
        cs.lineTo(x + w, bottom);
        cs.lineTo(x, bottom);
        cs.closePath();
        cs.stroke();
    }

    private static void renderDiamond(PDPageContentStream cs, float x, float y, float w, float h) throws IOException {
        float midX = x + w / 2f;
        float midY = y - h / 2f;
        cs.moveTo(midX, y);
        cs.lineTo(x + w, midY);
        cs.lineTo(midX, y - h);
        cs.lineTo(x, midY);
        cs.closePath();
        cs.stroke();
    }

    private static void renderPolygon(PDPageContentStream cs, float x, float y, float w, float h, int sides) throws IOException {
        if (sides < 3) return;
        float cx = x + w / 2f;
        float cy = y - h / 2f;
        float rx = w / 2f;
        float ry = h / 2f;
        double angleStep = (2 * Math.PI) / sides;
        double startAngle = -Math.PI / 2;
        for (int i = 0; i < sides; i++) {
            double angle = startAngle + i * angleStep;
            float px = cx + (float) (rx * Math.cos(angle));
            float py = cy + (float) (ry * Math.sin(angle));
            if (i == 0) {
                cs.moveTo(px, py);
            } else {
                cs.lineTo(px, py);
            }
        }
        cs.closePath();
        cs.stroke();
    }
}

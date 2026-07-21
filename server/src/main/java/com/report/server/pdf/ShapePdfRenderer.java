package com.report.server.pdf;

import static com.report.server.pdf.PdfUtils.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.awt.Color;
import java.io.IOException;
import java.util.Map;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;

/**
 * Renders shape elements to PDF: the V2 kinds ({@code rectangle} incl. {@code borderRadius},
 * {@code circle}, {@code line}) plus the V1 {@code props.shapeType} variants (ellipse,
 * rounded-rectangle, triangle, diamond, polygon).
 *
 * <p>Style parity with the frontend SVG renderer (issue #314,
 * {@code src/elements/shape/Renderer.tsx}): {@code fill} (default transparent), {@code stroke}
 * (default black), {@code strokeWidth} (SVG user units = CSS px at canvas scale; converted at 1px =
 * 0.75pt), {@code strokeDash} (solid/dashed/dotted), and {@code borderRadius} (mm) on rectangles.
 */
public final class ShapePdfRenderer implements ElementPdfRenderer {

    /** 1 CSS px = 0.75 pt — the frontend canvas maps mm to px at 96dpi. */
    private static final float PX_TO_PT = 0.75f;

    private static final float DEFAULT_STROKE_PX = 0.3f;

    @Override
    public String kind() {
        return "shape";
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
        // V2 stores the kind in `shape`; V1 in `props.shapeType`
        String shapeType = elementTextOf(el, "shape", "");
        if (shapeType.isEmpty()) shapeType = elementTextOf(el, "shapeType", "rectangle");

        Color fill = parseColor(elementTextOf(el, "fill", ""), null);
        Color stroke = parseColor(elementTextOf(el, "stroke", ""), Color.BLACK);
        float strokePt = elementFloatOf(el, "strokeWidth", DEFAULT_STROKE_PX) * PX_TO_PT;
        String dash = elementTextOf(el, "strokeDash", "solid");
        boolean doStroke = strokePt > 0;

        cs.saveGraphicsState();
        cs.setStrokingColor(stroke);
        cs.setLineWidth(Math.max(0.1f, strokePt));
        if (fill != null) cs.setNonStrokingColor(fill);
        switch (dash) {
            case "dashed" -> cs.setLineDashPattern(new float[] {4.5f, 2.25f}, 0);
            case "dotted" -> cs.setLineDashPattern(new float[] {1.5f, 1.5f}, 0);
            default -> {}
        }

        switch (shapeType) {
            case "line" -> {
                // The frontend centers the line in the frame; orientation follows the
                // longer frame axis (vertical when height > width)
                if (h > w) {
                    cs.moveTo(x + w / 2, y);
                    cs.lineTo(x + w / 2, y - h);
                } else {
                    cs.moveTo(x, y - h / 2);
                    cs.lineTo(x + w, y - h / 2);
                }
                cs.stroke();
            }
            case "circle", "ellipse" -> {
                buildEllipse(cs, x, y, w, h);
                paint(cs, fill, doStroke);
            }
            case "rounded-rectangle", "roundedRectangle" -> {
                buildRoundedRect(cs, x, y, w, h, Math.min(w, h) * 0.15f);
                paint(cs, fill, doStroke);
            }
            case "triangle" -> {
                buildTriangle(cs, x, y, w, h);
                paint(cs, fill, doStroke);
            }
            case "diamond" -> {
                buildDiamond(cs, x, y, w, h);
                paint(cs, fill, doStroke);
            }
            case "polygon" -> {
                buildPolygon(cs, x, y, w, h, 6);
                paint(cs, fill, doStroke);
            }
            default -> {
                float radiusMm = elementFloatOf(el, "borderRadius", 0f);
                if (radiusMm > 0) {
                    float r = Math.min(radiusMm * PdfUnits.MM_TO_PT, Math.min(w, h) / 2);
                    buildRoundedRect(cs, x, y, w, h, r);
                } else {
                    cs.addRect(x, y - h, w, h);
                }
                paint(cs, fill, doStroke);
            }
        }

        cs.restoreGraphicsState();
    }

    /** Paint the current path: fill, stroke, or both. */
    private static void paint(PDPageContentStream cs, Color fill, boolean doStroke)
            throws IOException {
        if (fill != null && doStroke) cs.fillAndStroke();
        else if (fill != null) cs.fill();
        else cs.stroke();
    }

    private static void buildEllipse(PDPageContentStream cs, float x, float y, float w, float h)
            throws IOException {
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
        cs.closePath();
    }

    private static void buildRoundedRect(
            PDPageContentStream cs, float x, float y, float w, float h, float r)
            throws IOException {
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
    }

    private static void buildTriangle(PDPageContentStream cs, float x, float y, float w, float h)
            throws IOException {
        float midX = x + w / 2f;
        float bottom = y - h;
        cs.moveTo(midX, y);
        cs.lineTo(x + w, bottom);
        cs.lineTo(x, bottom);
        cs.closePath();
    }

    private static void buildDiamond(PDPageContentStream cs, float x, float y, float w, float h)
            throws IOException {
        float midX = x + w / 2f;
        float midY = y - h / 2f;
        cs.moveTo(midX, y);
        cs.lineTo(x + w, midY);
        cs.lineTo(midX, y - h);
        cs.lineTo(x, midY);
        cs.closePath();
    }

    private static void buildPolygon(
            PDPageContentStream cs, float x, float y, float w, float h, int sides)
            throws IOException {
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
    }
}

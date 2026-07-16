package com.report.server;

import com.report.server.pdf.PageContext;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.pdfparser.PDFStreamParser;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.util.HashMap;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for opt-in margin clipping (issue #55 — {@code pageSetup.clipToMargins}).
 * Clipping does not remove text from the content stream, so the assertions
 * inspect the stream for the clip operator ({@code W}) instead of parsing text.
 */
class PageContextClipTest {

    private static byte[] renderPage(float[] marginsMm) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (PDDocument doc = new PDDocument()) {
            try (PageContext ctx = new PageContext(doc, PDRectangle.A4, new HashMap<>())) {
                ctx.setClipToMargins(marginsMm);
                ctx.newPage();
            }
            doc.save(baos);
        }
        return baos.toByteArray();
    }

    private static boolean hasClipOperator(byte[] pdf) throws Exception {
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            PDPage page = doc.getPage(0);
            PDFStreamParser parser = new PDFStreamParser(page);
            List<Object> tokens = parser.parse();
            return tokens.stream().anyMatch(t ->
                    t instanceof Operator op && "W".equals(op.getName()));
        }
    }

    @Test
    void clipToMargins_appliesClipOperator() throws Exception {
        assertTrue(hasClipOperator(renderPage(new float[]{20, 20, 20, 20})));
    }

    @Test
    void withoutClipToMargins_noClipOperator() throws Exception {
        assertFalse(hasClipOperator(renderPage(null)));
    }

    @Test
    void degenerateMargins_skipClipping() throws Exception {
        // Margins wider than the page would blank it — clipping must be skipped
        assertFalse(hasClipOperator(renderPage(new float[]{300, 300, 300, 300})));
    }
}

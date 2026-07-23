package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.report.server.testsupport.PdfProbe;
import java.io.IOException;
import org.junit.jupiter.api.Test;

/**
 * Parse-back tests for barcode/QR front parity (#367): the human-readable caption, bar/module and
 * background colors, and the QR error-correction level.
 */
class PdfBarcodeQrParseBackTest {

    private static String pageWith(String element) {
        return """
            {"templates":[{
              "id":"t1","name":"Code",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[%s]
              }]
            }]}"""
                .formatted(element);
    }

    @Test
    void barcodeCaption_rendersValueWhenShowText() throws IOException {
        String on =
                """
            {"id":"bc","type":"barcode","name":"バーコード","value":"12345678",
             "position":{"x":20,"y":20},"size":{"width":60,"height":25},"showText":true}""";
        assertTrue(
                PdfProbe.parse(PdfRenderer.render(pageWith(on))).pageContains(0, "12345678"),
                "showText should render the caption");
    }

    @Test
    void barcodeCaption_hiddenWhenShowTextFalse() throws IOException {
        String off =
                """
            {"id":"bc","type":"barcode","name":"バーコード","value":"12345678",
             "position":{"x":20,"y":20},"size":{"width":60,"height":25},"showText":false}""";
        assertFalse(
                PdfProbe.parse(PdfRenderer.render(pageWith(off))).pageContains(0, "12345678"),
                "showText:false should omit the caption");
    }

    @Test
    void barcodeBarColor_appliesDarkColor() throws IOException {
        String el =
                """
            {"id":"bc","type":"barcode","name":"バーコード","value":"12345678",
             "position":{"x":20,"y":20},"size":{"width":60,"height":25},
             "showText":false,"darkColor":"#cc0000"}""";
        String content = PdfProbe.parse(PdfRenderer.render(pageWith(el))).pageContent(0);
        assertTrue(
                content.contains("0.8 0 0 sc"),
                "bars should use darkColor #cc0000 (sc):\n" + content);
    }

    @Test
    void qrColors_applyForegroundAndBackground() throws IOException {
        String el =
                """
            {"id":"qr","type":"qrcode","name":"QR","value":"https://example.com",
             "position":{"x":20,"y":20},"size":{"width":30,"height":30},
             "darkColor":"#0000cc","lightColor":"#eeeeee"}""";
        String content = PdfProbe.parse(PdfRenderer.render(pageWith(el))).pageContent(0);
        assertTrue(content.contains("0 0 0.8 sc"), "modules should use fg #0000cc");
        assertTrue(content.contains("0.93333 0.93333 0.93333 sc"), "bg should use #eeeeee");
    }

    @Test
    void qrErrorCorrection_changesEncoding() throws IOException {
        // The encode() call scales to a fixed 100×100 grid, so module count is not a version
        // signal; instead assert that switching L↔H changes the module pattern — proving the
        // errorCorrection field is wired into the ZXing hint (ZXing would otherwise default to L).
        String tmpl =
                """
            {"id":"qr","type":"qrcode","name":"QR",
             "value":"ERROR-CORRECTION-LEVEL-PARITY-TEST-1234567890",
             "position":{"x":20,"y":20},"size":{"width":40,"height":40},
             "errorCorrection":"%s"}""";
        String low =
                PdfProbe.parse(PdfRenderer.render(pageWith(tmpl.formatted("L")))).pageContent(0);
        String high =
                PdfProbe.parse(PdfRenderer.render(pageWith(tmpl.formatted("H")))).pageContent(0);
        assertNotEquals(low, high, "L and H should produce different QR encodings");
    }
}

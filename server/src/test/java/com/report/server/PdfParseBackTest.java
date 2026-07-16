package com.report.server;

import com.report.server.testsupport.PdfProbe;
import org.junit.jupiter.api.Test;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Parse-back contract tests for the PDF render pipeline (issue #59).
 *
 * <p>Unlike {@link PdfRendererTest} (which only checks that *a* PDF is produced),
 * these tests extract text, positions, and fonts from the rendered output and
 * assert the renderer's coordinate/typography contract.
 */
class PdfParseBackTest {

    private static final float POS_TOL_MM = 0.5f;

    private static PdfProbe render(String projectionJson) throws IOException {
        return PdfProbe.parse(PdfRenderer.render(projectionJson));
    }

    @Test
    void textElement_contentPositionAndFontSizeLandInPdf() throws IOException {
        String json = """
            {"templates":[{
              "id":"t1","name":"Contract",
              "pageSetup":{"kind":"preset","paperSizeId":"A4","orientation":"portrait"},
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[{
                  "id":"e1","kind":"text","name":"Title",
                  "frame":{"x":50,"y":30,"width":100,"height":12,"rotation":0},
                  "props":{"text":"Hello Contract","fontSize":16}
                }]
              }]
            }]}""";
        PdfProbe probe = render(json);

        assertEquals(1, probe.pageCount());
        assertEquals(210f, probe.pageWidthMm(0), 0.1f);
        assertEquals(297f, probe.pageHeightMm(0), 0.1f);

        PdfProbe.TextRun run = probe.findRun(0, "Hello Contract").orElseThrow(
                () -> new AssertionError("text not extracted; runs:\n" + probe.dumpRuns()));
        assertEquals(PdfProbe.expectedXMm(50), run.xMm(), POS_TOL_MM);
        assertEquals(PdfProbe.expectedBaselineYMm(30, 16), run.baselineYMm(), POS_TOL_MM);
        assertEquals(16f, run.fontSizePt(), 0.01f);
    }

    @Test
    void japaneseText_extractableWithEmbeddedNotoFont() throws IOException {
        String json = """
            {"templates":[{
              "id":"t1","name":"CJK",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[{
                  "id":"e1","kind":"text","name":"JP",
                  "frame":{"x":20,"y":20,"width":170,"height":10,"rotation":0},
                  "props":{"text":"株式会社スカラー 御見積書","fontSize":12}
                }]
              }]
            }]}""";
        PdfProbe probe = render(json);

        // NFKC normalization folds the subset font's Kangxi-radical codepoints back
        assertTrue(probe.pageContains(0, "株式会社スカラー"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "御見積書"), probe.pageText(0));

        PdfProbe.TextRun run = probe.findRun(0, "株式会社").orElseThrow();
        assertTrue(run.fontName().contains("NotoSansJP"),
                "CJK text must use the embedded Noto font, got: " + run.fontName());
    }

    @Test
    void warekiAndDaijiGlyphs_renderAndExtract() throws IOException {
        // 和暦・大字 — glyph coverage required by Japanese business forms
        String json = """
            {"templates":[{
              "id":"t1","name":"Wareki",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[
                  {"id":"e1","kind":"text","name":"Date",
                   "frame":{"x":20,"y":20,"width":170,"height":10,"rotation":0},
                   "props":{"text":"令和8年7月16日","fontSize":12}},
                  {"id":"e2","kind":"text","name":"Daiji",
                   "frame":{"x":20,"y":40,"width":170,"height":10,"rotation":0},
                   "props":{"text":"金壱百万円也","fontSize":12}}
                ]
              }]
            }]}""";
        PdfProbe probe = render(json);
        assertTrue(probe.pageContains(0, "令和8年7月16日"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "金壱百万円也"), probe.pageText(0));
    }

    @Test
    void scalarBindingRef_resolvesFormDataIntoText() throws IOException {
        String json = """
            {"templates":[{
              "id":"t1","name":"Binding",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[{
                  "id":"e1","kind":"text","name":"Customer",
                  "frame":{"x":20,"y":20,"width":170,"height":10,"rotation":0},
                  "bindingRef":"customer.name",
                  "props":{"fontSize":12}
                }]
              }]
            }],
            "_formData":{"customer.name":"テスト商事株式会社"}}""";
        PdfProbe probe = render(json);
        assertTrue(probe.pageContains(0, "テスト商事株式会社"), probe.pageText(0));
    }

    @Test
    void unknownElementKind_producesNoText() throws IOException {
        // Characterization: unknown kinds fall back to an empty border box.
        // Related gap: several V2 element types still hit this path (issue #53).
        String json = """
            {"templates":[{
              "id":"t1","name":"Unknown",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[{
                  "id":"e1","kind":"revenueStamp","name":"収入印紙",
                  "frame":{"x":150,"y":30,"width":20,"height":25,"rotation":0},
                  "props":{"text":"収入印紙","fontSize":12}
                }]
              }]
            }]}""";
        PdfProbe probe = render(json);
        assertFalse(probe.pageContains(0, "収入印紙"),
                "revenueStamp has no server renderer yet (#53) — update this test when implemented");
    }

    @Test
    void systemVariables_currentlyNotSubstituted() throws IOException {
        // Characterization of issue #54: {pageNumber}/{totalPages}/{currentDate}
        // bindingRefs are skipped in resolveFormData and never substituted at
        // render time — the element renders its (empty) props.text instead.
        String json = """
            {"templates":[{
              "id":"t1","name":"SysVar",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[{
                  "id":"e1","kind":"text","name":"PageNo",
                  "frame":{"x":100,"y":280,"width":30,"height":8,"rotation":0},
                  "bindingRef":"{pageNumber}",
                  "props":{"fontSize":10}
                }]
              }]
            }],
            "_formData":{}}""";
        PdfProbe probe = render(json);
        assertFalse(probe.pageText(0).matches("(?s).*\\d.*"),
                "page number should not appear yet — update this test when #54 lands: "
                        + probe.pageText(0));
    }
}

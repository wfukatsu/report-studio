package com.report.server;

import com.report.server.testsupport.PdfProbe;
import org.junit.jupiter.api.Test;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Parse-back tests for Japanese typography in the text renderer (issue #56):
 * multi-line wrapping, vertical writing (縦書き), furigana (ruby), synthetic bold.
 */
class PdfTypographyParseBackTest {

    private static String textEl(String extra) {
        return """
            {"templates":[{
              "id":"t1","name":"Typo",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[{
                  "id":"e1","type":"text","name":"T",
                  "position":{"x":20,"y":20},"size":{"width":40,"height":60},
                  %s
                }]
              }]
            }]}""".formatted(extra);
    }

    @Test
    void longText_wrapsAcrossMultipleLines() throws IOException {
        // 30 chars in a 40mm-wide box at 12pt must wrap to several lines
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(textEl("""
            "content":"これはとても長い日本語のテキストで折り返しの検証をします",
            "style":{"fontSize":12}""")));
        var runs = probe.runs(0);
        assertTrue(runs.size() >= 2, "text should wrap to multiple lines, got " + runs.size());
        // lines stack downward
        float y0 = runs.get(0).baselineYMm();
        float y1 = runs.get(1).baselineYMm();
        assertTrue(y1 > y0, "wrapped lines should stack downward");
        // full text still present across lines
        assertTrue(probe.pageText(0).replace("\n", "").contains("折り返し"));
    }

    @Test
    void explicitNewlines_produceSeparateLines() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(textEl("""
            "content":"一行目\\n二行目\\n三行目","style":{"fontSize":10}""")));
        assertTrue(probe.pageContains(0, "一行目"));
        assertTrue(probe.pageContains(0, "二行目"));
        assertTrue(probe.pageContains(0, "三行目"));
        var l1 = probe.findRun(0, "一行目").orElseThrow();
        var l3 = probe.findRun(0, "三行目").orElseThrow();
        assertTrue(l3.baselineYMm() > l1.baselineYMm());
    }

    @Test
    void verticalWriting_stacksCharactersTopToBottom() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(textEl("""
            "content":"御見積書","style":{"fontSize":14,"writingMode":"vertical-rl"}""")));
        // Each character on its own baseline, descending
        var mi = probe.findRun(0, "御").orElseThrow();
        var sho = probe.findRun(0, "書").orElseThrow();
        assertTrue(sho.baselineYMm() > mi.baselineYMm(),
                "御 (y=%.1f) should be above 書 (y=%.1f)".formatted(mi.baselineYMm(), sho.baselineYMm()));
        // Same column → same X
        assertEquals(mi.xMm(), sho.xMm(), 1.0f);
    }

    @Test
    void verticalWriting_wrapsToNewColumnRightToLeft() throws IOException {
        // 8 chars, box height only fits ~4 at 14pt → wraps to a 2nd column on the left
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render("""
            {"templates":[{
              "id":"t1","name":"VCol",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[{
                  "id":"e1","type":"text","name":"T",
                  "position":{"x":20,"y":20},"size":{"width":20,"height":25},
                  "content":"一二三四五六七八","style":{"fontSize":14,"writingMode":"vertical-rl"}
                }]
              }]
            }]}"""));
        var first = probe.findRun(0, "一").orElseThrow();
        var later = probe.findRun(0, "八").orElseThrow();
        // vertical-rl: later characters are in columns to the LEFT
        assertTrue(later.xMm() < first.xMm(),
                "八 (x=%.1f) should be left of 一 (x=%.1f)".formatted(later.xMm(), first.xMm()));
    }

    @Test
    void furigana_rendersRubyAboveMainText() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(textEl("""
            "content":"山田","furigana":"やまだ","furiganaScale":0.5,
            "style":{"fontSize":14}""")));
        assertTrue(probe.pageContains(0, "山田"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "やまだ"), probe.pageText(0));
        // ruby sits above the main text (smaller Y from top)
        var ruby = probe.findRun(0, "やまだ").orElseThrow();
        var main = probe.findRun(0, "山田").orElseThrow();
        assertTrue(ruby.baselineYMm() < main.baselineYMm(), "ruby should sit above main text");
        assertTrue(ruby.fontSizePt() < main.fontSizePt(), "ruby should be smaller");
    }

    @Test
    void bold_usesFillStrokeRenderMode() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(textEl("""
            "content":"太字テスト","style":{"fontSize":12,"bold":true}""")));
        assertTrue(probe.pageContains(0, "太字テスト"), probe.pageText(0));
        // synthetic bold sets text render mode 2 (fill+stroke) → "2 Tr" in the stream
        assertTrue(probe.pageContent(0).contains("2 Tr"), probe.pageContent(0));
    }

    @Test
    void nonBold_usesPlainFillRenderMode() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(textEl("""
            "content":"通常テキスト","style":{"fontSize":12}""")));
        assertFalse(probe.pageContent(0).contains("2 Tr"), "non-bold text must not stroke");
    }
}

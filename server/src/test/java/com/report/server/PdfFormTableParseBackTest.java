package com.report.server;

import com.report.server.testsupport.PdfProbe;
import org.junit.jupiter.api.Test;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Parse-back tests for FormTablePdfRenderer (issue #59).
 *
 * <p>Covers label/dataField/checkbox/eraSelect cells, merged-cell skipping,
 * and pins the production-path gap: the renderer reads form data from the
 * <em>element-level</em> {@code _formData} field, which no production code
 * ever injects — so dataField cells are always empty on the real render path
 * (issues #52/#53).
 */
class PdfFormTableParseBackTest {

    /**
     * A 2-column × 2-row formTable; {@code elementFormData} is injected as the
     * element-level {@code _formData} (renderer contract), or empty to exercise
     * the production shape where only the projection root carries form data.
     */
    private static String tableJson(String elementFormData, String rootFormData) {
        return """
            {"templates":[{
              "id":"t1","name":"FormTable",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[{
                  "id":"ft1","kind":"formTable","name":"個人情報",
                  "frame":{"x":15,"y":40,"width":180,"height":16,"rotation":0},
                  "columns":[{"width":30},{"width":50},{"width":60},{"width":40}],
                  "rows":[
                    {"height":8,"role":"header","cells":[
                      {"type":"label","text":"氏名"},
                      {"type":"label","text":"フリガナ"},
                      {"type":"label","text":"生年月日"},
                      {"type":"label","text":"性別"}
                    ]},
                    {"height":8,"role":"body","cells":[
                      {"type":"dataField","fieldKey":"person.name"},
                      {"type":"dataField","fieldKey":"person.kana"},
                      {"type":"eraSelect","eraDataSource":"person.era"},
                      {"type":"checkbox","checked":true,"text":"男"}
                    ]}
                  ]%s
                }]
              }]
            }]%s}""".formatted(elementFormData, rootFormData);
    }

    private static final String PERSON_DATA =
            "\"person.name\":\"山田太郎\",\"person.kana\":\"ヤマダタロウ\",\"person.era\":\"昭\"";

    @Test
    void labelCells_renderInColumnOrder() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(tableJson("", "")));
        assertTrue(probe.pageContains(0, "氏名"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "フリガナ"));
        assertTrue(probe.pageContains(0, "生年月日"));

        // Column order: 氏名 (col 0, x=15mm) precedes フリガナ (col 1, x=45mm)
        PdfProbe.TextRun name = probe.findRun(0, "氏名").orElseThrow();
        PdfProbe.TextRun kana = probe.findRun(0, "フリガナ").orElseThrow();
        assertTrue(name.xMm() < kana.xMm(),
                "氏名 (x=%.1f) should be left of フリガナ (x=%.1f)".formatted(name.xMm(), kana.xMm()));
        assertEquals(45f, kana.xMm(), 2.0f, "col-1 cell should start near x=45mm (+padding)");
    }

    @Test
    void dataFieldCells_resolveFromElementLevelFormData() throws IOException {
        // Renderer contract: with element-level _formData, dataField cells resolve.
        String json = tableJson(",\"_formData\":{%s}".formatted(PERSON_DATA), "");
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(json));
        assertTrue(probe.pageContains(0, "山田太郎"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "ヤマダタロウ"));
    }

    @Test
    void dataFieldCells_resolveFromRootFormData_onProductionPath() throws IOException {
        // #52/#53: SectionRenderHelper injects the projection-root _formData into
        // formTable elements, so dataField cells resolve on the production path.
        String json = tableJson("", ",\"_formData\":{%s}".formatted(PERSON_DATA));
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(json));
        assertTrue(probe.pageContains(0, "山田太郎"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "ヤマダタロウ"), probe.pageText(0));
    }

    @Test
    void eraSelectCell_marksSelectedEra() throws IOException {
        String json = tableJson(",\"_formData\":{%s}".formatted(PERSON_DATA), "");
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(json));
        assertTrue(probe.pageContains(0, "●昭"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "○平"), probe.pageText(0));
    }

    @Test
    void checkboxCell_rendersCheckmarkWithLabel() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(tableJson("", "")));
        assertTrue(probe.pageContains(0, "✓ 男"), probe.pageText(0));
    }

    @Test
    void mergedCells_areSkipped() throws IOException {
        String json = """
            {"templates":[{
              "id":"t1","name":"Merged",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[{
                  "id":"ft1","kind":"formTable","name":"結合",
                  "frame":{"x":15,"y":40,"width":120,"height":8,"rotation":0},
                  "columns":[{"width":60},{"width":60}],
                  "rows":[
                    {"height":8,"role":"body","cells":[
                      {"type":"label","text":"結合セル","colspan":2},
                      {"type":"label","text":"SHOULD-NOT-RENDER","mergedInto":"0-0"}
                    ]}
                  ]
                }]
              }]
            }]}""";
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(json));
        assertTrue(probe.pageContains(0, "結合セル"));
        assertFalse(probe.pageContains(0, "SHOULD-NOT-RENDER"), probe.pageText(0));
    }
}

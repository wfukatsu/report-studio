package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.report.server.testsupport.PdfProbe;
import java.io.IOException;
import org.junit.jupiter.api.Test;

/**
 * Parse-back tests for FormTablePdfRenderer (issue #59).
 *
 * <p>Covers label/dataField/checkbox/eraSelect cells, merged-cell skipping, and pins the
 * production-path gap: the renderer reads form data from the <em>element-level</em> {@code
 * _formData} field, which no production code ever injects — so dataField cells are always empty on
 * the real render path (issues #52/#53).
 */
class PdfFormTableParseBackTest {

    /**
     * A 2-column × 2-row formTable; {@code elementFormData} is injected as the element-level {@code
     * _formData} (renderer contract), or empty to exercise the production shape where only the
     * projection root carries form data.
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
            }]%s}"""
                .formatted(elementFormData, rootFormData);
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
        assertTrue(
                name.xMm() < kana.xMm(),
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

    /**
     * A single-body-row formTable bound to {@code dataSource:"items"}, with an optional maxItems.
     */
    private static String detailTableJson(String extraElProps, String itemsArray) {
        return """
            {"templates":[{
              "id":"t1","name":"Detail",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[{
                  "id":"ft1","kind":"formTable","name":"明細","dataSource":"items"%s,
                  "frame":{"x":15,"y":40,"width":120,"height":32,"rotation":0},
                  "columns":[{"width":60},{"width":60}],
                  "rows":[
                    {"height":8,"role":"header","cells":[
                      {"type":"label","text":"品名"},
                      {"type":"label","text":"数量"}
                    ]},
                    {"height":8,"role":"body","cells":[
                      {"type":"dataField","fieldKey":"name"},
                      {"type":"dataField","fieldKey":"qty"}
                    ]}
                  ]
                }]
              }]
            }],"_formData":{"items":%s}}"""
                .formatted(extraElProps, itemsArray);
    }

    private static final String THREE_ITEMS =
            "[{\"name\":\"りんご\",\"qty\":\"3\"},"
                    + "{\"name\":\"みかん\",\"qty\":\"5\"},"
                    + "{\"name\":\"ぶどう\",\"qty\":\"2\"}]";

    @Test
    void bodyRows_repeatPerRecord_whenDataSourceBound() throws IOException {
        // #352: dataSource-bound body rows repeat once per record (header renders once).
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(detailTableJson("", THREE_ITEMS)));
        assertTrue(probe.pageContains(0, "品名"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "りんご"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "みかん"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "ぶどう"), probe.pageText(0));

        // Rows stack top-to-bottom in record order: りんご above みかん above ぶどう.
        PdfProbe.TextRun r0 = probe.findRun(0, "りんご").orElseThrow();
        PdfProbe.TextRun r1 = probe.findRun(0, "みかん").orElseThrow();
        PdfProbe.TextRun r2 = probe.findRun(0, "ぶどう").orElseThrow();
        assertTrue(
                r0.baselineYMm() < r1.baselineYMm() && r1.baselineYMm() < r2.baselineYMm(),
                "record rows should stack downward: %.1f < %.1f < %.1f"
                        .formatted(r0.baselineYMm(), r1.baselineYMm(), r2.baselineYMm()));
    }

    @Test
    void bodyRows_respectMaxItems() throws IOException {
        // #352: maxItems caps the number of repeated body rows.
        PdfProbe probe =
                PdfProbe.parse(PdfRenderer.render(detailTableJson(",\"maxItems\":2", THREE_ITEMS)));
        assertTrue(probe.pageContains(0, "りんご"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "みかん"), probe.pageText(0));
        assertFalse(probe.pageContains(0, "ぶどう"), probe.pageText(0));
    }

    @Test
    void defaultCellFontSize_is8pt() throws IOException {
        // #353: server default cell font size matches the front (DEFAULT_CELL_FONT_SIZE_PT = 8pt).
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(tableJson("", "")));
        PdfProbe.TextRun name = probe.findRun(0, "氏名").orElseThrow();
        assertEquals(8f, name.fontSizePt(), 0.01f, "unstyled cell should render at 8pt");
    }

    @Test
    void headerRow_defaultsBold_bodyStaysRegular() throws IOException {
        // #353: header rows default to bold; body rows do not (front resolveFontWeight parity).
        String json = tableJson(",\"_formData\":{%s}".formatted(PERSON_DATA), "");
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(json));
        PdfProbe.TextRun header = probe.findRun(0, "氏名").orElseThrow();
        assertTrue(header.fontName().contains("NotoSansJP-Bold"), header.fontName());
        PdfProbe.TextRun body = probe.findRun(0, "山田太郎").orElseThrow();
        assertFalse(body.fontName().contains("Bold"), body.fontName());
    }

    @Test
    void columnAlign_rightAlignsCellText() throws IOException {
        // #353: column.align feeds cell text alignment when the cell has no explicit textAlign.
        String json =
                """
            {"templates":[{
              "id":"t1","name":"Align",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[{
                  "id":"ft1","kind":"formTable","name":"揃え",
                  "frame":{"x":15,"y":40,"width":80,"height":8,"rotation":0},
                  "columns":[{"width":80,"align":"right"}],
                  "rows":[
                    {"height":8,"role":"header","cells":[{"type":"label","text":"右"}]}
                  ]
                }]
              }]
            }]}""";
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(json));
        PdfProbe.TextRun run = probe.findRun(0, "右").orElseThrow();
        // Column spans x=15..95mm; right-aligned text sits in the right half (default left ≈ 16mm).
        assertTrue(
                run.xMm() > 55f,
                "right-aligned text should sit near the right edge, got x=%.1f"
                        .formatted(run.xMm()));
    }

    @Test
    void mergedCells_areSkipped() throws IOException {
        String json =
                """
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

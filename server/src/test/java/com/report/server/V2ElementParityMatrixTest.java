package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.report.server.pdf.ElementPdfRendererRegistry;
import com.report.server.testsupport.PdfProbe;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.Test;

/**
 * Designer⇔PDF element parity matrix (issue #59).
 *
 * <p>Pins the set of V2 element types that have a server-side PDF renderer, and generates a
 * human-readable matrix at {@code build/reports/parity/parity-matrix.md}. When issue #53 adds a
 * renderer (or a type mapping), the characterization assertion fails on purpose — update {@link
 * #EXPECTED_SUPPORTED} and the matrix regenerates.
 */
class V2ElementParityMatrixTest {

    /** All V2 element types — mirror of the ReportElement union in src/types/index.ts. */
    private static final Map<String, String> V2_TYPES_WITH_NOTES = buildTypeNotes();

    /** V2 types that resolve to a registered renderer today. */
    private static final Set<String> EXPECTED_SUPPORTED =
            Set.of(
                    "text",
                    "shape",
                    "image",
                    "barcode",
                    "checkbox",
                    "formTable",
                    "hanko",
                    "divider",
                    "eraSelect",
                    "revenueStamp",
                    "approvalStampRow",
                    "dataField",
                    "pageNumber",
                    "currentDate",
                    "tenantCompanyName",
                    "tenantAddress",
                    "tenantPhone",
                    "tenantRepresentative",
                    "tenantLogo",
                    "tenantCustom",
                    "manualEntry",
                    "chart",
                    "repeatingBand",
                    "repeatingList");

    private static Map<String, String> buildTypeNotes() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("text", "props.text のみ。V2 の content フィールドは未解釈（#52/#53）");
        m.put(
                "dataField",
                "対応（DataFieldPdfRenderer + ValueFormatter — 数値/日付/和暦/大字/住所書式、fieldKey 解決、textAlign）");
        m.put("chart", "対応（ChartPdfRenderer — bar/line/pie/donut をネイティブ描画）");
        m.put(
                "repeatingBand",
                "対応（RepeatingBandPdfRenderer — 要素内テーブル。groupBy/小計は detail_table セクション側）");
        m.put("repeatingList", "対応（RepeatingListPdfRenderer — vertical/horizontal/grid カードレイアウト）");
        m.put(
                "formTable",
                "対応（kind 名一致）。input=プレースホルダ灰斜体・checkbox=枠付きボックス+チェック・eraSelect=○●マーカーを front 同様にウィジェット描画（#373）");
        m.put("shape", "対応");
        m.put("image", "対応（URL 取得時は SSRF ガードあり）");
        m.put("barcode", "対応（qrcode は別 kind）");
        m.put("manualEntry", "対応（ManualEntryPdfRenderer — line/box/grid・ラベル・ふりがな帯）");
        m.put("checkbox", "対応（CheckPdfRenderer）");
        m.put("eraSelect", "対応（EraSelectPdfRenderer — column/row/grid-2col、dataSource 解決）");
        m.put("hanko", "対応（HankoPdfRenderer — 円/角・二重枠・縦書き・色・binding 解決）");
        m.put(
                "approvalStampRow",
                "対応（ApprovalStampRowPdfRenderer — 役職ラベル帯・セル区切り・stampSrc 押印画像（80% aspect-fit・85% 不透明度））");
        m.put("revenueStamp", "対応（RevenueStampPdfRenderer — ラベル・金額・消印ガイド破線）");
        m.put(
                "pageNumber",
                "対応（PageContext から解決。{{page}}/{{pages}} テンプレート・{pageNumber} bindingRef）");
        m.put("currentDate", "対応（_printDate/当日から解決。和暦・曜日・カスタムパターン）");
        m.put("divider", "対応（DividerPdfRenderer — 方向・太さ・破線・色）");
        m.put("tenantCompanyName", "対応（TenantInfoProvider / _tenant から解決、fallback 対応）");
        m.put("tenantAddress", "対応（displayMode single/multiLine、formatAddress 互換）");
        m.put("tenantPhone", "対応");
        m.put("tenantRepresentative", "対応（representativeName）");
        m.put("tenantLogo", "対応（logoBase64 data-URI を image 要素として描画）");
        m.put("tenantCustom", "対応（custom[fieldKey]）");
        return m;
    }

    @Test
    void supportedTypeSet_isPinned_andMatrixReportGenerated() throws IOException {
        ElementPdfRendererRegistry registry = ElementPdfRendererRegistry.createDefault();

        Set<String> actualSupported = new TreeSet<>();
        StringBuilder md = new StringBuilder();
        md.append("# V2 要素タイプ × サーバ PDF レンダラー パリティマトリクス\n\n");
        md.append("`V2ElementParityMatrixTest` が生成（フロント側の型一覧は `src/types/index.ts`）。\n\n");
        md.append("| V2 type | サーバ対応 | 備考 |\n|---|---|---|\n");

        for (Map.Entry<String, String> e : V2_TYPES_WITH_NOTES.entrySet()) {
            boolean supported = registry.get(e.getKey()).isPresent();
            if (supported) actualSupported.add(e.getKey());
            md.append("| `")
                    .append(e.getKey())
                    .append("` | ")
                    .append(supported ? "✅" : "❌")
                    .append(" | ")
                    .append(e.getValue())
                    .append(" |\n");
        }

        Path report = Path.of("build", "reports", "parity", "parity-matrix.md");
        Files.createDirectories(report.getParent());
        Files.writeString(report, md.toString());

        assertEquals(
                new TreeSet<>(EXPECTED_SUPPORTED),
                actualSupported,
                "server renderer coverage changed — update EXPECTED_SUPPORTED, the notes map, "
                        + "and the parity matrix doc (report at "
                        + report
                        + ")");
    }

    // ── V2 end-to-end characterization ─────────────────────────────────

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void v2TextElement_contentFieldRenders() throws Exception {
        // V2 text elements carry their string in `content` (src/types/index.ts).
        // TextPdfRenderer now resolves props.text → content → name (#52).
        String definition =
                """
            {
              "id":"def-1",
              "metadata":{"documentName":"V2 Parity"},
              "pageSettings":{"paperSize":"A4","orientation":"portrait",
                              "margins":{"top":20,"right":20,"bottom":20,"left":20},"unit":"mm"},
              "pages":[{
                "id":"p1","name":"ページ 1","width":210,"height":297,
                "sections":[{
                  "id":"s1","sectionType":"body","height":297,
                  "elements":[{
                    "id":"e1","type":"text","name":"NAMEFALLBACK",
                    "position":{"x":20,"y":20},"size":{"width":100,"height":10},
                    "content":"V2本文コンテンツ",
                    "style":{"fontSize":12}
                  }]
                }]
              }]
            }""";
        JsonNode def = MAPPER.readTree(definition);
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.renderDefinition(V2RenderSupport.prepare(def, null, null)));

        assertTrue(
                probe.allText().contains("V2本文コンテンツ"),
                "V2 content should render; runs:\n" + probe.dumpRuns());
        assertFalse(
                probe.allText().contains("NAMEFALLBACK"),
                "name fallback should not appear when content is present");
    }

    @Test
    void v2MultiplePages_renderAsSeparatePages() throws Exception {
        // #52: renderDefinition preserves designed page boundaries — page 2's
        // content no longer bleeds onto page 1 (was flattened by V2ProjectionBuilder).
        String definition =
                """
            {
              "id":"def-2",
              "metadata":{"documentName":"V2 Pages"},
              "pageSettings":{"paperSize":"A4","orientation":"portrait",
                              "margins":{"top":20,"right":20,"bottom":20,"left":20},"unit":"mm"},
              "pages":[
                {"id":"p1","name":"ページ 1","width":210,"height":297,
                 "sections":[{"id":"s1","sectionType":"body","height":297,
                   "elements":[{"id":"e1","type":"text","name":"PAGE1TEXT",
                     "position":{"x":20,"y":20},"size":{"width":100,"height":10}}]}]},
                {"id":"p2","name":"ページ 2","width":210,"height":297,
                 "sections":[{"id":"s2","sectionType":"body","height":297,
                   "elements":[{"id":"e2","type":"text","name":"PAGE2TEXT",
                     "position":{"x":20,"y":40},"size":{"width":100,"height":10}}]}]}
              ]
            }""";
        JsonNode def = MAPPER.readTree(definition);
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.renderDefinition(V2RenderSupport.prepare(def, null, null)));

        assertEquals(2, probe.pageCount(), "designed page boundaries preserved");
        assertTrue(probe.pageContains(0, "PAGE1TEXT"));
        assertFalse(probe.pageContains(0, "PAGE2TEXT"), "page 2 must not bleed onto page 1");
        assertTrue(probe.pageContains(1, "PAGE2TEXT"));
    }

    @Test
    void v2Barcode_acceptedByValidator_andRoutesToRenderer_notBlankFallback() throws Exception {
        // #182: the barcode element's discriminator field is named `kind`
        // (qr/code128/…) — a FORMAT, not an element kind. Regression guard for
        // two failures: (1) the stateless validator rejecting it as an unknown
        // element type, and (2) resolveKind routing it to the blank fallback box
        // instead of Barcode/QrCodePdfRenderer. The parity test above only
        // checks registry membership, which does not exercise this path.
        String barcodeTemplate =
                """
            {
              "id":"def-bc","metadata":{"documentName":"Barcode"},
              "pageSettings":{"paperSize":"A4","orientation":"portrait",
                              "margins":{"top":20,"right":20,"bottom":20,"left":20},"unit":"mm"},
              "pages":[{
                "id":"p1","name":"ページ 1","width":210,"height":297,
                "sections":[{"id":"s1","sectionType":"body","height":297,"elements":[
                  {"id":"b1","type":"barcode","kind":"code128","value":"HELLO123",
                   "position":{"x":20,"y":20},"size":{"width":60,"height":20}},
                  {"id":"q1","type":"barcode","kind":"qr","value":"https://example.com",
                   "position":{"x":20,"y":60},"size":{"width":40,"height":40}}
                ]}]
              }]
            }""";

        // (1) The stateless PDF/Excel validator must accept the barcode/QR template.
        JsonNode request = MAPPER.readTree("{\"template\":" + barcodeTemplate + "}");
        assertNull(
                RequestValidator.validatePdfGenerateRequest(request),
                "barcode/QR template must not be rejected as an unknown element type (#182)");

        // (2) Both elements must actually render (many filled rectangles), not
        // the single-rectangle blank fallback box.
        JsonNode def = MAPPER.readTree(barcodeTemplate);
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.renderDefinition(V2RenderSupport.prepare(def, null, null)));
        assertEquals(1, probe.pageCount());

        // Differential check against a control whose barcode/QR values are empty
        // (each draws only a single fallback border rectangle). The real render
        // emits far more graphics operators, so its content stream is much
        // longer — format-agnostic and robust to PDFBox operator formatting.
        String blankTemplate =
                barcodeTemplate
                        .replace("\"HELLO123\"", "\"\"")
                        .replace("\"https://example.com\"", "\"\"");
        PdfProbe blank =
                PdfProbe.parse(
                        PdfRenderer.renderDefinition(
                                V2RenderSupport.prepare(
                                        MAPPER.readTree(blankTemplate), null, null)));
        int rendered = probe.pageContent(0).length();
        int fallback = blank.pageContent(0).length();
        assertTrue(
                rendered > fallback * 3,
                "barcode + QR should draw many graphics ops (rendered="
                        + rendered
                        + " vs blank-fallback="
                        + fallback
                        + "); comparable size indicates the #182 blank-fallback regression");
    }
}

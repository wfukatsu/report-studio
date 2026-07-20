package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.report.server.testsupport.PdfProbe;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * Golden-template regression test for the 扶養控除等（異動）申告書 fixture (issue #59; designer-vs-PDF diffs
 * were previously tracked manually in docs/issues/fuyou-kojo-pdf-comparison-issues.md).
 *
 * <p>Exercises the Japanese-form features the server engine supports today: landscape A4, formTable
 * with label/dataField/eraSelect/checkbox cells, and scalar bindingRef resolution.
 */
class PdfGoldenFuyouKojoTest {

    private static final float POS_TOL_MM = 0.5f;

    private static PdfProbe probe;

    @BeforeAll
    static void renderGolden() throws IOException {
        String json;
        try (InputStream is =
                PdfGoldenFuyouKojoTest.class.getResourceAsStream(
                        "/golden/fuyou-kojo-projection.json")) {
            assertNotNull(is, "golden fixture missing");
            json = new String(is.readAllBytes(), StandardCharsets.UTF_8);
        }
        probe = PdfProbe.parse(PdfRenderer.render(json));
    }

    @Test
    void singleLandscapeA4Page() {
        assertEquals(1, probe.pageCount());
        assertEquals(297f, probe.pageWidthMm(0), 0.1f);
        assertEquals(210f, probe.pageHeightMm(0), 0.1f);
    }

    @Test
    void titleAndYearRenderAtDesignPosition() {
        PdfProbe.TextRun title =
                probe.findRun(0, "扶養控除等（異動）申告書")
                        .orElseThrow(
                                () ->
                                        new AssertionError(
                                                "title missing; runs:\n" + probe.dumpRuns()));
        assertEquals(PdfProbe.expectedXMm(70), title.xMm(), POS_TOL_MM);
        assertEquals(PdfProbe.expectedBaselineYMm(10, 14), title.baselineYMm(), POS_TOL_MM);
        assertTrue(probe.pageContains(0, "令和8年分"));
    }

    @Test
    void employerNameResolvesFromRootFormData() {
        assertTrue(probe.pageContains(0, "株式会社スカラー"), probe.pageText(0));
    }

    @Test
    void tableHeadersAndRowLabelsRender() {
        assertTrue(probe.pageContains(0, "氏名（フリガナ）"));
        assertTrue(probe.pageContains(0, "生年月日"));
        assertTrue(probe.pageContains(0, "本人"));
        assertTrue(probe.pageContains(0, "配偶者"));
    }

    @Test
    void dataFieldCellsResolveFromElementFormData() {
        assertTrue(probe.pageContains(0, "山田太郎"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "山田花子"));
    }

    @Test
    void eraSelectCellsMarkTheBoundEra() {
        // taxpayer: 昭 selected; spouse: 平 selected
        assertTrue(probe.pageContains(0, "●昭"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "●平"), probe.pageText(0));
    }

    @Test
    void checkboxCellsRenderCheckedAndUncheckedStates() {
        assertTrue(probe.pageContains(0, "✓ 源泉控除"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "□ 源泉控除"), probe.pageText(0));
    }
}

package com.report.server;

import com.report.server.testsupport.PdfProbe;
import org.junit.jupiter.api.Test;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Parse-back tests for the remaining V2 data/entry element renderers
 * (issue #53): manualEntry, chart, repeatingBand, repeatingList.
 */
class PdfDataElementsParseBackTest {

    private static String pageWith(String elements, String formData) {
        return """
            {"templates":[{
              "id":"t1","name":"DataElements",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[%s]
              }]
            }]%s}""".formatted(elements, formData == null ? "" : ",\"_formData\":" + formData);
    }

    // ── manualEntry ─────────────────────────────────────────────────────

    @Test
    void manualEntry_rendersLabelAndPlaceholder() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(pageWith("""
            {"id":"m1","type":"manualEntry","name":"氏名欄","label":"氏名",
             "labelPosition":"top","displayMode":"line","lineColor":"#000000",
             "placeholder":"ここに記入","style":{"fontSize":10},
             "position":{"x":20,"y":20},"size":{"width":80,"height":15}}""", null)));
        assertTrue(probe.pageContains(0, "氏名"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "ここに記入"), probe.pageText(0));
    }

    @Test
    void manualEntry_gridDrawsSeparators() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(pageWith("""
            {"id":"m1","type":"manualEntry","name":"コード","label":"","labelPosition":"none",
             "displayMode":"grid","gridCount":5,"lineColor":"#000000","style":{"fontSize":10},
             "position":{"x":20,"y":20},"size":{"width":50,"height":10}}""", null)));
        // grid draws a box + inner separators → multiple stroke ops (line "l")
        long lineOps = probe.pageContent(0).lines().filter(l -> l.trim().endsWith(" l")).count();
        assertTrue(lineOps >= 4, "grid should stroke separator lines, saw " + lineOps);
    }

    @Test
    void manualEntry_furiganaZoneShowsResolvedValue() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(pageWith("""
            {"id":"m1","type":"manualEntry","name":"氏名欄","label":"氏名",
             "labelPosition":"top","displayMode":"line","lineColor":"#000000",
             "furiganaEnabled":true,"furiganaDataSource":"person.kana",
             "style":{"fontSize":10},
             "position":{"x":20,"y":20},"size":{"width":80,"height":20}}""",
                "{\"person.kana\":\"ヤマダ\"}")));
        assertTrue(probe.pageContains(0, "フリガナ"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "ヤマダ"), probe.pageText(0));
    }

    // ── chart ───────────────────────────────────────────────────────────

    @Test
    void barChart_rendersTitleAndAxisLabels() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(pageWith("""
            {"id":"c1","type":"chart","name":"売上","chartType":"bar",
             "title":"月次売上","dataBinding":"sales","xAxisKey":"month","yAxisKeys":["amount"],
             "position":{"x":20,"y":20},"size":{"width":120,"height":70}}""",
                "{\"sales\":[{\"month\":\"1月\",\"amount\":100},{\"month\":\"2月\",\"amount\":200},{\"month\":\"3月\",\"amount\":150}]}")));
        assertTrue(probe.pageContains(0, "月次売上"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "1月"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "3月"), probe.pageText(0));
        // bars filled with the palette's first color (0x8884d8 → 0.533 0.518 0.847)
        // set via DeviceRGB non-stroking color ("... sc") then a filled rect
        assertTrue(probe.pageContent(0).contains("0.53333"), "bar fill color missing");
        assertTrue(probe.pageContent(0).lines().anyMatch(l -> l.trim().equals("re")
                || l.trim().endsWith(" re")), "bar rects missing");
    }

    @Test
    void chart_withNoData_rendersEmptyState() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(pageWith("""
            {"id":"c1","type":"chart","name":"空","chartType":"bar",
             "dataBinding":"missing","xAxisKey":"month","yAxisKeys":["amount"],
             "position":{"x":20,"y":20},"size":{"width":120,"height":70}}""", "{}")));
        assertTrue(probe.pageContains(0, "データなし"), probe.pageText(0));
    }

    @Test
    void pieChart_fillsSectors() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(pageWith("""
            {"id":"c1","type":"chart","name":"構成","chartType":"pie",
             "dataBinding":"shares","yAxisKeys":["value"],
             "position":{"x":20,"y":20},"size":{"width":80,"height":80}}""",
                "{\"shares\":[{\"name\":\"A\",\"value\":30},{\"name\":\"B\",\"value\":70}]}")));
        // sectors are filled paths → standalone fill ops present
        assertTrue(probe.pageContent(0).lines().anyMatch(l -> l.trim().equals("f")),
                "pie should fill sectors");
    }

    // ── repeatingBand ───────────────────────────────────────────────────

    @Test
    void repeatingBand_rendersHeaderAndBoundRows() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(pageWith("""
            {"id":"b1","type":"repeatingBand","name":"明細","dataSource":"items","showHeader":true,
             "fields":[
               {"key":"name","label":"品目","width":50,"align":"left"},
               {"key":"amount","label":"金額","width":30,"align":"right","format":{"type":"comma"}}],
             "position":{"x":15,"y":20},"size":{"width":120,"height":40}}""",
                "{\"items\":[{\"name\":\"りんご\",\"amount\":1200},{\"name\":\"みかん\",\"amount\":800}]}")));
        assertTrue(probe.pageContains(0, "品目"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "金額"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "りんご"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "1,200"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "みかん"), probe.pageText(0));
    }

    @Test
    void repeatingBand_maxItemsClipsRows() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(pageWith("""
            {"id":"b1","type":"repeatingBand","name":"明細","dataSource":"items","showHeader":false,
             "maxItems":2,"fields":[{"key":"name","label":"品目","width":50,"align":"left"}],
             "position":{"x":15,"y":20},"size":{"width":60,"height":60}}""",
                "{\"items\":[{\"name\":\"一\"},{\"name\":\"二\"},{\"name\":\"三\"}]}")));
        assertTrue(probe.pageContains(0, "一"));
        assertTrue(probe.pageContains(0, "二"));
        assertFalse(probe.pageContains(0, "三"), probe.pageText(0));
    }

    // ── repeatingList ───────────────────────────────────────────────────

    @Test
    void repeatingList_verticalCardsRenderFieldValues() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(pageWith("""
            {"id":"l1","type":"repeatingList","name":"カード","dataSource":"people",
             "layout":"vertical","gridColumns":1,"itemWidth":80,"itemHeight":12,"gap":2,
             "fields":[
               {"key":"氏名:","x":2,"y":2,"width":15,"height":6,"isLabel":true},
               {"key":"name","x":20,"y":2,"width":50,"height":6}],
             "position":{"x":15,"y":20},"size":{"width":85,"height":60}}""",
                "{\"people\":[{\"name\":\"田中\"},{\"name\":\"鈴木\"}]}")));
        assertTrue(probe.pageContains(0, "氏名:"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "田中"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "鈴木"), probe.pageText(0));

        // vertical layout: 鈴木 (item 2) sits below 田中 (item 1)
        PdfProbe.TextRun a = probe.findRun(0, "田中").orElseThrow();
        PdfProbe.TextRun b = probe.findRun(0, "鈴木").orElseThrow();
        assertTrue(b.baselineYMm() > a.baselineYMm());
    }
}

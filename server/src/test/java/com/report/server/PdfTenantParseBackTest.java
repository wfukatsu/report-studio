package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.report.server.testsupport.PdfProbe;
import java.io.IOException;
import org.junit.jupiter.api.Test;

/**
 * Parse-back tests for tenant* elements (issue #54). The tenant document is supplied via the
 * projection's {@code _tenant} override (production wiring goes through TenantInfoProvider,
 * registered in AppWiring).
 */
class PdfTenantParseBackTest {

    /** 1×1 transparent PNG. */
    private static final String LOGO_DATA_URI =
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ"
                    + "AAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

    private static final String TENANT =
            """
        {"companyName":"株式会社スカラー",
         "postalCode":"163-0207",
         "address1":"東京都新宿区西新宿2-6-1",
         "address2":"新宿住友ビル7F",
         "phone":"03-1234-5678",
         "representativeName":"深津 渉",
         "logoBase64":"%s",
         "custom":{"registrationNumber":"T1234567890123"}}"""
                    .formatted(LOGO_DATA_URI);

    private static String pageWith(String elements, String tenantJson) {
        return """
            {"templates":[{
              "id":"t1","name":"Tenant",
              "sections":[{
                "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                "elements":[%s]
              }]
            }]%s}"""
                .formatted(elements, tenantJson == null ? "" : ",\"_tenant\":" + tenantJson);
    }

    @Test
    void tenantTextFields_resolveFromTenantDocument() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.render(
                                pageWith(
                                        """
            {"id":"e1","type":"tenantCompanyName","name":"社名",
             "position":{"x":20,"y":20},"size":{"width":100,"height":10},"style":{"fontSize":12}},
            {"id":"e2","type":"tenantPhone","name":"電話",
             "position":{"x":20,"y":35},"size":{"width":80,"height":8},"style":{"fontSize":10}},
            {"id":"e3","type":"tenantRepresentative","name":"代表",
             "position":{"x":20,"y":48},"size":{"width":80,"height":8},"style":{"fontSize":10}},
            {"id":"e4","type":"tenantCustom","name":"登録番号","fieldKey":"registrationNumber",
             "position":{"x":20,"y":61},"size":{"width":80,"height":8},"style":{"fontSize":10}}""",
                                        TENANT)));
        assertTrue(probe.pageContains(0, "株式会社スカラー"), probe.pageText(0));
        assertTrue(probe.pageContains(0, "03-1234-5678"));
        assertTrue(probe.pageContains(0, "深津 渉"));
        assertTrue(probe.pageContains(0, "T1234567890123"));
    }

    @Test
    void tenantAddress_singleAndMultiline() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.render(
                                pageWith(
                                        """
            {"id":"e1","type":"tenantAddress","name":"住所1行",
             "position":{"x":20,"y":20},"size":{"width":150,"height":8},
             "displayMode":"single","style":{"fontSize":10}},
            {"id":"e2","type":"tenantAddress","name":"住所複数行",
             "position":{"x":20,"y":40},"size":{"width":150,"height":20},
             "displayMode":"multiLine","style":{"fontSize":10}}""",
                                        TENANT)));
        // single: one run with 〒 + addr1 + addr2 concatenated
        assertTrue(probe.pageContains(0, "〒163-0207 東京都新宿区西新宿2-6-1新宿住友ビル7F"), probe.pageText(0));

        // multiLine: three separate baselines, 1.2 line-height apart
        // (filter y > 35mm to skip the single-mode element's concatenated run)
        PdfProbe.TextRun postal =
                probe.findRuns("〒163-0207").stream()
                        .filter(r -> r.baselineYMm() > 35)
                        .findFirst()
                        .orElseThrow();
        PdfProbe.TextRun addr2 =
                probe.findRuns("新宿住友ビル7F").stream()
                        .filter(r -> r.baselineYMm() > 35)
                        .findFirst()
                        .orElseThrow();
        assertTrue(
                addr2.baselineYMm() > postal.baselineYMm() + 5,
                "multiline lines should stack: postal y=%.1f addr2 y=%.1f"
                        .formatted(postal.baselineYMm(), addr2.baselineYMm()));
    }

    @Test
    void tenantLogo_rendersImageFromDataUri() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.render(
                                pageWith(
                                        """
            {"id":"e1","type":"tenantLogo","name":"ロゴ","objectFit":"contain",
             "position":{"x":20,"y":20},"size":{"width":40,"height":20}}""",
                                        TENANT)));
        // Image XObject drawn via the "Do" operator
        assertTrue(probe.pageContent(0).contains(" Do"), probe.pageContent(0));
    }

    @Test
    void missingTenant_usesElementFallback() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.render(
                                pageWith(
                                        """
            {"id":"e1","type":"tenantCompanyName","name":"社名","fallback":"（未設定）",
             "position":{"x":20,"y":20},"size":{"width":100,"height":10},"style":{"fontSize":12}},
            {"id":"e2","type":"tenantLogo","name":"ロゴ",
             "position":{"x":20,"y":40},"size":{"width":40,"height":20}}""",
                                        "{}")));
        assertTrue(probe.pageContains(0, "（未設定）"), probe.pageText(0));
        // Logo without data draws nothing — no image, no fallback box
        assertFalse(probe.pageContent(0).contains(" Do"));
    }

    @Test
    void partialTenant_missingFieldFallsBackPerElement() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.render(
                                pageWith(
                                        """
            {"id":"e1","type":"tenantCompanyName","name":"社名",
             "position":{"x":20,"y":20},"size":{"width":100,"height":10},"style":{"fontSize":12}},
            {"id":"e2","type":"tenantPhone","name":"電話","fallback":"電話未登録",
             "position":{"x":20,"y":35},"size":{"width":80,"height":8},"style":{"fontSize":10}}""",
                                        "{\"companyName\":\"テスト商店\"}")));
        assertTrue(probe.pageContains(0, "テスト商店"));
        assertTrue(probe.pageContains(0, "電話未登録"), probe.pageText(0));
    }
}

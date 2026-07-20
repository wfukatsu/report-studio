package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.report.server.testsupport.PdfProbe;
import java.io.IOException;
import org.junit.jupiter.api.Test;

/**
 * Parse-back tests for output-variant masking and visibility (issue #59). Asserts the masked/hidden
 * values that actually land in the PDF, not just the VariantContext unit behavior (covered by
 * VariantContextTest).
 */
class PdfVariantMaskingParseBackTest {

    private static final String TEMPLATE =
            """
        {"templates":[{
          "id":"t1","name":"Masking",
          "sections":[{
            "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
            "elements":[
              {"id":"partial-el","kind":"text","name":"Account",
               "frame":{"x":20,"y":20,"width":100,"height":8,"rotation":0},
               "props":{"text":"1234567890","fontSize":12}},
              {"id":"replace-el","kind":"text","name":"Secret",
               "frame":{"x":20,"y":40,"width":100,"height":8,"rotation":0},
               "props":{"text":"社外秘テキスト","fontSize":12}},
              {"id":"masked-hidden-el","kind":"text","name":"MaskHidden",
               "frame":{"x":20,"y":60,"width":100,"height":8,"rotation":0},
               "props":{"text":"MASKHIDDENVALUE","fontSize":12}},
              {"id":"invisible-el","kind":"text","name":"Invisible",
               "frame":{"x":20,"y":80,"width":100,"height":8,"rotation":0},
               "props":{"text":"INVISIBLEVALUE","fontSize":12}}
            ]
          }],
          "variants":[{
            "variantId":"v-external","name":"社外向け",
            "visibilityOverrides":{"invisible-el":false},
            "maskingRules":[
              {"targetElementId":"partial-el","maskingType":"partial",
               "partialSpec":{"keepFirst":2,"keepLast":2}},
              {"targetElementId":"replace-el","maskingType":"fullReplace","replaceValue":"非公開"},
              {"targetElementId":"masked-hidden-el","maskingType":"hidden"}
            ]
          }]
        }]%s}""";

    @Test
    void withoutVariant_originalValuesRender() throws IOException {
        PdfProbe probe = PdfProbe.parse(PdfRenderer.render(TEMPLATE.formatted("")));
        assertTrue(probe.pageContains(0, "1234567890"));
        assertTrue(probe.pageContains(0, "社外秘テキスト"));
        assertTrue(probe.pageContains(0, "MASKHIDDENVALUE"));
        assertTrue(probe.pageContains(0, "INVISIBLEVALUE"));
    }

    @Test
    void partialMasking_keepsEdgesAndMasksMiddle() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.render(TEMPLATE.formatted(",\"_variantId\":\"v-external\"")));
        assertTrue(probe.pageContains(0, "12******90"), probe.pageText(0));
        assertFalse(probe.pageContains(0, "1234567890"));
    }

    @Test
    void fullReplaceMasking_replacesEntireValue() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.render(TEMPLATE.formatted(",\"_variantId\":\"v-external\"")));
        assertTrue(probe.pageContains(0, "非公開"), probe.pageText(0));
        assertFalse(probe.pageContains(0, "社外秘"));
    }

    @Test
    void hiddenMasking_andVisibilityOverride_removeTextEntirely() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.render(TEMPLATE.formatted(",\"_variantId\":\"v-external\"")));
        assertFalse(probe.pageContains(0, "MASKHIDDENVALUE"), probe.pageText(0));
        assertFalse(probe.pageContains(0, "INVISIBLEVALUE"), probe.pageText(0));
    }

    @Test
    void unknownVariantId_fallsBackToUnmasked() throws IOException {
        PdfProbe probe =
                PdfProbe.parse(
                        PdfRenderer.render(
                                TEMPLATE.formatted(",\"_variantId\":\"no-such-variant\"")));
        assertTrue(probe.pageContains(0, "1234567890"));
        assertTrue(probe.pageContains(0, "INVISIBLEVALUE"));
    }
}

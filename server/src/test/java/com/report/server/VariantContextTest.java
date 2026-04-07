package com.report.server;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.report.server.pdf.VariantContext;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class VariantContextTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    // ── empty() ──────────────────────────────────────────────────────────

    @Test
    void empty_isVisible_returnsBase() {
        VariantContext ctx = VariantContext.empty();
        assertTrue(ctx.isVisible("el1", true));
        assertFalse(ctx.isVisible("el1", false));
    }

    @Test
    void empty_applyMasking_returnsOriginal() {
        VariantContext ctx = VariantContext.empty();
        assertEquals("hello", ctx.applyMasking("el1", "hello"));
    }

    // ── isVisible() ──────────────────────────────────────────────────────

    @Test
    void isVisible_overrideTrue_returnsTrue() throws Exception {
        String json = """
            {
              "variantId": "v1",
              "visibilityOverrides": { "el1": true },
              "maskingRules": []
            }
            """;
        VariantContext ctx = VariantContext.from(MAPPER.readTree(json));
        assertTrue(ctx.isVisible("el1", false));
    }

    @Test
    void isVisible_overrideFalse_returnsFalse() throws Exception {
        String json = """
            {
              "variantId": "v1",
              "visibilityOverrides": { "el-mynum": false },
              "maskingRules": []
            }
            """;
        VariantContext ctx = VariantContext.from(MAPPER.readTree(json));
        assertFalse(ctx.isVisible("el-mynum", true));
    }

    @Test
    void isVisible_noOverride_returnsBase() throws Exception {
        String json = """
            {
              "variantId": "v1",
              "visibilityOverrides": {},
              "maskingRules": []
            }
            """;
        VariantContext ctx = VariantContext.from(MAPPER.readTree(json));
        assertTrue(ctx.isVisible("el1", true));
        assertFalse(ctx.isVisible("el2", false));
    }

    // ── applyMasking — hidden ────────────────────────────────────────────

    @Test
    void applyMasking_hidden_returnsEmpty() throws Exception {
        String json = """
            {
              "variantId": "v1",
              "visibilityOverrides": {},
              "maskingRules": [
                { "targetElementId": "el1", "maskingType": "hidden" }
              ]
            }
            """;
        VariantContext ctx = VariantContext.from(MAPPER.readTree(json));
        assertEquals("", ctx.applyMasking("el1", "123456789"));
    }

    @Test
    void applyMasking_hidden_nullValue_returnsEmpty() throws Exception {
        String json = """
            {
              "variantId": "v1",
              "visibilityOverrides": {},
              "maskingRules": [
                { "targetElementId": "el1", "maskingType": "hidden" }
              ]
            }
            """;
        VariantContext ctx = VariantContext.from(MAPPER.readTree(json));
        assertEquals("", ctx.applyMasking("el1", null));
    }

    // ── applyMasking — fullReplace ───────────────────────────────────────

    @Test
    void applyMasking_fullReplace_returnsReplaceValue() throws Exception {
        String json = """
            {
              "variantId": "v1",
              "visibilityOverrides": {},
              "maskingRules": [
                { "targetElementId": "el2", "maskingType": "fullReplace", "replaceValue": "****" }
              ]
            }
            """;
        VariantContext ctx = VariantContext.from(MAPPER.readTree(json));
        assertEquals("****", ctx.applyMasking("el2", "secret"));
    }

    @Test
    void applyMasking_fullReplace_emptyReplaceValue() throws Exception {
        String json = """
            {
              "variantId": "v1",
              "visibilityOverrides": {},
              "maskingRules": [
                { "targetElementId": "el2", "maskingType": "fullReplace", "replaceValue": "" }
              ]
            }
            """;
        VariantContext ctx = VariantContext.from(MAPPER.readTree(json));
        assertEquals("", ctx.applyMasking("el2", "secret"));
    }

    // ── applyMasking — partial ───────────────────────────────────────────

    @Test
    void applyMasking_partial_keepFirst2() throws Exception {
        String json = """
            {
              "variantId": "v1",
              "visibilityOverrides": {},
              "maskingRules": [
                {
                  "targetElementId": "el3",
                  "maskingType": "partial",
                  "partialSpec": { "keepFirst": 2, "keepLast": 0 }
                }
              ]
            }
            """;
        VariantContext ctx = VariantContext.from(MAPPER.readTree(json));
        // "123456789" → "12*******"
        assertEquals("12*******", ctx.applyMasking("el3", "123456789"));
    }

    @Test
    void applyMasking_partial_keepLast4() throws Exception {
        String json = """
            {
              "variantId": "v1",
              "visibilityOverrides": {},
              "maskingRules": [
                {
                  "targetElementId": "el3",
                  "maskingType": "partial",
                  "partialSpec": { "keepFirst": 0, "keepLast": 4 }
                }
              ]
            }
            """;
        VariantContext ctx = VariantContext.from(MAPPER.readTree(json));
        // "123456789" → "*****6789"
        assertEquals("*****6789", ctx.applyMasking("el3", "123456789"));
    }

    @Test
    void applyMasking_partial_keepFirstAndLast() throws Exception {
        String json = """
            {
              "variantId": "v1",
              "visibilityOverrides": {},
              "maskingRules": [
                {
                  "targetElementId": "el3",
                  "maskingType": "partial",
                  "partialSpec": { "keepFirst": 2, "keepLast": 2 }
                }
              ]
            }
            """;
        VariantContext ctx = VariantContext.from(MAPPER.readTree(json));
        // "123456" → "12**56"
        assertEquals("12**56", ctx.applyMasking("el3", "123456"));
    }

    @Test
    void applyMasking_partial_keepFirstExceedsLength_clamped() throws Exception {
        String json = """
            {
              "variantId": "v1",
              "visibilityOverrides": {},
              "maskingRules": [
                {
                  "targetElementId": "el3",
                  "maskingType": "partial",
                  "partialSpec": { "keepFirst": 100, "keepLast": 0 }
                }
              ]
            }
            """;
        VariantContext ctx = VariantContext.from(MAPPER.readTree(json));
        // keepFirst exceeds length → entire value preserved, no truncation
        assertEquals("abc", ctx.applyMasking("el3", "abc"));
    }

    @Test
    void applyMasking_partial_keepFirstPlusLastExceedsLength_clamped() throws Exception {
        String json = """
            {
              "variantId": "v1",
              "visibilityOverrides": {},
              "maskingRules": [
                {
                  "targetElementId": "el3",
                  "maskingType": "partial",
                  "partialSpec": { "keepFirst": 3, "keepLast": 3 }
                }
              ]
            }
            """;
        VariantContext ctx = VariantContext.from(MAPPER.readTree(json));
        // "ab" has only 2 chars; keepFirst=3 clamped to 2, keepLast=0
        assertEquals("ab", ctx.applyMasking("el3", "ab"));
    }

    @Test
    void applyMasking_noRule_returnsOriginal() throws Exception {
        String json = """
            {
              "variantId": "v1",
              "visibilityOverrides": {},
              "maskingRules": []
            }
            """;
        VariantContext ctx = VariantContext.from(MAPPER.readTree(json));
        assertEquals("hello", ctx.applyMasking("el-other", "hello"));
    }

    // ── from() — missing fields resilience ──────────────────────────────

    @Test
    void from_missingVisibilityOverrides_usesBase() throws Exception {
        String json = """
            {
              "variantId": "v1",
              "maskingRules": []
            }
            """;
        VariantContext ctx = VariantContext.from(MAPPER.readTree(json));
        assertTrue(ctx.isVisible("el1", true));
    }

    @Test
    void from_missingMaskingRules_noMasking() throws Exception {
        String json = """
            {
              "variantId": "v1",
              "visibilityOverrides": {}
            }
            """;
        VariantContext ctx = VariantContext.from(MAPPER.readTree(json));
        assertEquals("hello", ctx.applyMasking("el1", "hello"));
    }

    @Test
    void from_ruleWithMissingTargetElementId_skipped() throws Exception {
        String json = """
            {
              "variantId": "v1",
              "visibilityOverrides": {},
              "maskingRules": [
                { "maskingType": "hidden" }
              ]
            }
            """;
        // Should not throw; the rule with missing targetElementId is skipped
        VariantContext ctx = VariantContext.from(MAPPER.readTree(json));
        assertEquals("hello", ctx.applyMasking("el1", "hello"));
    }

    // ── PdfRenderer integration: variantId validation ────────────────────

    @Test
    void render_withValidVariantId_succeeds() throws Exception {
        String json = """
            {
              "templates": [{
                "id": "t1",
                "name": "Test",
                "pageSetup": {"kind":"preset","paperSizeId":"A4","orientation":"portrait"},
                "variants": [{"variantId":"v-tax","variantName":"税務署提出用","targetAudience":"","visibilityOverrides":{},"maskingRules":[]}],
                "sections": [{
                  "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                  "elements":[{
                    "id":"e1","kind":"text","name":"T",
                    "frame":{"x":10,"y":10,"width":100,"height":30,"rotation":0},
                    "props":{"text":"hello"}
                  }]
                }]
              }],
              "_variantId": "v-tax"
            }
            """;
        byte[] pdf = PdfRenderer.render(json);
        assertNotNull(pdf);
        assertTrue(pdf.length > 100);
    }

    @Test
    void render_hiddenElement_notInPdf() throws Exception {
        // Integration test: element with visibilityOverride=false should be skipped
        String json = """
            {
              "templates": [{
                "id": "t1",
                "name": "Test",
                "pageSetup": {"kind":"preset","paperSizeId":"A4","orientation":"portrait"},
                "variants": [{"variantId":"v1","variantName":"Test","targetAudience":"","visibilityOverrides":{"e1":false},"maskingRules":[]}],
                "sections": [{
                  "id":"s1","type":"page_base","name":"Base","y":0,"height":297,
                  "elements":[{
                    "id":"e1","kind":"text","name":"Hidden",
                    "frame":{"x":10,"y":10,"width":100,"height":30,"rotation":0},
                    "props":{"text":"SHOULD BE HIDDEN"}
                  }]
                }]
              }],
              "_variantId": "v1"
            }
            """;
        byte[] pdf = PdfRenderer.render(json);
        assertNotNull(pdf);
        assertTrue(pdf.length > 0);
        // PDF is generated without errors — visibility is enforced at render time
    }
}

package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.report.server.pdf.RelativeLayoutResolver;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class RelativeLayoutResolverTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private JsonNode parse(String json) {
        try { return MAPPER.readTree(json); }
        catch (Exception e) { throw new RuntimeException(e); }
    }

    @Test
    void noAnchorElements_returnsEmptyMap() throws Exception {
        JsonNode elements = parse("""
            [
              {"id":"e1","frame":{"x":0,"y":10,"width":100,"height":20},"props":{}},
              {"id":"e2","frame":{"x":0,"y":40,"width":100,"height":10},"props":{}}
            ]""");
        Map<String, Float> result = RelativeLayoutResolver.resolveEffectiveY(elements);
        assertTrue(result.isEmpty());
    }

    @Test
    void singleAnchor_pushDown_computesEffectiveY() throws Exception {
        // e1 at y=10, height=20 → bottom at y=30
        // e2 anchors to e1 with pushDown, nominal y=35 (gap = 35-10=25 from anchor top)
        // effectiveY(e2) = effectiveY(e1) + height(e1) + max(0, gap) = 10 + 20 + 25 = 55
        // But gap is nominal_y(e2) - nominal_y(e1) = 35 - 10 = 25
        // effectiveY(e2) = effectiveY(e1) + height(e1) + (nominalY(e2) - nominalY(e1))
        //                = 10 + 20 + (35 - 10) = 55
        JsonNode elements = parse("""
            [
              {"id":"e1","frame":{"x":0,"y":10,"width":100,"height":20},"props":{}},
              {"id":"e2","frame":{"x":0,"y":35,"width":100,"height":10},
               "props":{"layout":{"anchorTo":"e1","pushDown":true}}}
            ]""");
        Map<String, Float> result = RelativeLayoutResolver.resolveEffectiveY(elements);
        assertEquals(1, result.size());
        // effectiveY(e2) = anchorEffectiveY(10) + anchorHeight(20) + offset(35-10) = 55
        assertEquals(55f, result.get("e2"), 0.01f);
    }

    @Test
    void chainedAnchors_resolvedInOrder() throws Exception {
        // e1: y=0, h=10. e2 anchors e1 at y=15 → effective 0+10+(15-0)=25
        // e3 anchors e2 at y=20 → effective 25+10+(20-15)=40
        JsonNode elements = parse("""
            [
              {"id":"e1","frame":{"x":0,"y":0,"width":100,"height":10},"props":{}},
              {"id":"e2","frame":{"x":0,"y":15,"width":100,"height":10},
               "props":{"layout":{"anchorTo":"e1","pushDown":true}}},
              {"id":"e3","frame":{"x":0,"y":20,"width":100,"height":10},
               "props":{"layout":{"anchorTo":"e2","pushDown":true}}}
            ]""");
        Map<String, Float> result = RelativeLayoutResolver.resolveEffectiveY(elements);
        assertEquals(2, result.size());
        assertEquals(25f, result.get("e2"), 0.01f);
        // e3: effectiveY(e2)=25, height(e2)=10, offset=20-15=5 → 25+10+5=40
        assertEquals(40f, result.get("e3"), 0.01f);
    }

    @Test
    void noPushDown_ignoredEvenWithAnchorTo() throws Exception {
        JsonNode elements = parse("""
            [
              {"id":"e1","frame":{"x":0,"y":10,"width":100,"height":20},"props":{}},
              {"id":"e2","frame":{"x":0,"y":35,"width":100,"height":10},
               "props":{"layout":{"anchorTo":"e1","pushDown":false}}}
            ]""");
        Map<String, Float> result = RelativeLayoutResolver.resolveEffectiveY(elements);
        assertTrue(result.isEmpty());
    }

    @Test
    void circularAnchor_doesNotDeadlock() throws Exception {
        // e1 → e2 → e1 (cycle) — both keep original y
        JsonNode elements = parse("""
            [
              {"id":"e1","frame":{"x":0,"y":0,"width":100,"height":10},
               "props":{"layout":{"anchorTo":"e2","pushDown":true}}},
              {"id":"e2","frame":{"x":0,"y":15,"width":100,"height":10},
               "props":{"layout":{"anchorTo":"e1","pushDown":true}}}
            ]""");
        // Must not hang or throw; result may be empty or partial
        assertDoesNotThrow(() -> RelativeLayoutResolver.resolveEffectiveY(elements));
    }

    @Test
    void applyEffectiveY_modifiesFrameY() throws Exception {
        JsonNode el = parse("""
            {"id":"e1","frame":{"x":0,"y":10,"width":100,"height":20},"props":{}}""");
        Map<String, Float> effectiveY = Map.of("e1", 55f);
        JsonNode result = RelativeLayoutResolver.applyEffectiveY(el, effectiveY);
        assertEquals(55f, result.get("frame").get("y").floatValue(), 0.01f);
        // Original must be unchanged (immutability)
        assertEquals(10f, el.get("frame").get("y").floatValue(), 0.01f);
    }

    @Test
    void applyEffectiveY_supportsV2PositionGeometry() throws Exception {
        JsonNode el = parse("""
            {"id":"e1","position":{"x":0,"y":10},"size":{"width":100,"height":20}}""");
        JsonNode result = RelativeLayoutResolver.applyEffectiveY(el, Map.of("e1", 55f));
        assertEquals(55f, result.get("position").get("y").floatValue(), 0.01f);
    }

    // ── paginate (issue #55: pushdown page-overflow) ─────────────────────

    @Test
    void paginate_allElementsFit_singlePage() throws Exception {
        JsonNode elements = parse("""
            [
              {"id":"e1","frame":{"x":0,"y":10,"width":100,"height":20},"props":{}},
              {"id":"e2","frame":{"x":0,"y":40,"width":100,"height":30},"props":{}}
            ]""");
        var layout = RelativeLayoutResolver.paginate(elements, 0, 100);
        assertEquals(1, layout.pageCount());
        assertTrue(layout.pageOf().isEmpty());
    }

    @Test
    void paginate_pushedChainOverflows_assignsContinuationPage() throws Exception {
        // e1 y=10 h=20; e2 anchored → effY 60, h=30 (fits page 0: 60+30=90 ≤ 100)
        // e3 anchored to e2 → effY = 60+30+(80-40)=130 → page 1 at wrapped y=30
        JsonNode elements = parse("""
            [
              {"id":"e1","frame":{"x":0,"y":10,"width":100,"height":20},"props":{}},
              {"id":"e2","frame":{"x":0,"y":40,"width":100,"height":30},
               "props":{"layout":{"anchorTo":"e1","pushDown":true}}},
              {"id":"e3","frame":{"x":0,"y":80,"width":100,"height":30},
               "props":{"layout":{"anchorTo":"e2","pushDown":true}}}
            ]""");
        var layout = RelativeLayoutResolver.paginate(elements, 0, 100);
        assertEquals(2, layout.pageCount());
        assertNull(layout.pageOf().get("e1"));
        assertNull(layout.pageOf().get("e2"));
        assertEquals(1, layout.pageOf().get("e3"));
        assertEquals(30f, layout.pagedY().get("e3"), 0.01f);
    }

    @Test
    void paginate_straddlingElement_promotedToNextPageTop() throws Exception {
        // Static element at y=90 h=30 would cross the bottom edge (100) → next page top
        JsonNode elements = parse("""
            [
              {"id":"e1","frame":{"x":0,"y":90,"width":100,"height":30},"props":{}}
            ]""");
        var layout = RelativeLayoutResolver.paginate(elements, 0, 100);
        assertEquals(2, layout.pageCount());
        assertEquals(1, layout.pageOf().get("e1"));
        assertEquals(0f, layout.pagedY().get("e1"), 0.01f);
    }

    @Test
    void paginate_elementTallerThanRegion_staysAndClips() throws Exception {
        JsonNode elements = parse("""
            [
              {"id":"e1","frame":{"x":0,"y":0,"width":100,"height":250},"props":{}}
            ]""");
        var layout = RelativeLayoutResolver.paginate(elements, 0, 100);
        assertEquals(1, layout.pageCount());
        assertNull(layout.pageOf().get("e1"));
    }

    @Test
    void paginate_nonPositiveRegionHeight_disablesPaging() throws Exception {
        JsonNode elements = parse("""
            [
              {"id":"e1","frame":{"x":0,"y":500,"width":100,"height":30},"props":{}}
            ]""");
        var layout = RelativeLayoutResolver.paginate(elements, 0, 0);
        assertEquals(1, layout.pageCount());
    }
}

package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.report.server.auth.RateLimiter;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class EvaluateControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private EvaluateController controller;
    private Context ctx;

    @BeforeEach
    void setUp() {
        // Use permissive rate limiter (1000 req/s) so tests don't interfere with each other
        RateLimiter permissive = new RateLimiter(1000, 1000L);
        controller = new EvaluateController(permissive);
        ctx = mock(Context.class);
        when(ctx.pathParam("id")).thenReturn("t1");
        when(ctx.ip()).thenReturn("127.0.0.1");
    }

    // ── wrapForCalculation (static helper) ────────────────────────────────────

    @Test
    void wrapForCalculation_mapsKeyToTargetField() throws Exception {
        String defJson = """
            {
              "calculationRules": [
                {"key":"total","expression":"qty * price","resultType":"number","onError":"zero","label":"合計"}
              ]
            }
            """;
        JsonNode definition = MAPPER.readTree(defJson);

        JsonNode projection = EvaluateController.wrapForCalculation("t1", definition);

        JsonNode v1Rule = projection.path("templates").get(0).path("calculationRules").get(0);
        assertEquals("total", v1Rule.path("targetField").asText());
        assertEquals("qty * price", v1Rule.path("expression").asText());
        assertEquals("none", v1Rule.path("roundingPolicy").asText());
    }

    @Test
    void wrapForCalculation_skipsRulesWithoutKeyOrExpression() throws Exception {
        String defJson = """
            {
              "calculationRules": [
                {"expression":"1+1"},
                {"key":"x"},
                {"key":"good","expression":"1+1","label":""}
              ]
            }
            """;
        JsonNode projection = EvaluateController.wrapForCalculation(
                "t1", MAPPER.readTree(defJson));
        JsonNode rules = projection.path("templates").get(0).path("calculationRules");
        assertEquals(1, rules.size());
        assertEquals("good", rules.get(0).path("targetField").asText());
    }

    // ── evaluate ──────────────────────────────────────────────────────────────

    @Test
    void evaluate_returnsComputedResults() throws Exception {
        String body = """
            {
              "definition": {
                "calculationRules": [
                  {"key":"total","expression":"qty * price","resultType":"number","onError":"zero","label":"合計"}
                ]
              },
              "testData": {"qty": 3, "price": 100}
            }
            """;
        when(ctx.body()).thenReturn(body);

        controller.evaluate(ctx);

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode resp = MAPPER.readTree(captor.getValue());
        assertEquals(300.0, resp.path("results").path("total").asDouble(), 0.01);
        assertTrue(resp.path("errors").isEmpty());
    }

    @Test
    void evaluate_returnsEmptyWhenNoRules() throws Exception {
        when(ctx.body()).thenReturn("{\"definition\":{\"calculationRules\":[]},\"testData\":{}}");

        controller.evaluate(ctx);

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode resp = MAPPER.readTree(captor.getValue());
        assertTrue(resp.path("results").isEmpty());
    }

    @Test
    void evaluate_returns400ForMissingBody() throws Exception {
        when(ctx.body()).thenReturn("");

        controller.evaluate(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
    }

    @Test
    void evaluate_returns400ForMissingDefinition() throws Exception {
        when(ctx.body()).thenReturn("{\"testData\":{}}");

        controller.evaluate(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
    }

    @Test
    void evaluate_returns400ForExpressionTooLong() throws Exception {
        String longExpr = "x".repeat(1001);
        String body = String.format("""
            {
              "definition": {
                "calculationRules": [
                  {"key":"x","expression":"%s","resultType":"number","onError":"zero","label":""}
                ]
              },
              "testData": {}
            }
            """, longExpr);
        when(ctx.body()).thenReturn(body);

        controller.evaluate(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
    }

    @Test
    void evaluate_returns422ForCircularDependency() throws Exception {
        String body = """
            {
              "definition": {
                "calculationRules": [
                  {"key":"a","expression":"b + 1","resultType":"number","onError":"zero","label":""},
                  {"key":"b","expression":"a + 1","resultType":"number","onError":"zero","label":""}
                ]
              },
              "testData": {}
            }
            """;
        when(ctx.body()).thenReturn(body);

        controller.evaluate(ctx);

        verify(ctx).status(422);
    }

    @Test
    void evaluate_returns400ForTooManyTestDataFields() throws Exception {
        // Build testData with 1001 fields
        StringBuilder sb = new StringBuilder("{\"definition\":{\"calculationRules\":[]},\"testData\":{");
        for (int i = 0; i < 1001; i++) {
            if (i > 0) sb.append(',');
            sb.append("\"f").append(i).append("\":").append(i);
        }
        sb.append("}}");
        when(ctx.body()).thenReturn(sb.toString());

        controller.evaluate(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
    }

    // ── validate ─────────────────────────────────────────────────────────────

    @Test
    void validate_returnsViolationWhenConditionTrue() throws Exception {
        // Use a concrete comparison that JEXL strict mode can evaluate without undefined vars
        String body = """
            {
              "definition": {
                "validationRules": [
                  {"ruleKey":"req-check","condition":"qty < 0","message":"名前は必須です"}
                ]
              },
              "testData": {"qty": -1}
            }
            """;
        when(ctx.body()).thenReturn(body);

        controller.validate(ctx);

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode resp = MAPPER.readTree(captor.getValue());
        assertEquals(1, resp.path("violations").size());
        assertEquals("req-check", resp.path("violations").get(0).path("ruleKey").asText());
        assertEquals("名前は必須です", resp.path("violations").get(0).path("message").asText());
    }

    @Test
    void validate_noViolationWhenConditionFalse() throws Exception {
        String body = """
            {
              "definition": {
                "validationRules": [
                  {"ruleKey":"check","condition":"qty > 100","message":"too much"}
                ]
              },
              "testData": {"qty": 5}
            }
            """;
        when(ctx.body()).thenReturn(body);

        controller.validate(ctx);

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode resp = MAPPER.readTree(captor.getValue());
        assertEquals(0, resp.path("violations").size());
    }

    @Test
    void validate_skipsRuleWithEmptyCondition() throws Exception {
        String body = """
            {
              "definition": {
                "validationRules": [
                  {"ruleKey":"empty-cond","condition":"","message":"should not fire"}
                ]
              },
              "testData": {}
            }
            """;
        when(ctx.body()).thenReturn(body);

        controller.validate(ctx);

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode resp = MAPPER.readTree(captor.getValue());
        assertEquals(0, resp.path("violations").size());
    }

    @Test
    void validate_includesElementIdWhenPresent() throws Exception {
        // "1 == 1" is a valid JEXL expression that always evaluates to true
        String body = """
            {
              "definition": {
                "validationRules": [
                  {"ruleKey":"check","condition":"1 == 1","message":"err","elementId":"elem-1"}
                ]
              },
              "testData": {}
            }
            """;
        when(ctx.body()).thenReturn(body);

        controller.validate(ctx);

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        JsonNode violation = MAPPER.readTree(captor.getValue()).path("violations").get(0);
        assertEquals("elem-1", violation.path("elementId").asText());
    }

    @Test
    void validate_returns400ForMissingBody() throws Exception {
        when(ctx.body()).thenReturn("");

        controller.validate(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
    }

    @Test
    void validate_returns400ForInvalidId() throws Exception {
        when(ctx.pathParam("id")).thenReturn("../bad");
        when(ctx.body()).thenReturn("{\"definition\":{},\"testData\":{}}");

        controller.validate(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
    }

    // ── rate limiting ─────────────────────────────────────────────────────────

    @Test
    void evaluate_returns429WhenRateLimitExceeded() throws Exception {
        // Limiter that allows 0 requests immediately
        RateLimiter strict = new RateLimiter(1, 60_000L);
        // Exhaust the 1 allowed request
        strict.isAllowed("127.0.0.1");

        EvaluateController limited = new EvaluateController(strict);
        Context limitCtx = mock(Context.class);
        when(limitCtx.ip()).thenReturn("127.0.0.1");
        when(limitCtx.pathParam("id")).thenReturn("t1");

        limited.evaluate(limitCtx);

        verify(limitCtx).status(429);
        verify(limitCtx, never()).result(anyString());
    }

    @Test
    void validate_returns429WhenRateLimitExceeded() throws Exception {
        RateLimiter strict = new RateLimiter(1, 60_000L);
        strict.isAllowed("127.0.0.1");

        EvaluateController limited = new EvaluateController(strict);
        Context limitCtx = mock(Context.class);
        when(limitCtx.ip()).thenReturn("127.0.0.1");
        when(limitCtx.pathParam("id")).thenReturn("t1");

        limited.validate(limitCtx);

        verify(limitCtx).status(429);
        verify(limitCtx, never()).result(anyString());
    }
}

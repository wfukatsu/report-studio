package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class RequestValidatorTest {

    private Context ctx;

    @BeforeEach
    void setUp() {
        ctx = mock(Context.class);
    }

    @Nested
    class ValidateResponseBody {

        @Test
        void returnsNullForNullBody() {
            JsonNode result = RequestValidator.validateResponseBody(ctx, null);

            assertNull(result);
            verify(ctx).status(HttpStatus.BAD_REQUEST);
        }

        @Test
        void returnsNullForBlankBody() {
            JsonNode result = RequestValidator.validateResponseBody(ctx, "   ");

            assertNull(result);
            verify(ctx).status(HttpStatus.BAD_REQUEST);
        }

        @Test
        void returnsNullForInvalidJson() {
            JsonNode result = RequestValidator.validateResponseBody(ctx, "not json");

            assertNull(result);
            verify(ctx).status(HttpStatus.BAD_REQUEST);
        }

        @Test
        void returnsNullWhenBodyExceeds100KB() {
            // Build a JSON body just over 100,000 bytes
            String largeValue = "x".repeat(100_001);
            String body = "{\"key\":\"" + largeValue + "\"}";

            JsonNode result = RequestValidator.validateResponseBody(ctx, body);

            assertNull(result);
            verify(ctx).status(HttpStatus.BAD_REQUEST);
        }

        @Test
        void acceptsBodyJustUnder100KB() {
            // Build a valid JSON body under the limit
            String value = "x".repeat(99_980);
            String body = "{\"k\":\"" + value + "\"}";
            assertTrue(body.length() <= 100_000, "test fixture should be under limit");

            JsonNode result = RequestValidator.validateResponseBody(ctx, body);

            assertNotNull(result);
        }

        @Test
        void returnsNullWhenFieldCountExceeds1000() {
            StringBuilder sb = new StringBuilder("{");
            for (int i = 0; i <= 1000; i++) {
                if (i > 0) sb.append(",");
                sb.append("\"f").append(i).append("\":1");
            }
            sb.append("}");

            JsonNode result = RequestValidator.validateResponseBody(ctx, sb.toString());

            assertNull(result);
            verify(ctx).status(HttpStatus.BAD_REQUEST);
        }

        @Test
        void acceptsExactly1000Fields() {
            StringBuilder sb = new StringBuilder("{");
            for (int i = 0; i < 1000; i++) {
                if (i > 0) sb.append(",");
                sb.append("\"f").append(i).append("\":1");
            }
            sb.append("}");

            JsonNode result = RequestValidator.validateResponseBody(ctx, sb.toString());

            assertNotNull(result);
        }

        @Test
        void returnsNullWhenDetailArrayExceeds100Rows() {
            StringBuilder sb = new StringBuilder("{\"items\":[");
            for (int i = 0; i <= 100; i++) {
                if (i > 0) sb.append(",");
                sb.append("{\"v\":").append(i).append("}");
            }
            sb.append("]}");

            JsonNode result = RequestValidator.validateResponseBody(ctx, sb.toString());

            assertNull(result);
            verify(ctx).status(HttpStatus.BAD_REQUEST);
        }

        @Test
        void acceptsArrayWithExactly100Rows() {
            StringBuilder sb = new StringBuilder("{\"items\":[");
            for (int i = 0; i < 100; i++) {
                if (i > 0) sb.append(",");
                sb.append("{\"v\":").append(i).append("}");
            }
            sb.append("]}");

            JsonNode result = RequestValidator.validateResponseBody(ctx, sb.toString());

            assertNotNull(result);
        }

        @Test
        void acceptsSimpleValidJson() {
            String body = "{\"name\":\"Alice\",\"age\":30}";

            JsonNode result = RequestValidator.validateResponseBody(ctx, body);

            assertNotNull(result);
            assertEquals("Alice", result.get("name").asText());
            assertEquals(30, result.get("age").asInt());
        }

        @Test
        void acceptsEmptyObject() {
            JsonNode result = RequestValidator.validateResponseBody(ctx, "{}");

            assertNotNull(result);
            assertEquals(0, result.size());
        }

        @Test
        void acceptsMixedScalarAndArrayFields() {
            String body = "{\"name\":\"test\",\"items\":[{\"a\":1},{\"a\":2}],\"count\":5}";

            JsonNode result = RequestValidator.validateResponseBody(ctx, body);

            assertNotNull(result);
            assertEquals("test", result.get("name").asText());
            assertEquals(2, result.get("items").size());
        }

        @Test
        void scalarFieldsDoNotTriggerDetailRowLimit() {
            String body = "{\"name\":\"test\",\"value\":123,\"flag\":true}";

            JsonNode result = RequestValidator.validateResponseBody(ctx, body);

            assertNotNull(result);
        }
    }
}

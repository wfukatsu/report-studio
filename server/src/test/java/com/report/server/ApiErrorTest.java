package com.report.server;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** Unit tests for the unified API error response builder (#267). */
class ApiErrorTest {

    private Context ctx;

    @BeforeEach
    void setUp() {
        ctx = mock(Context.class);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> capturedBody() {
        ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
        verify(ctx).json(captor.capture());
        return (Map<String, Object>) captor.getValue();
    }

    // ── respond overloads ─────────────────────────────────────────────────────

    @Test
    void respond_intStatus_setsStatusAndUnifiedBody() {
        String corr = ApiError.respond(ctx, 404, "NOT_FOUND", "Template not found");

        verify(ctx).status(404);
        Map<String, Object> body = capturedBody();
        assertEquals("Template not found", body.get("error"));
        assertEquals("NOT_FOUND", body.get("code"));
        assertEquals(corr, body.get("correlationId"));
        assertEquals(8, corr.length());
    }

    @Test
    void respond_httpStatus_passesEnumThrough() {
        ApiError.respond(ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Invalid JSON");

        // Preserves the pre-#267 call type: enum overload, not the int one
        verify(ctx).status(HttpStatus.BAD_REQUEST);
        Map<String, Object> body = capturedBody();
        assertEquals("Invalid JSON", body.get("error"));
        assertEquals("VALIDATION_ERROR", body.get("code"));
        assertNotNull(body.get("correlationId"));
    }

    @Test
    void respond_withExtraFields_appendsAfterReservedKeys() {
        ApiError.respond(
                ctx,
                HttpStatus.CONFLICT,
                "VERSION_CONFLICT",
                "他のユーザーが更新しました",
                Map.of("currentVersion", 7));

        Map<String, Object> body = capturedBody();
        assertEquals("他のユーザーが更新しました", body.get("error"));
        assertEquals("VERSION_CONFLICT", body.get("code"));
        assertEquals(7, body.get("currentVersion"));
        assertNotNull(body.get("correlationId"));
    }

    @Test
    void respond_withCallerCorrelationId_echoesIt() {
        String corr = ApiError.respond(ctx, 429, "RATE_LIMITED", "Rate limit exceeded", "abc12345");

        assertEquals("abc12345", corr);
        assertEquals("abc12345", capturedBody().get("correlationId"));
    }

    @Test
    void respond_fullVariant_correlationIdPlusExtras() {
        ApiError.respond(
                ctx, 422, "VALIDATION_ERROR", "Too many rows", "corr0001", Map.of("total", 999));

        verify(ctx).status(422);
        Map<String, Object> body = capturedBody();
        assertEquals("corr0001", body.get("correlationId"));
        assertEquals(999, body.get("total"));
    }

    // ── body ──────────────────────────────────────────────────────────────────

    @Test
    void body_extraFieldsCannotOverwriteReservedKeys() {
        Map<String, Object> body =
                ApiError.body(
                        "NOT_FOUND",
                        "msg",
                        "corr",
                        Map.of("error", "spoofed", "code", "SPOOF", "correlationId", "x", "ok", 1));

        assertEquals("msg", body.get("error"));
        assertEquals("NOT_FOUND", body.get("code"));
        assertEquals("corr", body.get("correlationId"));
        assertEquals(1, body.get("ok"));
    }

    @Test
    void body_keyOrderStartsWithErrorForBackwardCompatibility() {
        var it = ApiError.body("C", "m", "id", Map.of()).keySet().iterator();
        assertEquals("error", it.next());
        assertEquals("code", it.next());
        assertEquals("correlationId", it.next());
    }

    // ── codeFor ───────────────────────────────────────────────────────────────

    @Test
    void codeFor_mapsKnownStatuses() {
        assertEquals("VALIDATION_ERROR", ApiError.codeFor(400));
        assertEquals("UNAUTHORIZED", ApiError.codeFor(401));
        assertEquals("FORBIDDEN", ApiError.codeFor(403));
        assertEquals("NOT_FOUND", ApiError.codeFor(404));
        assertEquals("METHOD_NOT_ALLOWED", ApiError.codeFor(405));
        assertEquals("CONFLICT", ApiError.codeFor(409));
        assertEquals("GONE", ApiError.codeFor(410));
        assertEquals("PAYLOAD_TOO_LARGE", ApiError.codeFor(413));
        assertEquals("UNSUPPORTED_MEDIA_TYPE", ApiError.codeFor(415));
        assertEquals("VALIDATION_ERROR", ApiError.codeFor(422));
        assertEquals("RATE_LIMITED", ApiError.codeFor(429));
        assertEquals("UPSTREAM_ERROR", ApiError.codeFor(502));
        assertEquals("SERVICE_UNAVAILABLE", ApiError.codeFor(503));
        assertEquals("TIMEOUT", ApiError.codeFor(504));
    }

    @Test
    void codeFor_fallsBackByStatusClass() {
        assertEquals("BAD_REQUEST", ApiError.codeFor(418));
        assertEquals("INTERNAL_ERROR", ApiError.codeFor(500));
        assertEquals("INTERNAL_ERROR", ApiError.codeFor(507));
    }
}

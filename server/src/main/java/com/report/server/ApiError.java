package com.report.server;

import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Unified API error response builder (#267).
 *
 * <p>Every error response body has the same shape:
 *
 * <pre>{"error": &lt;human-readable message&gt;,
 *  "code": &lt;MACHINE_READABLE_CODE&gt;,
 *  "correlationId": &lt;short id&gt;}</pre>
 *
 * <ul>
 *   <li>{@code error} — human-readable message (kept as the first key for backward compatibility;
 *       all existing clients read this key).
 *   <li>{@code code} — machine-readable UPPER_SNAKE code (e.g. {@code NOT_FOUND}, {@code
 *       VALIDATION_ERROR}, {@code DUPLICATE_CODE}). Defaults per HTTP status via {@link #codeFor}.
 *   <li>{@code correlationId} — short id (see {@link CorrelationId}) echoed in the body so a
 *       developer can cross-reference server logs. Callers that already generated one for logging
 *       should pass it through; otherwise a fresh one is generated per response.
 * </ul>
 *
 * <p>All {@code respond} overloads set the HTTP status and write the JSON body, and return the
 * correlation id so the caller can include it in its own log lines.
 */
public final class ApiError {

    private ApiError() {}

    /** Sets {@code status} and writes the unified error body. Returns the correlation id. */
    public static String respond(Context ctx, int status, String code, String message) {
        return respond(ctx, status, code, message, CorrelationId.generate(), Map.of());
    }

    /** Sets {@code status} and writes the unified error body. Returns the correlation id. */
    public static String respond(Context ctx, HttpStatus status, String code, String message) {
        return respond(ctx, status, code, message, Map.of());
    }

    /** Variant with extra top-level fields (e.g. {@code currentVersion}, {@code total}). */
    public static String respond(
            Context ctx, int status, String code, String message, Map<String, ?> extra) {
        return respond(ctx, status, code, message, CorrelationId.generate(), extra);
    }

    /** Variant with extra top-level fields (e.g. {@code currentVersion}, {@code total}). */
    public static String respond(
            Context ctx, HttpStatus status, String code, String message, Map<String, ?> extra) {
        ctx.status(status);
        return write(ctx, code, message, CorrelationId.generate(), extra);
    }

    /** Variant with a caller-supplied correlation id (already used in the caller's logs). */
    public static String respond(
            Context ctx, int status, String code, String message, String correlationId) {
        return respond(ctx, status, code, message, correlationId, Map.of());
    }

    /** Variant with a caller-supplied correlation id (already used in the caller's logs). */
    public static String respond(
            Context ctx, HttpStatus status, String code, String message, String correlationId) {
        ctx.status(status);
        return write(ctx, code, message, correlationId, Map.of());
    }

    /** Full variant: caller-supplied correlation id plus extra top-level fields. */
    public static String respond(
            Context ctx,
            int status,
            String code,
            String message,
            String correlationId,
            Map<String, ?> extra) {
        ctx.status(status);
        return write(ctx, code, message, correlationId, extra);
    }

    private static String write(
            Context ctx, String code, String message, String correlationId, Map<String, ?> extra) {
        ctx.json(body(code, message, correlationId, extra));
        return correlationId;
    }

    /**
     * Builds the unified error body. Extra fields never overwrite the three reserved keys.
     * Package-private for direct use where a {@link Context} is not available.
     */
    static Map<String, Object> body(
            String code, String message, String correlationId, Map<String, ?> extra) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", message);
        body.put("code", code);
        body.put("correlationId", correlationId);
        extra.forEach(body::putIfAbsent);
        return body;
    }

    /**
     * Default machine-readable code for an HTTP status. Used by the global exception handler and
     * anywhere no more specific code applies.
     */
    static String codeFor(int status) {
        return switch (status) {
            case 400, 422 -> "VALIDATION_ERROR";
            case 401 -> "UNAUTHORIZED";
            case 403 -> "FORBIDDEN";
            case 404 -> "NOT_FOUND";
            case 405 -> "METHOD_NOT_ALLOWED";
            case 409 -> "CONFLICT";
            case 410 -> "GONE";
            case 413 -> "PAYLOAD_TOO_LARGE";
            case 415 -> "UNSUPPORTED_MEDIA_TYPE";
            case 429 -> "RATE_LIMITED";
            case 502 -> "UPSTREAM_ERROR";
            case 503 -> "SERVICE_UNAVAILABLE";
            case 504 -> "TIMEOUT";
            default -> status >= 400 && status < 500 ? "BAD_REQUEST" : "INTERNAL_ERROR";
        };
    }
}

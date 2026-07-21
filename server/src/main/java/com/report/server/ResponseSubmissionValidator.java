package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;

/**
 * Submit-request body validation for form responses: JSON shape, field count, and nesting depth.
 * Extracted from FormResponseController (#276) — no behavior change.
 */
final class ResponseSubmissionValidator {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private ResponseSubmissionValidator() {}

    /**
     * Parse and validate the submit request body ({@code { data: Object }}). Responds with 400 and
     * returns null on any validation failure; returns the {@code data} node on success.
     */
    static JsonNode parseAndValidateData(Context ctx) {
        String body = ctx.body();
        if (body == null || body.isBlank()) {
            ApiError.respond(
                    ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Request body is required");
            return null;
        }
        JsonNode reqNode;
        try {
            reqNode = MAPPER.readTree(body);
        } catch (Exception e) {
            ApiError.respond(ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Invalid JSON");
            return null;
        }
        JsonNode data = reqNode.path("data");
        if (data.isMissingNode() || !data.isObject()) {
            ApiError.respond(
                    ctx,
                    HttpStatus.BAD_REQUEST,
                    "VALIDATION_ERROR",
                    "'data' field is required and must be an object");
            return null;
        }
        if (data.size() > 1000) {
            ApiError.respond(
                    ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Too many fields (max 1000)");
            return null;
        }
        if (ResponsePayloadSupport.hasExcessiveDepth(data, ResponsePayloadSupport.MAX_NEST_DEPTH)) {
            ApiError.respond(
                    ctx,
                    HttpStatus.BAD_REQUEST,
                    "VALIDATION_ERROR",
                    "Data nesting too deep (max "
                            + ResponsePayloadSupport.MAX_NEST_DEPTH
                            + " levels)");
            return null;
        }
        return data;
    }
}

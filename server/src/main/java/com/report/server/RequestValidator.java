package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.re2j.PatternSyntaxException;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;

import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Shared request validation utilities.
 * Validates path parameters and request bodies at API boundaries.
 */
public final class RequestValidator {

    private static final Pattern SAFE_ID = Pattern.compile("^[a-zA-Z0-9_-]{1,128}$");
    private static final int MAX_TEMPLATE_NAME_LENGTH = 200;
    private static final ObjectMapper MAPPER = new ObjectMapper();
    /** Allowed top-level keys in designer-projection JSON */
    private static final Set<String> PROJECTION_ALLOWED_KEYS = Set.of("templates", "schemaGroups");

    private RequestValidator() {}

    /**
     * Validate a path parameter ID against a safe character pattern.
     *
     * @return the validated ID, or null if invalid (response already sent)
     */
    public static String validateId(Context ctx) {
        return validateId(ctx, "id");
    }

    /**
     * Validate a named path parameter against the safe character pattern.
     *
     * @param paramName the path parameter name (e.g. "id", "vid")
     * @return the validated value, or null if invalid (response already sent)
     */
    public static String validateId(Context ctx, String paramName) {
        String id = ctx.pathParam(paramName);
        if (!SAFE_ID.matcher(id).matches()) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Invalid " + paramName + " format"));
            return null;
        }
        return id;
    }

    /**
     * Extract and validate a template name from the request body.
     *
     * @return the validated name, or null if invalid (response already sent)
     */
    public static String validateTemplateName(Context ctx, String defaultName) {
        var body = ctx.bodyAsClass(java.util.Map.class);
        Object rawName = body.get("name");

        if (rawName != null && !(rawName instanceof String)) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "name must be a string"));
            return null;
        }

        String name = rawName != null ? ((String) rawName).strip() : defaultName;

        if (name.length() > MAX_TEMPLATE_NAME_LENGTH) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "name too long (max " + MAX_TEMPLATE_NAME_LENGTH + " chars)"));
            return null;
        }

        if (name.isBlank()) {
            return defaultName;
        }

        return name;
    }

    /**
     * Validate that a request body is valid JSON with a required top-level key.
     *
     * @return true if valid, false if invalid (response already sent)
     */
    public static boolean validateJsonStructure(Context ctx, String body, String requiredKey) {
        if (body == null || body.isBlank()) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Request body is required"));
            return false;
        }

        try {
            JsonNode node = MAPPER.readTree(body);
            if (!node.has(requiredKey)) {
                ctx.status(HttpStatus.BAD_REQUEST);
                ctx.json(Map.of("error", "Invalid format: missing '" + requiredKey + "' key"));
                return false;
            }
            return true;
        } catch (Exception e) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Invalid JSON"));
            return false;
        }
    }

    /**
     * Validate projection JSON: require "templates" key and reject unknown top-level keys.
     * Single-parse: validates structure and key whitelist in one pass.
     * Returns true if valid, false if invalid (response already sent).
     */
    public static boolean validateProjectionStructure(Context ctx, String body) {
        if (body == null || body.isBlank()) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Request body is required"));
            return false;
        }

        try {
            JsonNode node = MAPPER.readTree(body);
            if (!node.has("templates")) {
                ctx.status(HttpStatus.BAD_REQUEST);
                ctx.json(Map.of("error", "Invalid format: missing 'templates' key"));
                return false;
            }
            Iterator<String> fieldNames = node.fieldNames();
            while (fieldNames.hasNext()) {
                String key = fieldNames.next();
                if (!PROJECTION_ALLOWED_KEYS.contains(key)) {
                    String safeKey = key.length() > 50 ? key.substring(0, 50) : key;
                    safeKey = safeKey.replaceAll("[^a-zA-Z0-9_-]", "?");
                    ctx.status(HttpStatus.BAD_REQUEST);
                    ctx.json(Map.of("error", "Unknown projection key: " + safeKey));
                    return false;
                }
            }
            return true;
        } catch (Exception e) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Invalid JSON"));
            return false;
        }
    }

    /**
     * Validate a form response body: size limit, field count, and detail row limits.
     *
     * @return the parsed JsonNode if valid, or null if invalid (response already sent)
     */
    public static JsonNode validateResponseBody(Context ctx, String body) {
        if (!validateJson(ctx, body)) return null;

        if (body.length() > MAX_RESPONSE_BODY_BYTES) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Response body too large (max 100KB)"));
            return null;
        }

        try {
            JsonNode dataNode = MAPPER.readTree(body);

            int fieldCount = 0;
            var fields = dataNode.fields();
            while (fields.hasNext()) {
                fields.next();
                if (++fieldCount > MAX_RESPONSE_FIELDS) {
                    ctx.status(HttpStatus.BAD_REQUEST);
                    ctx.json(Map.of("error", "Too many fields (max " + MAX_RESPONSE_FIELDS + ")"));
                    return null;
                }
            }

            fields = dataNode.fields();
            while (fields.hasNext()) {
                var field = fields.next();
                if (field.getValue().isArray() && field.getValue().size() > MAX_DETAIL_ROWS) {
                    ctx.status(HttpStatus.BAD_REQUEST);
                    ctx.json(Map.of("error", "Too many detail rows (max " + MAX_DETAIL_ROWS + ")"));
                    return null;
                }
            }

            return dataNode;
        } catch (Exception e) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Invalid JSON"));
            return null;
        }
    }

    private static final int MAX_RESPONSE_BODY_BYTES = 100_000;
    private static final int MAX_RESPONSE_FIELDS = 1000;
    private static final int MAX_DETAIL_ROWS = 100;

    /**
     * Validate that an inputPattern string is a valid RE2J-compatible regex.
     * Used when saving FieldConstraints with inputPattern to prevent ReDoS.
     *
     * @return true if the pattern is valid or null/blank, false if invalid (response already sent)
     */
    public static boolean validateInputPattern(Context ctx, String pattern) {
        if (pattern == null || pattern.isBlank()) return true;
        try {
            com.google.re2j.Pattern.compile(pattern);
            return true;
        } catch (PatternSyntaxException e) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Invalid inputPattern: " + e.getMessage()));
            return false;
        }
    }

    /**
     * Validate that a pattern string is a valid RE2J-compatible regex without sending a response.
     * Used during PDF pre-flight validation.
     *
     * @return true if the pattern is valid or null/blank, false otherwise
     */
    public static boolean isValidPattern(String pattern) {
        if (pattern == null || pattern.isBlank()) return true;
        try {
            com.google.re2j.Pattern.compile(pattern);
            return true;
        } catch (PatternSyntaxException e) {
            return false;
        }
    }

    /**
     * Validate that a request body is parseable JSON.
     *
     * @return true if valid JSON, false if invalid (response already sent)
     */
    public static boolean validateJson(Context ctx, String body) {
        if (body == null || body.isBlank()) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Request body is required"));
            return false;
        }

        try {
            MAPPER.readTree(body);
            return true;
        } catch (Exception e) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Invalid JSON"));
            return false;
        }
    }
}

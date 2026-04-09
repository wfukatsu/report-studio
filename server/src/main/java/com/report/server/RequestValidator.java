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

    // ── PDF generate request validation ──────────────────────────────────────

    private static final int MAX_JSON_DEPTH = 50;
    private static final int MAX_OBJECT_COUNT = 5000;
    private static final Set<String> KNOWN_ELEMENT_KINDS = Set.of(
            "text", "shape", "line", "barcode", "qrcode", "image",
            "check_mark", "checkbox", "radio_mark",
            "seal_box", "signature_line",
            "table", "form_grid", "text_cell", "row_block",
            "formTable", "formGrid",
            "revenueStamp", "repeatingBand", "repeatingList",
            "eraSelect"
    );

    /**
     * Validate a stateless PDF generation request body.
     * Checks: required fields, JSON depth, object count, known element kinds.
     *
     * @param root the parsed request JSON root node
     * @return error message string, or null if valid
     */
    public static String validatePdfGenerateRequest(JsonNode root) {
        if (!root.isObject()) {
            return "Request body must be a JSON object";
        }
        if (!root.has("template")) {
            return "Missing required field: template";
        }
        JsonNode template = root.get("template");
        if (!template.isObject()) {
            return "template must be a JSON object";
        }
        if (!template.has("pages") || !template.get("pages").isArray()) {
            return "template must contain a pages array";
        }

        // Validate pages have sections
        for (JsonNode page : template.get("pages")) {
            if (!page.has("sections") || !page.get("sections").isArray()) {
                return "Each page must contain a sections array";
            }
        }

        // Depth and object count check
        int[] counts = {0}; // mutable counter for object count
        int maxDepth = measureDepthAndCount(root, 0, counts);
        if (maxDepth > MAX_JSON_DEPTH) {
            return "JSON structure too deep (max " + MAX_JSON_DEPTH + " levels)";
        }
        if (counts[0] > MAX_OBJECT_COUNT) {
            return "Too many objects in request (max " + MAX_OBJECT_COUNT + ")";
        }

        // Check for unknown element kinds
        String unknownKind = findUnknownElementKind(template);
        if (unknownKind != null) {
            return "Unknown element type: " + unknownKind;
        }

        return null;
    }

    /**
     * Recursively measure JSON depth and count objects/arrays.
     * Returns max depth reached. Increments counts[0] for each object/array node.
     */
    private static int measureDepthAndCount(JsonNode node, int currentDepth, int[] counts) {
        if (counts[0] > MAX_OBJECT_COUNT) return currentDepth; // early exit
        int maxDepth = currentDepth;
        if (node.isObject()) {
            counts[0]++;
            Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
            while (fields.hasNext()) {
                int childDepth = measureDepthAndCount(fields.next().getValue(), currentDepth + 1, counts);
                if (childDepth > maxDepth) maxDepth = childDepth;
            }
        } else if (node.isArray()) {
            counts[0]++;
            for (JsonNode child : node) {
                int childDepth = measureDepthAndCount(child, currentDepth + 1, counts);
                if (childDepth > maxDepth) maxDepth = childDepth;
            }
        }
        return maxDepth;
    }

    /**
     * Walk template pages/sections/elements and check for unknown element types/kinds.
     *
     * @return the first unknown kind found, or null if all are known
     */
    private static String findUnknownElementKind(JsonNode template) {
        JsonNode pages = template.get("pages");
        if (pages == null || !pages.isArray()) return null;
        for (JsonNode page : pages) {
            JsonNode sections = page.get("sections");
            if (sections == null || !sections.isArray()) continue;
            for (JsonNode section : sections) {
                JsonNode elements = section.get("elements");
                if (elements == null || !elements.isArray()) continue;
                for (JsonNode el : elements) {
                    // V1 uses "kind", V2 uses "type"
                    String kind = el.has("kind") ? el.get("kind").asText("") : "";
                    if (kind.isEmpty()) {
                        kind = el.has("type") ? el.get("type").asText("") : "";
                    }
                    if (!kind.isEmpty() && !KNOWN_ELEMENT_KINDS.contains(kind)) {
                        // Sanitize for safe error message
                        String safe = kind.length() > 50 ? kind.substring(0, 50) : kind;
                        return safe.replaceAll("[^a-zA-Z0-9_-]", "?");
                    }
                }
            }
        }
        return null;
    }

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

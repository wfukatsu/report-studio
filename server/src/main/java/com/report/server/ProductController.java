package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.Principal;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Product Master CRUD endpoints.
 *
 * <p>Products are stored in the dedicated {@code products} table via
 * {@link JsonBlobRepository}. All products share the group key {@code "products"}
 * for efficient listing.
 *
 * <p>Additional singletons in the same table:
 * <ul>
 *   <li>{@code product-code:{code}} — sentinel blobs that enforce code uniqueness</li>
 *   <li>{@code product-fields} — custom field definitions (array of
 *       {@code ProductCustomFieldDef})</li>
 * </ul>
 *
 * <p>Authentication: read endpoints are public; write endpoints require a
 * non-anonymous principal.
 */
public final class ProductController {

    private static final Logger log = LoggerFactory.getLogger(ProductController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final String GROUP_KEY = "products";
    private static final String SENTINEL_PREFIX = "product-code:";
    private static final String FIELDS_ID = "product-fields";
    private static final String EMPTY_ARRAY = "[]";
    private static final int MAX_PRICE_HISTORY = 365;
    private static final int MAX_CUSTOM_FIELDS = 50;
    private static final int MAX_CUSTOM_FIELD_VALUE_LEN = 2000;

    /** Custom field keys must be alphanumeric/hyphen/underscore, no reserved names */
    private static final Pattern SAFE_KEY = Pattern.compile("^[a-zA-Z0-9_-]{1,64}$");
    private static final java.util.Set<String> RESERVED_KEYS =
            java.util.Set.of("__proto__", "constructor", "prototype");

    private final JsonBlobRepository repo;

    public ProductController(JsonBlobRepository repo) {
        this.repo = repo;
    }

    // ── Read endpoints ────────────────────────────────────────────────────────

    /**
     * GET /api/v1/products
     * Returns all non-deleted products.
     */
    public void list(Context ctx) throws Exception {
        List<String> blobs = repo.listByGroupKey(GROUP_KEY);
        ArrayNode result = MAPPER.createArrayNode();
        for (String blob : blobs) {
            try {
                JsonNode product = MAPPER.readTree(blob);
                // Filter out soft-deleted products
                if (!product.path("deletedAt").isNull()) continue;
                result.add(product);
            } catch (Exception e) {
                // Skip malformed blobs
                log.warn("Skipping malformed product blob: {}", e.getMessage());
            }
        }
        ctx.contentType("application/json");
        ctx.result(MAPPER.writeValueAsString(result));
    }

    /**
     * GET /api/v1/products/{id}
     * Returns a single product by ID (including soft-deleted).
     */
    public void get(Context ctx) throws Exception {
        String id = RequestValidator.validateId(ctx);
        if (id == null) return;

        Optional<String> stored = repo.get(id);
        if (stored.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Product not found"));
            return;
        }
        ctx.contentType("application/json");
        ctx.result(stored.get());
    }

    /**
     * POST /api/v1/products
     * Creates a new product.
     */
    public void create(Context ctx) throws Exception {
        if (!requireAuth(ctx)) return;

        String body = ctx.body();
        if (!RequestValidator.validateJson(ctx, body)) return;

        JsonNode req;
        try {
            req = MAPPER.readTree(body);
        } catch (Exception e) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Invalid JSON"));
            return;
        }

        // Validate required fields
        String code = req.path("code").asText(null);
        String name = req.path("name").asText(null);
        if (code == null || code.isBlank() || name == null || name.isBlank()) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "code and name are required"));
            return;
        }
        if (!SAFE_KEY.matcher(code).matches()) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "code must be alphanumeric, hyphen, or underscore (max 64 chars)"));
            return;
        }

        // Validate custom fields
        String customFieldError = validateCustomFields(req.path("customFields"));
        if (customFieldError != null) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", customFieldError));
            return;
        }

        // Check code uniqueness via sentinel
        String sentinelId = SENTINEL_PREFIX + code;
        if (repo.get(sentinelId).isPresent()) {
            ctx.status(HttpStatus.CONFLICT);
            ctx.json(Map.of("error", "DUPLICATE_CODE", "message", "この商品コードは既に使用されています"));
            return;
        }

        // Build product blob
        String now = Instant.now().toString();
        String productId = UUID.randomUUID().toString();
        ObjectNode product = MAPPER.createObjectNode();
        product.put("id", productId);
        product.put("code", code);
        product.put("name", name);
        product.put("unitPrice", req.path("unitPrice").asDouble(0.0));
        product.put("category", req.path("category").asText(""));
        product.put("description", req.path("description").asText(""));
        product.put("stockCount", req.path("stockCount").asInt(0));
        product.put("taxType", req.path("taxType").asText("none"));
        product.put("unit", req.path("unit").asText(""));
        product.put("manufacturer", req.path("manufacturer").asText(""));
        product.set("subscriptionPeriod", req.path("subscriptionPeriod").isNull() ? MAPPER.nullNode() : req.path("subscriptionPeriod"));
        product.set("subscriptionPriceUnit", req.path("subscriptionPriceUnit").isNull() ? MAPPER.nullNode() : req.path("subscriptionPriceUnit"));
        product.set("customFields", req.has("customFields") ? req.path("customFields") : MAPPER.createObjectNode());
        product.set("priceHistory", MAPPER.createArrayNode());
        product.putNull("deletedAt");
        product.put("createdAt", now);
        product.put("updatedAt", now);
        product.put("version", 0);

        String productJson = MAPPER.writeValueAsString(product);

        // Store product + sentinel
        repo.put(productId, productJson, GROUP_KEY);
        repo.put(sentinelId, "{\"productId\":\"" + productId + "\"}");

        log.info("Product created: id={} code={}", productId, code);
        ctx.status(HttpStatus.CREATED);
        ctx.contentType("application/json");
        ctx.result(productJson);
    }

    /**
     * PUT /api/v1/products/{id}
     * Updates an existing product. Appends to priceHistory if unitPrice changes.
     * Uses optimistic concurrency via {@code If-Match: <version>} header.
     */
    public void update(Context ctx) throws Exception {
        if (!requireAuth(ctx)) return;

        String id = RequestValidator.validateId(ctx);
        if (id == null) return;

        Optional<String> storedOpt = repo.get(id);
        if (storedOpt.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Product not found"));
            return;
        }

        JsonNode existing = MAPPER.readTree(storedOpt.get());
        if (!existing.path("deletedAt").isNull()) {
            ctx.status(HttpStatus.GONE);
            ctx.json(Map.of("error", "Product has been deleted"));
            return;
        }

        // Optimistic locking: If-Match header
        String ifMatch = ctx.header("If-Match");
        if (ifMatch != null) {
            int currentVersion = existing.path("version").asInt(0);
            try {
                int expectedVersion = Integer.parseInt(ifMatch);
                if (expectedVersion != currentVersion) {
                    ctx.status(HttpStatus.CONFLICT);
                    ctx.json(Map.of("error", "VERSION_CONFLICT",
                            "message", "他のユーザーが同じ商品を更新しました。最新データを確認してから再試行してください。",
                            "currentVersion", currentVersion));
                    return;
                }
            } catch (NumberFormatException e) {
                ctx.status(HttpStatus.BAD_REQUEST);
                ctx.json(Map.of("error", "Invalid If-Match header value"));
                return;
            }
        }

        String body = ctx.body();
        if (!RequestValidator.validateJson(ctx, body)) return;

        JsonNode req;
        try {
            req = MAPPER.readTree(body);
        } catch (Exception e) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Invalid JSON"));
            return;
        }

        // Validate custom fields if provided
        if (req.has("customFields")) {
            String customFieldError = validateCustomFields(req.path("customFields"));
            if (customFieldError != null) {
                ctx.status(HttpStatus.BAD_REQUEST);
                ctx.json(Map.of("error", customFieldError));
                return;
            }
        }

        // Handle code change + uniqueness check
        String newCode = req.has("code") ? req.path("code").asText(null) : null;
        String existingCode = existing.path("code").asText();
        if (newCode != null && !newCode.equals(existingCode)) {
            if (!SAFE_KEY.matcher(newCode).matches()) {
                ctx.status(HttpStatus.BAD_REQUEST);
                ctx.json(Map.of("error", "code must be alphanumeric, hyphen, or underscore"));
                return;
            }
            String newSentinelId = SENTINEL_PREFIX + newCode;
            if (repo.get(newSentinelId).isPresent()) {
                ctx.status(HttpStatus.CONFLICT);
                ctx.json(Map.of("error", "DUPLICATE_CODE", "message", "この商品コードは既に使用されています"));
                return;
            }
        }

        // Build updated product
        ObjectNode updated = existing.deepCopy();
        String now = Instant.now().toString();

        if (req.has("name")) updated.put("name", req.path("name").asText());
        if (req.has("code")) updated.put("code", req.path("code").asText());
        if (req.has("category")) updated.put("category", req.path("category").asText());
        if (req.has("description")) updated.put("description", req.path("description").asText());
        if (req.has("stockCount")) updated.put("stockCount", req.path("stockCount").asInt());
        if (req.has("taxType")) updated.put("taxType", req.path("taxType").asText());
        if (req.has("unit")) updated.put("unit", req.path("unit").asText());
        if (req.has("manufacturer")) updated.put("manufacturer", req.path("manufacturer").asText());
        if (req.has("subscriptionPeriod")) updated.set("subscriptionPeriod", req.path("subscriptionPeriod"));
        if (req.has("subscriptionPriceUnit")) updated.set("subscriptionPriceUnit", req.path("subscriptionPriceUnit"));
        if (req.has("customFields")) updated.set("customFields", req.path("customFields"));

        // Price history: append entry if unitPrice changes
        if (req.has("unitPrice")) {
            double newPrice = req.path("unitPrice").asDouble();
            double oldPrice = existing.path("unitPrice").asDouble();
            if (Double.compare(newPrice, oldPrice) != 0) {
                ArrayNode history = (ArrayNode) updated.path("priceHistory");
                if (!history.isArray()) {
                    history = MAPPER.createArrayNode();
                }
                // Cap at MAX_PRICE_HISTORY
                if (history.size() >= MAX_PRICE_HISTORY) {
                    ArrayNode trimmed = MAPPER.createArrayNode();
                    for (int i = history.size() - MAX_PRICE_HISTORY + 1; i < history.size(); i++) {
                        trimmed.add(history.get(i));
                    }
                    history = trimmed;
                }
                ObjectNode histEntry = MAPPER.createObjectNode();
                histEntry.put("price", oldPrice);
                histEntry.put("effectiveFrom", LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE));
                history.insert(0, histEntry);
                updated.set("priceHistory", history);
            }
            updated.put("unitPrice", newPrice);
        }

        updated.put("updatedAt", now);
        updated.put("version", existing.path("version").asInt(0) + 1);

        String updatedJson = MAPPER.writeValueAsString(updated);
        repo.put(id, updatedJson, GROUP_KEY);

        // Update sentinel if code changed
        if (newCode != null && !newCode.equals(existingCode)) {
            // Remove old sentinel, add new one
            repo.delete(SENTINEL_PREFIX + existingCode);
            repo.put(SENTINEL_PREFIX + newCode, "{\"productId\":\"" + id + "\"}");
        }

        log.info("Product updated: id={} version={}", id, updated.path("version").asInt());
        ctx.contentType("application/json");
        ctx.result(updatedJson);
    }

    /**
     * DELETE /api/v1/products/{id}
     * Soft-deletes a product by setting {@code deletedAt}.
     */
    public void softDelete(Context ctx) throws Exception {
        if (!requireAuth(ctx)) return;

        String id = RequestValidator.validateId(ctx);
        if (id == null) return;

        Optional<String> storedOpt = repo.get(id);
        if (storedOpt.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Product not found"));
            return;
        }

        JsonNode existing = MAPPER.readTree(storedOpt.get());
        if (!existing.path("deletedAt").isNull()) {
            ctx.status(HttpStatus.GONE);
            ctx.json(Map.of("error", "Product already deleted"));
            return;
        }

        ObjectNode updated = existing.deepCopy();
        String now = Instant.now().toString();
        updated.put("deletedAt", now);
        updated.put("updatedAt", now);
        updated.put("version", existing.path("version").asInt(0) + 1);

        repo.put(id, MAPPER.writeValueAsString(updated), GROUP_KEY);

        log.info("Product soft-deleted: id={}", id);
        ctx.status(HttpStatus.NO_CONTENT);
    }

    // ── Custom field definition endpoints ────────────────────────────────────

    /**
     * GET /api/v1/products/fields
     * Returns custom field definitions.
     */
    public void getFields(Context ctx) throws Exception {
        Optional<String> stored = repo.get(FIELDS_ID);
        ctx.contentType("application/json");
        ctx.result(stored.orElse(EMPTY_ARRAY));
    }

    /**
     * PUT /api/v1/products/fields
     * Replaces custom field definitions.
     */
    public void putFields(Context ctx) throws Exception {
        if (!requireAuth(ctx)) return;

        String body = ctx.body();
        if (!RequestValidator.validateJson(ctx, body)) return;

        JsonNode parsed;
        try {
            parsed = MAPPER.readTree(body);
        } catch (Exception e) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Invalid JSON"));
            return;
        }

        if (!parsed.isArray()) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Request body must be a JSON array"));
            return;
        }

        // Validate each field definition
        for (JsonNode def : parsed) {
            String key = def.path("key").asText(null);
            if (key == null || !SAFE_KEY.matcher(key).matches()) {
                ctx.status(HttpStatus.BAD_REQUEST);
                ctx.json(Map.of("error", "Invalid field key: must be alphanumeric, hyphen, or underscore"));
                return;
            }
            if (RESERVED_KEYS.contains(key)) {
                ctx.status(HttpStatus.BAD_REQUEST);
                ctx.json(Map.of("error", "Reserved field key: " + key));
                return;
            }
            String type = def.path("type").asText(null);
            if (!java.util.Set.of("text", "number", "date", "boolean").contains(type)) {
                ctx.status(HttpStatus.BAD_REQUEST);
                ctx.json(Map.of("error", "Invalid field type: must be text, number, date, or boolean"));
                return;
            }
        }

        repo.put(FIELDS_ID, MAPPER.writeValueAsString(parsed));
        ctx.contentType("application/json");
        ctx.result(MAPPER.writeValueAsString(parsed));
    }

    // ── Package-private helpers (used by ProductMasterResolver) ──────────────

    /**
     * Returns all active (non-deleted) products. Used by the resolve-bindings pipeline.
     */
    List<JsonNode> listActiveProducts() {
        try {
            List<String> blobs = repo.listByGroupKey(GROUP_KEY);
            List<JsonNode> result = new ArrayList<>();
            for (String blob : blobs) {
                try {
                    JsonNode product = MAPPER.readTree(blob);
                    if (product.path("deletedAt").isNull()) {
                        result.add(product);
                    }
                } catch (Exception ignored) {}
            }
            return result;
        } catch (Exception e) {
            log.warn("Failed to list active products: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * Returns a single active product by code. Used by the resolve-bindings pipeline.
     */
    Optional<JsonNode> findByCode(String code) {
        try {
            Optional<String> sentinel = repo.get(SENTINEL_PREFIX + code);
            if (sentinel.isEmpty()) return Optional.empty();
            JsonNode sentinelNode = MAPPER.readTree(sentinel.get());
            String productId = sentinelNode.path("productId").asText(null);
            if (productId == null) return Optional.empty();
            Optional<String> productBlob = repo.get(productId);
            if (productBlob.isEmpty()) return Optional.empty();
            JsonNode product = MAPPER.readTree(productBlob.get());
            if (!product.path("deletedAt").isNull()) return Optional.empty();
            return Optional.of(product);
        } catch (Exception e) {
            log.warn("Failed to find product by code {}: {}", code, e.getMessage());
            return Optional.empty();
        }
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    private boolean requireAuth(Context ctx) {
        Principal principal = ctx.attribute("principal");
        if (principal == null || principal.isAnonymous()) {
            ctx.status(HttpStatus.UNAUTHORIZED);
            ctx.json(Map.of("error", "Authentication required"));
            return false;
        }
        return true;
    }

    private String validateCustomFields(JsonNode customFields) {
        if (customFields == null || customFields.isNull() || customFields.isMissingNode()) {
            return null; // optional
        }
        if (!customFields.isObject()) {
            return "customFields must be a JSON object";
        }
        if (customFields.size() > MAX_CUSTOM_FIELDS) {
            return "customFields exceeds maximum of " + MAX_CUSTOM_FIELDS + " fields";
        }
        var it = customFields.fields();
        while (it.hasNext()) {
            var entry = it.next();
            String key = entry.getKey();
            if (!SAFE_KEY.matcher(key).matches()) {
                return "customFields key must be alphanumeric, hyphen, or underscore: " + key;
            }
            if (RESERVED_KEYS.contains(key)) {
                return "customFields contains reserved key: " + key;
            }
            JsonNode val = entry.getValue();
            if (!val.isTextual() && !val.isNumber() && !val.isBoolean() && !val.isNull()) {
                return "customFields value for key '" + key + "' must be string, number, boolean, or null";
            }
            if (val.isTextual() && val.asText().length() > MAX_CUSTOM_FIELD_VALUE_LEN) {
                return "customFields string value for key '" + key + "' exceeds max length";
            }
        }
        return null;
    }
}

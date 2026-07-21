package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.Principal;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Product Master CRUD endpoints.
 *
 * <p>Products are stored in the dedicated {@code products} table via {@link JsonBlobRepository}.
 * All products share the group key {@code "products"} for efficient listing.
 *
 * <p>Additional singletons in the same table:
 *
 * <ul>
 *   <li>{@code product-code:{code}} — sentinel blobs that enforce code uniqueness
 *   <li>{@code product-fields} — custom field definitions (array of {@code ProductCustomFieldDef})
 * </ul>
 *
 * <p>Authentication: read endpoints are public; write endpoints require a non-anonymous principal.
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

    /** GET /api/v1/products Returns all non-deleted products. */
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

    /** GET /api/v1/products/{id} Returns a single product by ID (including soft-deleted). */
    public void get(Context ctx) throws Exception {
        String id = RequestValidator.validateId(ctx);
        if (id == null) return;

        Optional<String> stored = repo.get(id);
        if (stored.isEmpty()) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Product not found");
            return;
        }
        ctx.contentType("application/json");
        ctx.result(stored.get());
    }

    /** POST /api/v1/products Creates a new product. */
    public void create(Context ctx) throws Exception {
        if (!requireAuth(ctx)) return;

        String body = ctx.body();
        if (!RequestValidator.validateJson(ctx, body)) return;

        JsonNode req;
        try {
            req = MAPPER.readTree(body);
        } catch (Exception e) {
            ApiError.respond(ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Invalid JSON");
            return;
        }

        // Validate required fields
        String code = req.path("code").asText(null);
        String name = req.path("name").asText(null);
        if (code == null || code.isBlank() || name == null || name.isBlank()) {
            ApiError.respond(
                    ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "code and name are required");
            return;
        }
        if (!SAFE_KEY.matcher(code).matches()) {
            ApiError.respond(
                    ctx,
                    HttpStatus.BAD_REQUEST,
                    "VALIDATION_ERROR",
                    "code must be alphanumeric, hyphen, or underscore (max 64 chars)");
            return;
        }

        // Validate custom fields
        String customFieldError = validateCustomFields(req.path("customFields"));
        if (customFieldError != null) {
            ApiError.respond(ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", customFieldError);
            return;
        }

        // Check code uniqueness via sentinel
        String sentinelId = SENTINEL_PREFIX + code;
        if (repo.get(sentinelId).isPresent()) {
            ApiError.respond(ctx, HttpStatus.CONFLICT, "DUPLICATE_CODE", "この商品コードは既に使用されています");
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
        product.set(
                "subscriptionPeriod",
                req.path("subscriptionPeriod").isNull()
                        ? MAPPER.nullNode()
                        : req.path("subscriptionPeriod"));
        product.set(
                "subscriptionPriceUnit",
                req.path("subscriptionPriceUnit").isNull()
                        ? MAPPER.nullNode()
                        : req.path("subscriptionPriceUnit"));
        product.set(
                "customFields",
                req.has("customFields") ? req.path("customFields") : MAPPER.createObjectNode());
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
     * PUT /api/v1/products/{id} Updates an existing product. Appends to priceHistory if unitPrice
     * changes. Uses optimistic concurrency via {@code If-Match: <version>} header.
     */
    public void update(Context ctx) throws Exception {
        if (!requireAuth(ctx)) return;

        String id = RequestValidator.validateId(ctx);
        if (id == null) return;

        Optional<String> storedOpt = repo.get(id);
        if (storedOpt.isEmpty()) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Product not found");
            return;
        }

        JsonNode existing = MAPPER.readTree(storedOpt.get());
        if (!existing.path("deletedAt").isNull()) {
            ApiError.respond(ctx, HttpStatus.GONE, "GONE", "Product has been deleted");
            return;
        }

        // Optimistic locking: If-Match header
        String ifMatch = ctx.header("If-Match");
        if (ifMatch != null) {
            int currentVersion = existing.path("version").asInt(0);
            try {
                int expectedVersion = Integer.parseInt(ifMatch);
                if (expectedVersion != currentVersion) {
                    ApiError.respond(
                            ctx,
                            HttpStatus.CONFLICT,
                            "VERSION_CONFLICT",
                            "他のユーザーが同じ商品を更新しました。最新データを確認してから再試行してください。",
                            Map.of("currentVersion", currentVersion));
                    return;
                }
            } catch (NumberFormatException e) {
                ApiError.respond(
                        ctx,
                        HttpStatus.BAD_REQUEST,
                        "VALIDATION_ERROR",
                        "Invalid If-Match header value");
                return;
            }
        }

        String body = ctx.body();
        if (!RequestValidator.validateJson(ctx, body)) return;

        JsonNode req;
        try {
            req = MAPPER.readTree(body);
        } catch (Exception e) {
            ApiError.respond(ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Invalid JSON");
            return;
        }

        // Validate custom fields if provided
        if (req.has("customFields")) {
            String customFieldError = validateCustomFields(req.path("customFields"));
            if (customFieldError != null) {
                ApiError.respond(ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", customFieldError);
                return;
            }
        }

        // Handle code change + uniqueness check
        String newCode = req.has("code") ? req.path("code").asText(null) : null;
        String existingCode = existing.path("code").asText();
        if (newCode != null && !newCode.equals(existingCode)) {
            if (!SAFE_KEY.matcher(newCode).matches()) {
                ApiError.respond(
                        ctx,
                        HttpStatus.BAD_REQUEST,
                        "VALIDATION_ERROR",
                        "code must be alphanumeric, hyphen, or underscore");
                return;
            }
            String newSentinelId = SENTINEL_PREFIX + newCode;
            if (repo.get(newSentinelId).isPresent()) {
                ApiError.respond(ctx, HttpStatus.CONFLICT, "DUPLICATE_CODE", "この商品コードは既に使用されています");
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
        if (req.has("subscriptionPeriod"))
            updated.set("subscriptionPeriod", req.path("subscriptionPeriod"));
        if (req.has("subscriptionPriceUnit"))
            updated.set("subscriptionPriceUnit", req.path("subscriptionPriceUnit"));
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
                histEntry.put(
                        "effectiveFrom", LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE));
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

    /** DELETE /api/v1/products/{id} Soft-deletes a product by setting {@code deletedAt}. */
    public void softDelete(Context ctx) throws Exception {
        if (!requireAuth(ctx)) return;

        String id = RequestValidator.validateId(ctx);
        if (id == null) return;

        Optional<String> storedOpt = repo.get(id);
        if (storedOpt.isEmpty()) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Product not found");
            return;
        }

        JsonNode existing = MAPPER.readTree(storedOpt.get());
        if (!existing.path("deletedAt").isNull()) {
            ApiError.respond(ctx, HttpStatus.GONE, "GONE", "Product already deleted");
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

    /** GET /api/v1/products/fields Returns custom field definitions. */
    public void getFields(Context ctx) throws Exception {
        Optional<String> stored = repo.get(FIELDS_ID);
        ctx.contentType("application/json");
        ctx.result(stored.orElse(EMPTY_ARRAY));
    }

    /** PUT /api/v1/products/fields Replaces custom field definitions. */
    public void putFields(Context ctx) throws Exception {
        if (!requireAuth(ctx)) return;

        String body = ctx.body();
        if (!RequestValidator.validateJson(ctx, body)) return;

        JsonNode parsed;
        try {
            parsed = MAPPER.readTree(body);
        } catch (Exception e) {
            ApiError.respond(ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Invalid JSON");
            return;
        }

        if (!parsed.isArray()) {
            ApiError.respond(
                    ctx,
                    HttpStatus.BAD_REQUEST,
                    "VALIDATION_ERROR",
                    "Request body must be a JSON array");
            return;
        }

        // Validate each field definition
        for (JsonNode def : parsed) {
            String key = def.path("key").asText(null);
            if (key == null || !SAFE_KEY.matcher(key).matches()) {
                ApiError.respond(
                        ctx,
                        HttpStatus.BAD_REQUEST,
                        "VALIDATION_ERROR",
                        "Invalid field key: must be alphanumeric, hyphen, or underscore");
                return;
            }
            if (RESERVED_KEYS.contains(key)) {
                ApiError.respond(
                        ctx,
                        HttpStatus.BAD_REQUEST,
                        "VALIDATION_ERROR",
                        "Reserved field key: " + key);
                return;
            }
            String type = def.path("type").asText(null);
            if (!java.util.Set.of("text", "number", "date", "boolean").contains(type)) {
                ApiError.respond(
                        ctx,
                        HttpStatus.BAD_REQUEST,
                        "VALIDATION_ERROR",
                        "Invalid field type: must be text, number, date, or boolean");
                return;
            }
        }

        repo.put(FIELDS_ID, MAPPER.writeValueAsString(parsed));
        ctx.contentType("application/json");
        ctx.result(MAPPER.writeValueAsString(parsed));
    }

    // ── CSV Import ────────────────────────────────────────────────────────────

    private static final int IMPORT_MAX_ROWS = 1_000;
    private static final int IMPORT_MAX_CUSTOM_KEYS = 50;

    // Known field column aliases (Japanese and English)
    private static final java.util.Map<String, String> COLUMN_ALIASES =
            java.util.Map.ofEntries(
                    java.util.Map.entry("code", "code"),
                    java.util.Map.entry("商品コード", "code"),
                    java.util.Map.entry("name", "name"),
                    java.util.Map.entry("商品名", "name"),
                    java.util.Map.entry("unitprice", "unitPrice"),
                    java.util.Map.entry("単価", "unitPrice"),
                    java.util.Map.entry("category", "category"),
                    java.util.Map.entry("カテゴリ", "category"),
                    java.util.Map.entry("taxtype", "taxType"),
                    java.util.Map.entry("unit", "unit"),
                    java.util.Map.entry("単位", "unit"),
                    java.util.Map.entry("manufacturer", "manufacturer"),
                    java.util.Map.entry("メーカー", "manufacturer"),
                    java.util.Map.entry("description", "description"),
                    java.util.Map.entry("説明", "description"),
                    java.util.Map.entry("stockcount", "stockCount"),
                    java.util.Map.entry("在庫数", "stockCount"));

    /**
     * POST /api/v1/products/import Bulk-import products from CSV text. Skips rows that fail
     * validation (no full abort).
     */
    public void importCsv(Context ctx) throws Exception {
        if (!requireAuth(ctx)) return;

        String body = ctx.body();
        if (!RequestValidator.validateJson(ctx, body)) return;

        JsonNode req;
        try {
            req = MAPPER.readTree(body);
        } catch (Exception e) {
            ApiError.respond(ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Invalid JSON");
            return;
        }

        String csvText = req.path("csv").asText(null);
        if (csvText == null || csvText.isBlank()) {
            ApiError.respond(
                    ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "csv field is required");
            return;
        }

        // Parse CSV
        java.util.List<java.util.Map<String, String>> rows;
        try {
            rows = CsvDataSource.parse(csvText);
        } catch (IllegalArgumentException e) {
            ApiError.respond(
                    ctx,
                    HttpStatus.BAD_REQUEST,
                    "VALIDATION_ERROR",
                    "CSV exceeds maximum row count of " + IMPORT_MAX_ROWS);
            return;
        }

        if (rows.size() > IMPORT_MAX_ROWS) {
            ApiError.respond(
                    ctx,
                    HttpStatus.BAD_REQUEST,
                    "VALIDATION_ERROR",
                    "CSV exceeds maximum of " + IMPORT_MAX_ROWS + " rows");
            return;
        }

        int imported = 0, skipped = 0;
        com.fasterxml.jackson.databind.node.ArrayNode errors = MAPPER.createArrayNode();

        String now = java.time.Instant.now().toString();

        for (int rowIdx = 0; rowIdx < rows.size(); rowIdx++) {
            int rowNum = rowIdx + 2; // 1-based, accounting for header
            java.util.Map<String, String> row = rows.get(rowIdx);

            // Map known columns; collect unknown as customFields
            java.util.Map<String, String> known = new java.util.HashMap<>();
            java.util.Map<String, String> custom = new java.util.LinkedHashMap<>();
            boolean hasReservedKey = false;

            for (java.util.Map.Entry<String, String> entry : row.entrySet()) {
                String colKey = entry.getKey().toLowerCase().trim();
                String resolved = COLUMN_ALIASES.get(colKey);
                if (resolved != null) {
                    known.put(resolved, entry.getValue());
                } else {
                    // Unknown column → customFields
                    String origKey = entry.getKey().trim();
                    if (RESERVED_KEYS.contains(origKey)) {
                        hasReservedKey = true;
                        break;
                    }
                    if (SAFE_KEY.matcher(origKey).matches()
                            && custom.size() < IMPORT_MAX_CUSTOM_KEYS) {
                        custom.put(origKey, entry.getValue());
                    }
                }
            }

            if (hasReservedKey) {
                skipped++;
                addError(errors, rowNum, "key", "", "プロトタイプ汚染キーが含まれています");
                continue;
            }

            // Validate required: code
            String code = known.getOrDefault("code", "").trim();
            if (code.isEmpty()) {
                skipped++;
                addError(errors, rowNum, "code", "", "商品コードは必須です");
                continue;
            }
            if (!SAFE_KEY.matcher(code).matches()) {
                skipped++;
                addError(errors, rowNum, "code", code, "商品コードは英数字・ハイフン・アンダースコアのみ");
                continue;
            }

            // Validate unitPrice if present
            double unitPrice = 0.0;
            if (known.containsKey("unitPrice")) {
                String priceStr = known.get("unitPrice").trim();
                try {
                    unitPrice = Double.parseDouble(priceStr);
                } catch (NumberFormatException e) {
                    skipped++;
                    addError(errors, rowNum, "unitPrice", priceStr, "数値ではありません");
                    continue;
                }
            }

            // Check code uniqueness via sentinel
            if (repo.get(SENTINEL_PREFIX + code).isPresent()) {
                skipped++;
                addError(errors, rowNum, "code", code, "コード重複: " + code);
                continue;
            }

            // Build product
            String productId = java.util.UUID.randomUUID().toString();
            com.fasterxml.jackson.databind.node.ObjectNode product = MAPPER.createObjectNode();
            product.put("id", productId);
            product.put("code", code);
            product.put("name", known.getOrDefault("name", "").trim());
            product.put("unitPrice", unitPrice);
            product.put("category", known.getOrDefault("category", "").trim());
            product.put("description", known.getOrDefault("description", "").trim());
            product.put("taxType", known.getOrDefault("taxType", "none").trim());
            product.put("unit", known.getOrDefault("unit", "").trim());
            product.put("manufacturer", known.getOrDefault("manufacturer", "").trim());
            // stockCount
            int stockCount = 0;
            if (known.containsKey("stockCount")) {
                try {
                    stockCount = Integer.parseInt(known.get("stockCount").trim());
                } catch (NumberFormatException ignored) {
                }
            }
            product.put("stockCount", stockCount);
            product.putNull("subscriptionPeriod");
            product.putNull("subscriptionPriceUnit");
            // customFields
            com.fasterxml.jackson.databind.node.ObjectNode cf = MAPPER.createObjectNode();
            custom.forEach(cf::put);
            product.set("customFields", cf);
            product.set("priceHistory", MAPPER.createArrayNode());
            product.putNull("deletedAt");
            product.put("createdAt", now);
            product.put("updatedAt", now);
            product.put("version", 0);

            // Save
            repo.put(productId, MAPPER.writeValueAsString(product), GROUP_KEY);
            repo.put(SENTINEL_PREFIX + code, "{\"productId\":\"" + productId + "\"}");
            imported++;
        }

        com.fasterxml.jackson.databind.node.ObjectNode result = MAPPER.createObjectNode();
        result.put("imported", imported);
        result.put("skipped", skipped);
        result.set("errors", errors);
        ctx.contentType("application/json");
        ctx.result(MAPPER.writeValueAsString(result));
    }

    private static void addError(
            com.fasterxml.jackson.databind.node.ArrayNode errors,
            int row,
            String column,
            String value,
            String reason) {
        com.fasterxml.jackson.databind.node.ObjectNode e = errors.objectNode();
        e.put("row", row);
        e.put("column", column);
        e.put("value", value);
        e.put("reason", reason);
        errors.add(e);
    }

    // ── Package-private helpers (used by ProductMasterResolver) ──────────────

    /** Returns all active (non-deleted) products. Used by the resolve-bindings pipeline. */
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
                } catch (Exception ignored) {
                }
            }
            return result;
        } catch (Exception e) {
            log.warn("Failed to list active products: {}", e.getMessage());
            return List.of();
        }
    }

    /** Returns a single active product by code. Used by the resolve-bindings pipeline. */
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
            ApiError.respond(
                    ctx, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Authentication required");
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
                return "customFields value for key '"
                        + key
                        + "' must be string, number, boolean, or null";
            }
            if (val.isTextual() && val.asText().length() > MAX_CUSTOM_FIELD_VALUE_LEN) {
                return "customFields string value for key '" + key + "' exceeds max length";
            }
        }
        return null;
    }
}

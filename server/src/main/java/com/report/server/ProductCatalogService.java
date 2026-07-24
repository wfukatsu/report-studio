package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Read-side product catalog lookups shared by {@link ProductController} (CRUD endpoints) and the
 * resolve-bindings pipeline (#418).
 *
 * <p>Products are stored in the dedicated {@code products} table via {@link JsonBlobRepository}.
 * All products share the group key {@code "products"}; {@code product-code:{code}} sentinel blobs
 * map each unique product code to its product ID.
 *
 * <p>Extracted from {@code ProductController} so that {@code BindingResolveController} no longer
 * depends on a controller (previously injected via setter, with null-check temporal coupling).
 */
public final class ProductCatalogService {

    private static final Logger log = LoggerFactory.getLogger(ProductCatalogService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** Group key shared by all product blobs — single source for controller and service. */
    static final String GROUP_KEY = "products";

    /** Prefix of the sentinel blobs that enforce product-code uniqueness. */
    static final String SENTINEL_PREFIX = "product-code:";

    private final JsonBlobRepository repo;

    public ProductCatalogService(JsonBlobRepository repo) {
        this.repo = repo;
    }

    /** Returns all active (non-deleted) products. */
    public List<JsonNode> listActiveProducts() {
        try {
            List<String> blobs = repo.listByGroupKey(GROUP_KEY);
            List<JsonNode> result = new ArrayList<>();
            for (String blob : blobs) {
                try {
                    JsonNode product = MAPPER.readTree(blob);
                    if (product.path("deletedAt").isNull()) {
                        result.add(product);
                    }
                } catch (Exception e) {
                    // Skip malformed blobs
                    log.warn("Skipping malformed product blob: {}", e.getMessage());
                }
            }
            return result;
        } catch (Exception e) {
            log.warn("Failed to list active products: {}", e.getMessage());
            return List.of();
        }
    }

    /** Returns a single active product by code (via the uniqueness sentinel). */
    public Optional<JsonNode> findByCode(String code) {
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
}

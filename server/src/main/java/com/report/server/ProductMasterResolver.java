package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Resolves the {@code __productMaster__} system group and per-row product lookup enrichment (#144)
 * for the resolve-bindings pipeline. Package-private collaborator of {@link
 * BindingResolveController} (#418) — reads products through {@link ProductCatalogService}, never
 * through ScalarDB directly.
 */
final class ProductMasterResolver {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final ProductCatalogService catalog;

    ProductMasterResolver(ProductCatalogService catalog) {
        this.catalog = catalog;
    }

    /**
     * Resolves the {@code __productMaster__} system group.
     *
     * <p>Supported modes (from request body {@code partitionKeys.__productMaster__}):
     *
     * <ul>
     *   <li>{@code mode=single} + {@code productCode} — returns a single product's fields
     *   <li>{@code mode=list} (default) — returns an array of all active products
     * </ul>
     *
     * <p>For single mode, {@code resolved["__productMaster__"]} is a flat object of the product's
     * fields. For list mode, it is an array of such objects. Deleted or missing products return
     * null fields (not an error) plus a {@code "__stale__": true} marker.
     */
    void resolveProductMasterGroup(
            String groupId, JsonNode req, ObjectNode resolved, ObjectNode errors) {

        JsonNode pkNode = req.path("partitionKeys").path(groupId);
        String mode = pkNode.path("mode").asText("list");
        LocalDate reportDate =
                parseReportDate(req.path("partitionKeys").path("__reportDate__").asText(null));

        if ("single".equals(mode)) {
            String productCode = pkNode.path("productCode").asText(null);
            if (productCode == null) {
                errors.put(groupId, "productCode is required for mode=single");
                return;
            }
            var productOpt = catalog.findByCode(productCode);
            if (productOpt.isEmpty()) {
                // Return stale marker so UI can show warning
                ObjectNode staleRow = MAPPER.createObjectNode();
                staleRow.put("__stale__", true);
                resolved.set(groupId, staleRow);
            } else {
                ObjectNode row = productNodeToRow(productOpt.get(), reportDate);
                resolved.set(groupId, row);
            }
        } else {
            // list mode — array of all active products
            var products = catalog.listActiveProducts();
            ArrayNode arr = MAPPER.createArrayNode();
            for (var product : products) {
                arr.add(productNodeToRow(product, reportDate));
            }
            resolved.set(groupId, arr);
        }
        errors.putNull(groupId);
    }

    /** Parse an optional ISO date string, tolerating null/garbage (returns null). */
    static LocalDate parseReportDate(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return LocalDate.parse(s);
        } catch (Exception ignored) {
            return null;
        }
    }

    /**
     * Collect the lookup relations that enrich {@code groupId} from the product master. Only {@code
     * kind=lookup} relations with {@code from=groupId} and {@code to=__productMaster__} qualify;
     * each must carry an identifier {@code name} and {@code on.fromColumn}. Returns an empty list
     * otherwise.
     */
    static List<JsonNode> collectProductLookups(JsonNode relationsNode, String groupId) {
        List<JsonNode> out = new ArrayList<>();
        if (relationsNode == null || !relationsNode.isArray()) return out;
        for (JsonNode rel : relationsNode) {
            if (!"lookup".equals(rel.path("kind").asText(null))) continue;
            if (!groupId.equals(rel.path("from").asText(null))) continue;
            if (!SharedConstants.SYSTEM_GROUP_PRODUCT_MASTER.equals(rel.path("to").asText(null)))
                continue;
            String name = rel.path("name").asText(null);
            String fromColumn = rel.path("on").path("fromColumn").asText(null);
            if (!BindingResolveController.isValidIdentifier(name)
                    || !BindingResolveController.isValidIdentifier(fromColumn)) continue;
            out.add(rel);
        }
        return out;
    }

    /**
     * Enrich a resolved detail row in place with product master fields for each applicable lookup
     * relation. The row's join value is read via the relation's {@code on.fromColumn} (mapped to
     * its fieldKey), looked up by product code, and the product's fields are added under the {@code
     * name_} prefix (e.g. {@code product_name}). A missing product yields a {@code name_ _stale}
     * marker rather than an error, mirroring the product master group behaviour.
     */
    void enrichRowWithProductLookups(
            ObjectNode rowNode,
            List<JsonNode> lookupRelations,
            Map<String, String> colToFieldKey,
            LocalDate reportDate) {

        if (lookupRelations == null || lookupRelations.isEmpty()) return;

        for (JsonNode rel : lookupRelations) {
            String name = rel.path("name").asText(null);
            String fromColumn = rel.path("on").path("fromColumn").asText(null);
            String joinFieldKey = colToFieldKey.get(fromColumn);
            if (joinFieldKey == null) continue; // the join column wasn't among the resolved fields

            JsonNode codeNode = rowNode.get(joinFieldKey);
            if (codeNode == null || codeNode.isNull()) continue;
            String code = codeNode.asText(null);
            if (code == null || code.isBlank()) continue;

            var productOpt = catalog.findByCode(code);
            if (productOpt.isEmpty()) {
                rowNode.put(name + "_" + "_stale", true);
                continue;
            }
            ObjectNode prow = productNodeToRow(productOpt.get(), reportDate);
            prow.fields().forEachRemaining(e -> rowNode.set(name + "_" + e.getKey(), e.getValue()));
        }
    }

    /** Converts a product JsonNode to a flat row object for resolve-bindings output. */
    private ObjectNode productNodeToRow(JsonNode product, LocalDate reportDate) {
        ObjectNode row = MAPPER.createObjectNode();
        row.put("id", product.path("id").asText(""));
        row.put("code", product.path("code").asText(""));
        row.put("name", product.path("name").asText(""));
        row.put("unitPrice", ProductPriceResolver.resolvePrice(product, reportDate));
        row.put("category", product.path("category").asText(""));
        row.put("description", product.path("description").asText(""));
        row.put("stockCount", product.path("stockCount").asInt(0));
        row.put("taxType", product.path("taxType").asText("none"));
        row.put("unit", product.path("unit").asText(""));
        row.put("manufacturer", product.path("manufacturer").asText(""));
        // Custom fields — flatten into row
        JsonNode customFields = product.path("customFields");
        if (customFields.isObject()) {
            customFields.fields().forEachRemaining(e -> row.set(e.getKey(), e.getValue()));
        }
        return row;
    }
}

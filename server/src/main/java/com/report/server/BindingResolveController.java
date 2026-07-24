package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.Principal;
import com.report.server.auth.RateLimiter;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * POST /api/v2/templates/{id}/resolve-bindings
 *
 * <p>Fetches actual row data from ScalarDB for schema groups that have a tableMeta binding. Returns
 * HTTP 207 (partial success): groups that resolve successfully are in {@code resolved}; groups that
 * fail are in {@code errors} with a diagnostic message. A {@code requestId} is always included for
 * server-side log correlation.
 *
 * <p>Phase 2 restriction: only {@code role=master} groups (single-row Get) are supported. Detail
 * groups (Scan / array result) return an error entry and are skipped.
 *
 * <p>Security:
 *
 * <ul>
 *   <li>Caller must own the template (or the template must have no {@code created_by}).
 *   <li>Each requested (namespace, tableName) pair must exist verbatim in the stored template's
 *       schema {@code tableMeta} — prevents arbitrary table reads.
 *   <li>All identifiers are validated against the shared {@link ScalarDbLimits} regex.
 *   <li>Column names are verified against ScalarDB {@code TableMetadata} before use.
 *   <li>Rate-limited per authenticated user ID ({@code 3 req / 10 s}).
 * </ul>
 *
 * <p>Facade (#418): request validation, authorization, and response shaping live here; the ScalarDB
 * Get/Scan execution is delegated to the package-private {@link BindingQueryExecutor}, and product
 * master resolution to {@link ProductMasterResolver} (backed by {@link ProductCatalogService},
 * constructor-injected — no controller-to-controller setter wiring).
 */
public final class BindingResolveController {

    private static final Logger log = LoggerFactory.getLogger(BindingResolveController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** Same identifier regex as ScalarDbTableController — keep in sync. */
    /** Structural limits — align with ScalarDbLimits and frontend */
    private static final int MAX_GROUPS = 10;

    private static final int MAX_FIELDS_PER_GROUP = 50;
    private static final int MAX_BODY_BYTES = 64 * 1024; // 64 KB

    /** Maximum rows returned per detail group Scan — prevents accidental large result sets. */
    private static final int MAX_DETAIL_ROWS = 500;

    /** System group ID for the product master — single source: SharedConstants (#425). */
    static final String SYSTEM_GROUP_PRODUCT_MASTER = SharedConstants.SYSTEM_GROUP_PRODUCT_MASTER;

    private final JsonBlobRepository definitionsRepo;
    private final RateLimiter rateLimiter;
    private final ProductMasterResolver productMaster;
    private final BindingQueryExecutor queryExecutor;

    public BindingResolveController(
            ScalarDbGateway gateway,
            JsonBlobRepository definitionsRepo,
            ProductCatalogService productCatalog) {
        this(gateway, definitionsRepo, productCatalog, new RateLimiter(3, 10_000L));
    }

    /** Package-private constructor for testing. */
    BindingResolveController(
            ScalarDbGateway gateway,
            JsonBlobRepository definitionsRepo,
            ProductCatalogService productCatalog,
            RateLimiter rateLimiter) {
        this.definitionsRepo = definitionsRepo;
        this.rateLimiter = rateLimiter;
        this.productMaster = new ProductMasterResolver(productCatalog);
        this.queryExecutor = new BindingQueryExecutor(gateway, this.productMaster);
    }

    /** {@code POST /api/v2/templates/{id}/resolve-bindings} */
    public void resolve(Context ctx) throws Exception {
        String correlationId = CorrelationId.generate();

        // ── Rate limiting ────────────────────────────────────────────────────
        Principal principal = ctx.attribute("principal");
        String userId = (principal != null) ? principal.userId() : "anonymous";
        if (!rateLimiter.isAllowed(userId)) {
            ApiError.respond(ctx, 429, "RATE_LIMITED", "Too many requests");
            return;
        }

        // ── Path param validation ────────────────────────────────────────────
        String templateId = RequestValidator.validateId(ctx);
        if (templateId == null) return;

        // ── Body size guard ──────────────────────────────────────────────────
        String body = ctx.body();
        if (body == null || body.isBlank()) {
            ApiError.respond(
                    ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Request body is required");
            return;
        }
        if (body.length() > MAX_BODY_BYTES) {
            ApiError.respond(
                    ctx,
                    HttpStatus.BAD_REQUEST,
                    "VALIDATION_ERROR",
                    "Request body too large (max 64 KB)");
            return;
        }

        // ── Parse body ───────────────────────────────────────────────────────
        JsonNode req;
        try {
            req = MAPPER.readTree(body);
        } catch (Exception e) {
            ApiError.respond(ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Invalid JSON");
            return;
        }

        // ── Template ownership verification ──────────────────────────────────
        Optional<String> storedOpt = definitionsRepo.get(templateId);
        if (storedOpt.isEmpty()) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Template not found");
            return;
        }
        if (!TemplateController.isOwner(ctx, storedOpt.get())) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Template not found");
            return;
        }

        // ── Build allowlist from stored template's schema ────────────────────
        Set<String> allowedTables = extractAllowedTables(storedOpt.get());

        // ── Parse schema groups from request ─────────────────────────────────
        JsonNode schemaNode = req.path("schema");
        JsonNode groupsNode = schemaNode.path("groups");
        if (!groupsNode.isArray()) {
            ApiError.respond(
                    ctx,
                    HttpStatus.BAD_REQUEST,
                    "VALIDATION_ERROR",
                    "schema.groups must be an array");
            return;
        }
        if (groupsNode.size() > MAX_GROUPS) {
            ApiError.respond(
                    ctx,
                    HttpStatus.BAD_REQUEST,
                    "VALIDATION_ERROR",
                    "Too many groups (max " + MAX_GROUPS + ")");
            return;
        }

        JsonNode partitionKeysNode = req.path("partitionKeys");
        if (!partitionKeysNode.isObject()) {
            ApiError.respond(
                    ctx,
                    HttpStatus.BAD_REQUEST,
                    "VALIDATION_ERROR",
                    "partitionKeys must be an object");
            return;
        }

        // ── #144: named relations (for per-row lookup enrichment) ────────────
        JsonNode relationsNode = schemaNode.path("relations");
        // Report date drives product price resolution (same source as the product master group).
        java.time.LocalDate reportDate =
                ProductMasterResolver.parseReportDate(
                        partitionKeysNode.path("__reportDate__").asText(null));

        // ── Per-group resolution ──────────────────────────────────────────────
        ObjectNode resolved = MAPPER.createObjectNode();
        ObjectNode errors = MAPPER.createObjectNode();

        for (JsonNode group : groupsNode) {
            String groupId = group.path("id").asText(null);
            if (groupId == null || groupId.isBlank()) {
                continue;
            }

            String role = group.path("role").asText("master");

            // ── System groups (product master etc.) bypass ScalarDB resolution ──
            if (SYSTEM_GROUP_PRODUCT_MASTER.equals(groupId)) {
                productMaster.resolveProductMasterGroup(groupId, req, resolved, errors);
                continue;
            }

            // Extract and validate table coordinates
            JsonNode tableMeta = group.path("tableMeta");
            if (tableMeta.isMissingNode()) {
                errors.put(groupId, "tableMeta not set — group not bound to a table");
                continue;
            }
            String namespace = tableMeta.path("namespace").asText(null);
            String tableName = tableMeta.path("tableName").asText(null);
            if (!isValidIdentifier(namespace) || !isValidIdentifier(tableName)) {
                errors.put(groupId, "Invalid namespace or tableName identifier");
                continue;
            }

            // Security: verify this table is in the stored template's schema
            String tableKey = namespace + "." + tableName;
            if (!allowedTables.contains(tableKey)) {
                errors.put(groupId, "Table not bound to this template");
                continue;
            }

            // Parse fields
            JsonNode fieldsNode = group.path("fields");
            if (!fieldsNode.isArray() || fieldsNode.size() > MAX_FIELDS_PER_GROUP) {
                errors.put(
                        groupId, "fields missing or too many (max " + MAX_FIELDS_PER_GROUP + ")");
                continue;
            }

            // Build fieldKey → dbColumnName map (name-based, never positional)
            // Also collect Phase 3 computed fields: fieldKey → JEXL expression
            Map<String, String> colToFieldKey = new HashMap<>();
            List<Map.Entry<String, String>> computedFields =
                    new ArrayList<>(); // (fieldKey, expression)
            boolean invalidField = false;
            for (JsonNode field : fieldsNode) {
                String fieldKey = field.path("key").asText(null);
                if (fieldKey == null) continue;

                // Phase 3: computed field — skip DB column validation
                boolean isComputed = field.path("computed").asBoolean(false);
                if (isComputed) {
                    String expr = field.path("expression").asText(null);
                    if (expr != null && !expr.isBlank()) {
                        computedFields.add(Map.entry(fieldKey, expr));
                    }
                    continue;
                }

                String dbCol = field.path("dbColumnName").asText(null);
                if (dbCol == null) continue; // non-computed field without dbColumnName — skip
                if (!isValidIdentifier(dbCol)) {
                    errors.put(groupId, "Invalid dbColumnName: " + sanitize(dbCol));
                    invalidField = true;
                    break;
                }
                colToFieldKey.put(dbCol, fieldKey);
            }
            if (invalidField) continue;

            // Parse partition keys for this group
            JsonNode pkNode = partitionKeysNode.path(groupId);
            if (!pkNode.isObject()) {
                errors.put(groupId, "partitionKeys missing for group");
                continue;
            }

            // ── ScalarDB resolution — route by role ─────────────────────────
            if ("detail".equals(role)) {
                // #144: collect lookup relations FROM this group TO the product master.
                List<JsonNode> lookupRelations =
                        ProductMasterResolver.collectProductLookups(relationsNode, groupId);
                // Phase 2.5: Scan → array of rows
                queryExecutor.resolveDetailGroup(
                        groupId,
                        namespace,
                        tableName,
                        colToFieldKey,
                        computedFields,
                        pkNode,
                        MAX_DETAIL_ROWS,
                        lookupRelations,
                        reportDate,
                        resolved,
                        errors,
                        correlationId,
                        userId);
            } else {
                // Phase 2: Get → single row
                queryExecutor.resolveGroup(
                        groupId,
                        namespace,
                        tableName,
                        colToFieldKey,
                        computedFields,
                        pkNode,
                        resolved,
                        errors,
                        correlationId,
                        userId);
            }
        }

        // ── Build response ───────────────────────────────────────────────────
        ObjectNode response = MAPPER.createObjectNode();
        response.set("resolved", resolved);
        response.set("errors", errors);
        response.put("requestId", correlationId);

        log.info(
                "AUDIT op=resolve_bindings user={} templateId={} outcome=completed correlationId={}",
                userId,
                templateId,
                correlationId);
        ctx.status(207);
        ctx.contentType("application/json");
        ctx.result(MAPPER.writeValueAsString(response));
    }

    // ── Shared validation helpers (also used by collaborators) ────────────────

    static boolean isValidIdentifier(String value) {
        if (value == null || value.isBlank()) return false;
        if (value.length() > ScalarDbLimits.MAX_IDENTIFIER_LENGTH) return false;
        return SharedConstants.DB_IDENTIFIER.matcher(value).matches();
    }

    static String sanitize(String s) {
        if (s == null) return "";
        String safe = s.replaceAll("[\r\n\t]", " ");
        return safe.length() > 80 ? safe.substring(0, 80) : safe;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Extract all (namespace.tableName) pairs from the stored template's schema groups. This builds
     * the allowlist for the ownership+binding verification.
     */
    private static Set<String> extractAllowedTables(String storedEnvelopeJson) {
        Set<String> allowed = new HashSet<>();
        try {
            JsonNode envelope = MAPPER.readTree(storedEnvelopeJson);
            JsonNode groups = envelope.path("definition").path("schema").path("groups");
            if (!groups.isArray()) return allowed;
            for (JsonNode group : groups) {
                String ns = group.path("tableMeta").path("namespace").asText(null);
                String tbl = group.path("tableMeta").path("tableName").asText(null);
                if (ns != null && !ns.isBlank() && tbl != null && !tbl.isBlank()) {
                    allowed.add(ns + "." + tbl);
                }
            }
        } catch (Exception ignored) {
            // Malformed envelope — return empty set (caller handles as "no allowed tables")
        }
        return allowed;
    }
}

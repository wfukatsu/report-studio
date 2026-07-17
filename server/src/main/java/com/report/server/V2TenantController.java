package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.report.server.auth.Principal;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;

/**
 * Handles tenant info endpoints:
 * <ul>
 *   <li>GET /api/v2/tenant — read tenant info (returns {} if not set)</li>
 *   <li>PUT /api/v2/tenant — replace tenant info (admin role required)</li>
 * </ul>
 *
 * <p>Stored as a singleton document in the {@code tenant} table with the fixed
 * id {@code "singleton"}. Uses {@link JsonBlobRepository} exactly like
 * {@code schemas} and {@code binding_trees}.
 */
public final class V2TenantController {

    private static final Logger log = LoggerFactory.getLogger(V2TenantController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String SINGLETON_ID = "singleton";
    private static final String EMPTY_JSON = "{}";

    private final JsonBlobRepository tenantRepo;

    public V2TenantController(JsonBlobRepository tenantRepo) {
        this.tenantRepo = tenantRepo;
    }

    /**
     * GET /api/v2/tenant
     * Returns the tenant info JSON, or {@code {}} if not yet configured.
     * Authentication not required (read-only).
     */
    public void get(Context ctx) throws Exception {
        var stored = tenantRepo.get(SINGLETON_ID);
        String json = stored.orElse(EMPTY_JSON);
        ctx.contentType("application/json");
        ctx.result(json);
    }

    /**
     * PUT /api/v2/tenant
     * Body: TenantInfo JSON
     * Replaces the entire tenant info document.
     * Requires an authenticated principal with the "admin" role.
     */
    public void put(Context ctx) throws Exception {
        // Single source of truth for the admin-role predicate (throws 403).
        // Unauthenticated requests are already rejected with 401 by the
        // auth before-filter in ApiRoutes, so no separate 401 branch here.
        ApiRoutes.requireAdminRole(ctx);
        Principal principal = ctx.attribute("principal");

        String body = ctx.body();
        if (body == null || body.isBlank()) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Request body is required"));
            return;
        }

        // Validate that body is valid JSON
        JsonNode parsed;
        try {
            parsed = MAPPER.readTree(body);
        } catch (Exception e) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Invalid JSON"));
            return;
        }

        if (!parsed.isObject()) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Request body must be a JSON object"));
            return;
        }

        tenantRepo.put(SINGLETON_ID, MAPPER.writeValueAsString(parsed));
        log.info("Tenant info updated by {}", principal.userId());

        ctx.contentType("application/json");
        ctx.result(MAPPER.writeValueAsString(parsed));
    }
}

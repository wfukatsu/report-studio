package com.report.server;

import io.javalin.config.JavalinConfig;
import io.javalin.http.HttpStatus;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Registers all API routes and middleware on the given Javalin instance.
 *
 * <p>Middleware order (applied to all /api/* paths):
 *
 * <ol>
 *   <li>Global exception handler
 *   <li>Security response headers (after-filter)
 *   <li>CSRF Origin verification (before-filter, state-changing methods only)
 *   <li>Authentication resolution (before-filter)
 * </ol>
 */
public final class ApiRoutes {

    private static final Logger log = LoggerFactory.getLogger(ApiRoutes.class);
    private static final int SERVER_PORT = 8080;

    /** Allowed cross-origin for CORS/CSRF; null means dev-only (localhost:5173). */
    private static final String ALLOWED_ORIGIN = System.getenv("ALLOWED_ORIGIN");

    private ApiRoutes() {}

    public static void register(JavalinConfig config, AppWiring w) {
        registerMiddleware(config, w);
        registerAuthRoutes(config, w);
        registerBindingTreeRoutes(config, w);
        registerPublicFormRoutes(config, w);
        registerJobRoutes(config, w);
        registerV2Routes(config, w);
        registerAdminRoutes(config, w);
        registerV2SchemaRoutes(config, w);
    }

    // ── Middleware ─────────────────────────────────────────────────────────────

    private static void registerMiddleware(JavalinConfig config, AppWiring w) {
        // Global exception handler — returns JSON error body without stack traces
        config.routes.exception(
                Exception.class,
                (e, ctx) -> {
                    if (e instanceof io.javalin.http.HttpResponseException hre) {
                        ctx.status(hre.getStatus());
                        ctx.json(Map.of("error", hre.getMessage()));
                        return;
                    }
                    log.error("Unhandled exception [{} {}]", ctx.method(), ctx.path(), e);
                    ctx.status(500);
                    ctx.json(Map.of("error", "Internal server error"));
                });

        // Security response headers
        config.routes.after(
                ctx -> {
                    ctx.header("X-Content-Type-Options", "nosniff");
                    ctx.header("X-Frame-Options", "DENY");
                    ctx.header("Referrer-Policy", "no-referrer");
                    // img-src includes data: to allow inline SVG placeholder thumbnails in CSS
                    ctx.header(
                            "Content-Security-Policy",
                            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
                                    + "img-src 'self' data:; connect-src 'self'");
                    // No-cache for file downloads
                    String contentType = ctx.res().getContentType();
                    if (contentType != null
                            && (contentType.contains("application/pdf")
                                    || contentType.contains("application/zip"))) {
                        ctx.header("Cache-Control", "no-store, no-cache, must-revalidate");
                        ctx.header("Pragma", "no-cache");
                    }
                });

        // CSRF protection: verify Origin (or Referer) on state-changing requests
        config.routes.before(
                "/api/*",
                ctx -> {
                    String reason =
                            csrfRejectReason(
                                    ctx.method().name(),
                                    ctx.path(),
                                    ctx.header("Origin"),
                                    ctx.header("Referer"),
                                    ctx.header("Authorization"));
                    if (reason != null) throw new io.javalin.http.ForbiddenResponse(reason);
                });

        // Auth before-filter: resolve principal and enforce authentication
        config.routes.before(
                "/api/*",
                ctx -> {
                    String path = ctx.path();
                    if (path.startsWith("/api/v1/public/")
                            || path.startsWith("/api/v1/auth/")
                            || path.equals("/api/v1/health")
                            || path.equals("/api/v2/health")) {
                        ctx.attribute("principal", com.report.server.auth.Principal.ANONYMOUS);
                        return;
                    }
                    var principal = w.authCtrl.resolveFromRequest(ctx);
                    if (principal.isAnonymous()) {
                        // Fall back to Bearer PAT auth for CLI / CI clients (#195)
                        principal = w.apiTokenCtrl.resolveFromBearer(ctx);
                    }
                    ctx.attribute("principal", principal);
                    if (principal.isAnonymous()) {
                        throw new io.javalin.http.UnauthorizedResponse("Authentication required");
                    }
                });

        // Admin role enforcement: all /api/v1/admin/* endpoints require admin role
        // Runs after auth filter so principal is already resolved
        registerAdminRoleFilter(config);
    }

    /**
     * Registers the admin-role before-filter on /api/v1/admin/*. Package-private so
     * AdminRoleFilterWiringTest can exercise the real registration (path pattern + handler) over
     * HTTP — the controllers behind these routes perform no role check of their own.
     */
    static void registerAdminRoleFilter(JavalinConfig config) {
        config.routes.before("/api/v1/admin/*", ApiRoutes::requireAdminRole);
    }

    /**
     * CSRF decision for one request. Returns {@code null} to allow, or a human-readable reason to
     * reject with 403. Pure and package-private so it can be unit-tested directly (issue #201).
     *
     * <p>For cookie-authenticated, state-changing requests the browser-supplied {@code Origin} (or,
     * when absent, the origin parsed from {@code Referer}) must be present and match an allowed
     * origin. Previously a <b>missing</b> Origin was allowed, so an attacker page that suppressed
     * the header slipped past the check — the exact gap CSRF protection must not have.
     *
     * <p>Two carve-outs keep legitimate non-browser callers working:
     *
     * <ul>
     *   <li><b>Bearer/PAT</b> requests are not cookie-authenticated, so they carry no CSRF risk and
     *       are exempt regardless of Origin.
     *   <li><b>{@code /api/v1/auth/*} and {@code /api/v1/public/*}</b> may be called by non-browser
     *       clients (CLI password login, external public-form submission) that legitimately omit
     *       Origin/Referer; a missing header is tolerated there, but a present-but-foreign origin
     *       is still rejected.
     * </ul>
     */
    static String csrfRejectReason(
            String method, String path, String origin, String referer, String authorization) {
        if ("GET".equals(method) || "HEAD".equals(method) || "OPTIONS".equals(method)) return null;
        if (authorization != null && authorization.startsWith("Bearer ")) return null;

        String candidate = (origin != null && !origin.isBlank()) ? origin : originOf(referer);
        boolean exemptPath =
                path != null
                        && (path.startsWith("/api/v1/public/") || path.startsWith("/api/v1/auth/"));

        if (candidate == null || candidate.isBlank()) {
            return exemptPath ? null : "Missing Origin/Referer on state-changing request";
        }
        return isAllowedOrigin(candidate) ? null : "Cross-origin request rejected";
    }

    /**
     * True if the origin is this server, the configured ALLOWED_ORIGIN, or a local Vite dev port.
     */
    private static boolean isAllowedOrigin(String origin) {
        if (origin.equals("http://localhost:" + SERVER_PORT)) return true;
        if (ALLOWED_ORIGIN != null && origin.equals(ALLOWED_ORIGIN)) return true;
        for (int port = 5173; port <= 5200; port++) {
            if (origin.equals("http://localhost:" + port)) return true;
        }
        return false;
    }

    /**
     * Extract the {@code scheme://host[:port]} origin from a full URL (e.g. a Referer), or null.
     */
    private static String originOf(String url) {
        if (url == null || url.isBlank()) return null;
        try {
            java.net.URI u = java.net.URI.create(url);
            String scheme = u.getScheme();
            String host = u.getHost();
            if (scheme == null || host == null) return null;
            return u.getPort() == -1
                    ? scheme + "://" + host
                    : scheme + "://" + host + ":" + u.getPort();
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Rejects the request with 403 unless the resolved principal has the "admin" role. Single
     * source of truth for the admin-role predicate — used by the /api/v1/admin/* before-filter and
     * by controllers that guard individual admin-only endpoints (e.g. TenantController.put).
     */
    static void requireAdminRole(io.javalin.http.Context ctx) {
        com.report.server.auth.Principal principal = ctx.attribute("principal");
        if (principal == null || principal.isAnonymous() || !principal.roles().contains("admin")) {
            throw new io.javalin.http.ForbiddenResponse("Admin role required");
        }
    }

    // ── Route groups ───────────────────────────────────────────────────────────

    private static void registerAuthRoutes(JavalinConfig config, AppWiring w) {
        config.routes.get("/api/v1/health", ctx -> ctx.json(Map.of("status", "ok")));
        config.routes.get("/api/v1/auth/me", w.authCtrl::me);
        config.routes.post("/api/v1/auth/login", w.authCtrl::login);
        config.routes.post("/api/v1/auth/logout", w.authCtrl::logout);
        config.routes.post("/api/v1/auth/change-profile", w.authCtrl::changeProfile);
        // Personal Access Tokens (#195) — session-authenticated management
        config.routes.post("/api/v1/auth/tokens", w.apiTokenCtrl::create);
        config.routes.get("/api/v1/auth/tokens", w.apiTokenCtrl::list);
        config.routes.delete("/api/v1/auth/tokens/{id}", w.apiTokenCtrl::revoke);
    }

    private static void registerAdminRoutes(JavalinConfig config, AppWiring w) {
        // User management (admin only)
        config.routes.get("/api/v1/admin/users", w.adminUserCtrl::list);
        config.routes.post("/api/v1/admin/users", w.adminUserCtrl::create);
        config.routes.put("/api/v1/admin/users/{id}", w.adminUserCtrl::update);
        config.routes.delete("/api/v1/admin/users/{id}", w.adminUserCtrl::delete);
        // Server config (admin only)
        config.routes.get("/api/v1/admin/server-config", w.adminServerCtrl::getConfig);
        config.routes.put("/api/v1/admin/server-config", w.adminServerCtrl::putConfig);
        config.routes.post("/api/v1/admin/server-config/test", w.adminServerCtrl::testConfig);
        config.routes.post("/api/v1/admin/server/restart", w.adminServerCtrl::restart);
        // Observability (admin only) — detailed health + process metrics.
        // Public liveness stays on /api/v1/health and /api/v2/health.
        config.routes.get("/api/v1/admin/health", w.healthCtrl::detailed);
        config.routes.get("/api/v1/admin/metrics", w.healthCtrl::metrics);
    }

    private static void registerBindingTreeRoutes(JavalinConfig config, AppWiring w) {
        config.routes.get("/api/v1/binding-trees/{id}", w.bindingCtrl::get);
        config.routes.put("/api/v1/binding-trees/{id}", w.bindingCtrl::put);
    }

    private static void registerPublicFormRoutes(JavalinConfig config, AppWiring w) {
        config.routes.get("/api/v1/public/forms/{id}", w.publicFormCtrl::getFormInfo);
        config.routes.post("/api/v1/public/forms/{id}/verify", w.publicFormCtrl::verifyPassword);
        config.routes.get("/api/v1/public/forms/{id}/projection", w.publicFormCtrl::getProjection);
        config.routes.post("/api/v1/public/forms/{id}/submit", w.publicFormCtrl::submitResponse);
    }

    private static void registerJobRoutes(JavalinConfig config, AppWiring w) {
        config.routes.post("/api/v1/jobs", w.jobCtrl::submit);
        config.routes.get("/api/v1/jobs", w.jobCtrl::list);
        config.routes.get("/api/v1/jobs/{id}", w.jobCtrl::status);
        config.routes.get("/api/v1/jobs/{id}/output", w.jobCtrl::download);
        config.routes.delete("/api/v1/jobs/{id}", w.jobCtrl::cancel);
    }

    // ── V2 routes ─────────────────────────────────────────────────────────────

    private static void registerV2Routes(JavalinConfig config, AppWiring w) {
        config.routes.get("/api/v2/health", ctx -> ctx.status(204));
        config.routes.get("/api/v2/templates", w.templateCtrl::list);
        config.routes.post("/api/v2/templates", w.templateCtrl::create);
        config.routes.get("/api/v2/templates/{id}", w.templateCtrl::get);
        config.routes.put("/api/v2/templates/{id}", w.templateCtrl::put);
        // navigator.sendBeacon (tab-close auto-save, #213) can only issue POST, so the
        // beacon save hits POST /templates/{id}. Bind it to the same handler as PUT — without
        // this the beacon 404s and the last edits are silently lost.
        config.routes.post("/api/v2/templates/{id}", w.templateCtrl::put);
        config.routes.delete("/api/v2/templates/{id}", w.templateCtrl::delete);
        config.routes.post("/api/v2/templates/{id}/duplicate", w.templateCtrl::duplicate);
        config.routes.put("/api/v2/templates/{id}/visibility", w.templateCtrl::updateVisibility);
        config.routes.post("/api/v2/templates/{id}/copy", w.templateCtrl::copy);
        config.routes.post("/api/v2/templates/{id}/evaluate", w.evalCtrl::evaluate);
        config.routes.post("/api/v2/templates/{id}/validate", w.evalCtrl::validate);
        config.routes.get("/api/v2/templates/{id}/versions", w.versionCtrl::list);
        config.routes.post("/api/v2/templates/{id}/versions", w.versionCtrl::create);
        config.routes.post("/api/v2/templates/{id}/versions/{vid}/restore", w.versionCtrl::restore);

        // V2 form responses
        config.routes.post("/api/v2/templates/{id}/responses", w.formResponseCtrl::submit);
        config.routes.get("/api/v2/templates/{id}/responses", w.formResponseCtrl::list);
        config.routes.get("/api/v2/templates/{id}/responses/export", w.responseExportCtrl::export);
        config.routes.get("/api/v2/templates/{id}/responses/{rid}", w.formResponseCtrl::get);
        config.routes.delete("/api/v2/templates/{id}/responses/{rid}", w.formResponseCtrl::delete);
        config.routes.patch(
                "/api/v2/templates/{id}/responses/{rid}/status", w.formResponseCtrl::updateStatus);
        config.routes.get(
                "/api/v2/templates/{id}/responses/{rid}/audit", w.formResponseCtrl::getAudit);
        config.routes.get(
                "/api/v2/templates/{id}/responses/{rid}/pdf", w.responsePdfCtrl::generatePdf);

        // Cross-template issued-documents view (#190)
        config.routes.get("/api/v2/documents", w.formResponseCtrl::listDocuments);

        // V2 template export/import/thumbnail
        config.routes.get("/api/v2/templates/{id}/export", w.exportCtrl::export);
        config.routes.post("/api/v2/templates/import", w.exportCtrl::importTemplate);
        config.routes.get("/api/v2/templates/{id}/thumbnail", w.thumbnailCtrl::get);

        // V2 template PDF generation
        config.routes.post("/api/v2/templates/{id}/pdf", w.pdfCtrl::generate);

        // V2 schema inference
        config.routes.post("/api/v2/schemas/infer", w.schemaInferCtrl::infer);

        // V2 stateless PDF generation
        config.routes.post("/api/v2/pdf/generate", w.statelessPdfCtrl::generate);

        // V2 stateless XLSX generation (issue #118)
        config.routes.post("/api/v2/excel/generate", w.statelessExcelCtrl::generate);

        // V2 async PDF jobs
        config.routes.post("/api/v2/pdf-jobs", w.pdfJobCtrl::submit);
        // Unified job listing + cancel across all job types (issue #191)
        config.routes.get("/api/v2/pdf-jobs", w.jobCtrl::listUnified);
        config.routes.get("/api/v2/pdf-jobs/{jobId}", w.pdfJobCtrl::getStatus);
        config.routes.get("/api/v2/pdf-jobs/{jobId}/result", w.pdfJobCtrl::getResult);
        config.routes.delete("/api/v2/pdf-jobs/{jobId}", w.jobCtrl::cancelUnified);

        // V2 ScalarDB catalog (namespaces → tables → columns) for schema binding UI
        config.routes.get("/api/v2/scalardb/catalog", w.scalarDbCatalogCtrl::getCatalog);
        // V2 ScalarDB table creation (Phase 1.5)
        config.routes.post("/api/v2/scalardb/tables", w.scalarDbTableCtrl::createTable);
        // Phase 2: resolve actual ScalarDB row data for live preview
        config.routes.post(
                "/api/v2/templates/{id}/resolve-bindings", w.bindingResolveCtrl::resolve);

        // Tenant info — shared organization settings
        config.routes.get("/api/v2/tenant", w.tenantCtrl::get);
        config.routes.put("/api/v2/tenant", w.tenantCtrl::put);

        // Data Browser — ScalarDB full-table scan (read-only, authenticated users)
        config.routes.get(
                "/api/v2/scalardb/tables/{ns}/{table}/rows", w.scalarDbScanCtrl::scanRows);

        // Data Browser — ScalarDB row CRUD (authenticated users, system namespaces protected)
        config.routes.post(
                "/api/v2/scalardb/tables/{ns}/{table}/rows", w.scalarDbRowCtrl::insertRow);
        config.routes.put(
                "/api/v2/scalardb/tables/{ns}/{table}/rows", w.scalarDbRowCtrl::updateRow);
        config.routes.delete(
                "/api/v2/scalardb/tables/{ns}/{table}/rows", w.scalarDbRowCtrl::deleteRow);

        // Webhooks
        config.routes.get("/api/v1/webhooks/{templateId}", w.webhookCtrl::getConfig);
        config.routes.put("/api/v1/webhooks/{templateId}", w.webhookCtrl::putConfig);
        config.routes.post("/api/v1/webhooks/{templateId}/test", w.webhookCtrl::testWebhook);

        // Document auto-numbering sequences
        config.routes.get("/api/v1/sequences/{templateId}", w.sequenceCtrl::getConfig);
        config.routes.put("/api/v1/sequences/{templateId}", w.sequenceCtrl::putConfig);

        // Batch PDF generation
        config.routes.post("/api/v2/pdf-jobs/batch", w.batchPdfCtrl::submitBatch);
        config.routes.get("/api/v2/pdf-jobs/batch/{id}", w.batchPdfCtrl::getStatus);
        config.routes.get("/api/v2/pdf-jobs/batch/{id}/result", w.batchPdfCtrl::getResult);

        // Product Master — tenant-wide product catalog
        config.routes.get("/api/v1/products", w.productCtrl::list);
        config.routes.get("/api/v1/products/fields", w.productCtrl::getFields);
        config.routes.get("/api/v1/products/{id}", w.productCtrl::get);
        config.routes.post("/api/v1/products", w.productCtrl::create);
        config.routes.put("/api/v1/products/fields", w.productCtrl::putFields);
        config.routes.put("/api/v1/products/{id}", w.productCtrl::update);
        config.routes.delete("/api/v1/products/{id}", w.productCtrl::softDelete);
        config.routes.post("/api/v1/products/import", w.productCtrl::importCsv);
    }

    // -----------------------------------------------------------------------
    // Schemas — unified schema CRUD (was schema-library)
    // -----------------------------------------------------------------------

    private static void registerV2SchemaRoutes(JavalinConfig config, AppWiring w) {
        // New canonical paths
        config.routes.get("/api/v2/schemas", w.schemaLibraryCtrl::list);
        config.routes.post("/api/v2/schemas", w.schemaLibraryCtrl::create);
        config.routes.get("/api/v2/schemas/{id}", w.schemaLibraryCtrl::get);
        config.routes.put("/api/v2/schemas/{id}", w.schemaLibraryCtrl::put);
        config.routes.delete("/api/v2/schemas/{id}", w.schemaLibraryCtrl::delete);

        // Backward-compat redirects for old /api/v2/schema-library paths
        config.routes.get(
                "/api/v2/schema-library",
                ctx -> ctx.redirect("/api/v2/schemas", HttpStatus.MOVED_PERMANENTLY));
        config.routes.get(
                "/api/v2/schema-library/{id}",
                ctx ->
                        ctx.redirect(
                                "/api/v2/schemas/" + ctx.pathParam("id"),
                                HttpStatus.MOVED_PERMANENTLY));
    }
}

package com.report.server;

import io.javalin.Javalin;
import io.javalin.http.HttpStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;

/**
 * Registers all API routes and middleware on the given Javalin instance.
 *
 * <p>Middleware order (applied to all /api/* paths):
 * <ol>
 *   <li>Global exception handler</li>
 *   <li>Security response headers (after-filter)</li>
 *   <li>CSRF Origin verification (before-filter, state-changing methods only)</li>
 *   <li>Authentication resolution (before-filter)</li>
 * </ol>
 */
public final class ApiRoutes {

    private static final Logger log = LoggerFactory.getLogger(ApiRoutes.class);
    private static final int SERVER_PORT = 8080;
    /** Allowed cross-origin for CORS/CSRF; null means dev-only (localhost:5173). */
    private static final String ALLOWED_ORIGIN = System.getenv("ALLOWED_ORIGIN");

    private ApiRoutes() {}

    public static void register(Javalin app, AppWiring w) {
        registerMiddleware(app, w);
        registerAuthRoutes(app, w);
        registerBindingTreeRoutes(app, w);
        registerPublicFormRoutes(app, w);
        registerJobRoutes(app, w);
        registerV2Routes(app, w);
        registerAdminRoutes(app, w);
        registerV2SchemaRoutes(app, w);
    }

    // ── Middleware ─────────────────────────────────────────────────────────────

    private static void registerMiddleware(Javalin app, AppWiring w) {
        // Global exception handler — returns JSON error body without stack traces
        app.exception(Exception.class, (e, ctx) -> {
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
        app.after(ctx -> {
            ctx.header("X-Content-Type-Options", "nosniff");
            ctx.header("X-Frame-Options", "DENY");
            ctx.header("Referrer-Policy", "no-referrer");
            // img-src includes data: to allow inline SVG placeholder thumbnails in CSS
            ctx.header("Content-Security-Policy",
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
                "img-src 'self' data:; connect-src 'self'");
            // No-cache for file downloads
            String contentType = ctx.res().getContentType();
            if (contentType != null && (contentType.contains("application/pdf")
                    || contentType.contains("application/zip"))) {
                ctx.header("Cache-Control", "no-store, no-cache, must-revalidate");
                ctx.header("Pragma", "no-cache");
            }
        });

        // CSRF protection: verify Origin header on state-changing requests
        app.before("/api/*", ctx -> {
            String method = ctx.method().name();
            if (!"GET".equals(method) && !"HEAD".equals(method) && !"OPTIONS".equals(method)) {
                String origin = ctx.header("Origin");
                if (origin != null && !origin.isBlank()
                        && !origin.equals("http://localhost:" + SERVER_PORT)
                        && (ALLOWED_ORIGIN == null || !origin.equals(ALLOWED_ORIGIN))) {
                    // Allow any Vite dev server port (5173–5200) for local development
                    boolean isLocalVite = false;
                    for (int port = 5173; port <= 5200; port++) {
                        if (origin.equals("http://localhost:" + port)) { isLocalVite = true; break; }
                    }
                    if (!isLocalVite) {
                        throw new io.javalin.http.ForbiddenResponse("Cross-origin request rejected");
                    }
                }
            }
        });

        // Auth before-filter: resolve principal and enforce authentication
        app.before("/api/*", ctx -> {
            String path = ctx.path();
            if (path.startsWith("/api/v1/public/")
                    || path.startsWith("/api/v1/auth/")
                    || path.equals("/api/v1/health")
                    || path.equals("/api/v2/health")) {
                ctx.attribute("principal", com.report.server.auth.Principal.ANONYMOUS);
                return;
            }
            var principal = w.authCtrl.resolveFromRequest(ctx);
            ctx.attribute("principal", principal);
            if (principal.isAnonymous()) {
                throw new io.javalin.http.UnauthorizedResponse("Authentication required");
            }
        });

        // Admin role enforcement: all /api/v1/admin/* endpoints require admin role
        // Runs after auth filter so principal is already resolved
        registerAdminRoleFilter(app);
    }

    /**
     * Registers the admin-role before-filter on /api/v1/admin/*.
     * Package-private so AdminRoleFilterWiringTest can exercise the real
     * registration (path pattern + handler) over HTTP — the controllers
     * behind these routes perform no role check of their own.
     */
    static void registerAdminRoleFilter(Javalin app) {
        app.before("/api/v1/admin/*", ApiRoutes::requireAdminRole);
    }

    /**
     * Rejects the request with 403 unless the resolved principal has the
     * "admin" role. Single source of truth for the admin-role predicate —
     * used by the /api/v1/admin/* before-filter and by controllers that
     * guard individual admin-only endpoints (e.g. TenantController.put).
     */
    static void requireAdminRole(io.javalin.http.Context ctx) {
        com.report.server.auth.Principal principal = ctx.attribute("principal");
        if (principal == null || principal.isAnonymous() || !principal.roles().contains("admin")) {
            throw new io.javalin.http.ForbiddenResponse("Admin role required");
        }
    }

    // ── Route groups ───────────────────────────────────────────────────────────

    private static void registerAuthRoutes(Javalin app, AppWiring w) {
        app.get("/api/v1/health", ctx -> ctx.json(Map.of("status", "ok")));
        app.get("/api/v1/auth/me", w.authCtrl::me);
        app.post("/api/v1/auth/login", w.authCtrl::login);
        app.post("/api/v1/auth/logout", w.authCtrl::logout);
        app.post("/api/v1/auth/change-profile", w.authCtrl::changeProfile);
    }

    private static void registerAdminRoutes(Javalin app, AppWiring w) {
        // User management (admin only)
        app.get("/api/v1/admin/users",          w.adminUserCtrl::list);
        app.post("/api/v1/admin/users",         w.adminUserCtrl::create);
        app.put("/api/v1/admin/users/{id}",     w.adminUserCtrl::update);
        app.delete("/api/v1/admin/users/{id}",  w.adminUserCtrl::delete);
        // Server config (admin only)
        app.get("/api/v1/admin/server-config",        w.adminServerCtrl::getConfig);
        app.put("/api/v1/admin/server-config",        w.adminServerCtrl::putConfig);
        app.post("/api/v1/admin/server-config/test",  w.adminServerCtrl::testConfig);
        app.post("/api/v1/admin/server/restart",      w.adminServerCtrl::restart);
        // Observability (admin only) — detailed health + process metrics.
        // Public liveness stays on /api/v1/health and /api/v2/health.
        app.get("/api/v1/admin/health",  w.healthCtrl::detailed);
        app.get("/api/v1/admin/metrics", w.healthCtrl::metrics);
    }

    private static void registerBindingTreeRoutes(Javalin app, AppWiring w) {
        app.get("/api/v1/binding-trees/{id}", w.bindingCtrl::get);
        app.put("/api/v1/binding-trees/{id}", w.bindingCtrl::put);
    }

    private static void registerPublicFormRoutes(Javalin app, AppWiring w) {
        app.get("/api/v1/public/forms/{id}", w.publicFormCtrl::getFormInfo);
        app.post("/api/v1/public/forms/{id}/verify", w.publicFormCtrl::verifyPassword);
        app.get("/api/v1/public/forms/{id}/projection", w.publicFormCtrl::getProjection);
        app.post("/api/v1/public/forms/{id}/submit", w.publicFormCtrl::submitResponse);
    }

    private static void registerJobRoutes(Javalin app, AppWiring w) {
        app.post("/api/v1/jobs", w.jobCtrl::submit);
        app.get("/api/v1/jobs", w.jobCtrl::list);
        app.get("/api/v1/jobs/{id}", w.jobCtrl::status);
        app.get("/api/v1/jobs/{id}/output", w.jobCtrl::download);
        app.delete("/api/v1/jobs/{id}", w.jobCtrl::cancel);
    }

    // ── V2 routes ─────────────────────────────────────────────────────────────

    private static void registerV2Routes(Javalin app, AppWiring w) {
        app.get("/api/v2/health", ctx -> ctx.status(204));
        app.get("/api/v2/templates", w.templateCtrl::list);
        app.post("/api/v2/templates", w.templateCtrl::create);
        app.get("/api/v2/templates/{id}", w.templateCtrl::get);
        app.put("/api/v2/templates/{id}", w.templateCtrl::put);
        app.delete("/api/v2/templates/{id}", w.templateCtrl::delete);
        app.post("/api/v2/templates/{id}/duplicate", w.templateCtrl::duplicate);
        app.put("/api/v2/templates/{id}/visibility", w.templateCtrl::updateVisibility);
        app.post("/api/v2/templates/{id}/copy", w.templateCtrl::copy);
        app.post("/api/v2/templates/{id}/evaluate", w.evalCtrl::evaluate);
        app.post("/api/v2/templates/{id}/validate", w.evalCtrl::validate);
        app.get("/api/v2/templates/{id}/versions", w.versionCtrl::list);
        app.post("/api/v2/templates/{id}/versions", w.versionCtrl::create);
        app.post("/api/v2/templates/{id}/versions/{vid}/restore", w.versionCtrl::restore);

        // V2 form responses
        app.post("/api/v2/templates/{id}/responses", w.formResponseCtrl::submit);
        app.get("/api/v2/templates/{id}/responses", w.formResponseCtrl::list);
        app.get("/api/v2/templates/{id}/responses/export", w.responseExportCtrl::export);
        app.get("/api/v2/templates/{id}/responses/{rid}", w.formResponseCtrl::get);
        app.delete("/api/v2/templates/{id}/responses/{rid}", w.formResponseCtrl::delete);
        app.patch("/api/v2/templates/{id}/responses/{rid}/status", w.formResponseCtrl::updateStatus);
        app.get("/api/v2/templates/{id}/responses/{rid}/pdf", w.responsePdfCtrl::generatePdf);

        // V2 template export/import/thumbnail
        app.get("/api/v2/templates/{id}/export", w.exportCtrl::export);
        app.post("/api/v2/templates/import", w.exportCtrl::importTemplate);
        app.get("/api/v2/templates/{id}/thumbnail", w.thumbnailCtrl::get);

        // V2 template PDF generation
        app.post("/api/v2/templates/{id}/pdf", w.pdfCtrl::generate);

        // V2 schema inference
        app.post("/api/v2/schemas/infer", w.schemaInferCtrl::infer);

        // V2 stateless PDF generation
        app.post("/api/v2/pdf/generate", w.statelessPdfCtrl::generate);

        // V2 stateless XLSX generation (issue #118)
        app.post("/api/v2/excel/generate", w.statelessExcelCtrl::generate);

        // V2 async PDF jobs
        app.post("/api/v2/pdf-jobs", w.pdfJobCtrl::submit);
        app.get("/api/v2/pdf-jobs/{jobId}", w.pdfJobCtrl::getStatus);
        app.get("/api/v2/pdf-jobs/{jobId}/result", w.pdfJobCtrl::getResult);

        // V2 ScalarDB catalog (namespaces → tables → columns) for schema binding UI
        app.get("/api/v2/scalardb/catalog", w.scalarDbCatalogCtrl::getCatalog);
        // V2 ScalarDB table creation (Phase 1.5)
        app.post("/api/v2/scalardb/tables", w.scalarDbTableCtrl::createTable);
        // Phase 2: resolve actual ScalarDB row data for live preview
        app.post("/api/v2/templates/{id}/resolve-bindings", w.bindingResolveCtrl::resolve);

        // Tenant info — shared organization settings
        app.get("/api/v2/tenant", w.tenantCtrl::get);
        app.put("/api/v2/tenant", w.tenantCtrl::put);

        // Data Browser — ScalarDB full-table scan (read-only, authenticated users)
        app.get("/api/v2/scalardb/tables/{ns}/{table}/rows", w.scalarDbScanCtrl::scanRows);

        // Data Browser — ScalarDB row CRUD (authenticated users, system namespaces protected)
        app.post("/api/v2/scalardb/tables/{ns}/{table}/rows", w.scalarDbRowCtrl::insertRow);
        app.put("/api/v2/scalardb/tables/{ns}/{table}/rows", w.scalarDbRowCtrl::updateRow);
        app.delete("/api/v2/scalardb/tables/{ns}/{table}/rows", w.scalarDbRowCtrl::deleteRow);

        // Webhooks
        app.get("/api/v1/webhooks/{templateId}", w.webhookCtrl::getConfig);
        app.put("/api/v1/webhooks/{templateId}", w.webhookCtrl::putConfig);
        app.post("/api/v1/webhooks/{templateId}/test", w.webhookCtrl::testWebhook);

        // Document auto-numbering sequences
        app.get("/api/v1/sequences/{templateId}", w.sequenceCtrl::getConfig);
        app.put("/api/v1/sequences/{templateId}", w.sequenceCtrl::putConfig);

        // Batch PDF generation
        app.post("/api/v2/pdf-jobs/batch", w.batchPdfCtrl::submitBatch);
        app.get("/api/v2/pdf-jobs/batch/{id}", w.batchPdfCtrl::getStatus);
        app.get("/api/v2/pdf-jobs/batch/{id}/result", w.batchPdfCtrl::getResult);

        // Product Master — tenant-wide product catalog
        app.get("/api/v1/products", w.productCtrl::list);
        app.get("/api/v1/products/fields", w.productCtrl::getFields);
        app.get("/api/v1/products/{id}", w.productCtrl::get);
        app.post("/api/v1/products", w.productCtrl::create);
        app.put("/api/v1/products/fields", w.productCtrl::putFields);
        app.put("/api/v1/products/{id}", w.productCtrl::update);
        app.delete("/api/v1/products/{id}", w.productCtrl::softDelete);
        app.post("/api/v1/products/import", w.productCtrl::importCsv);
    }

    // -----------------------------------------------------------------------
    // Schemas — unified schema CRUD (was schema-library)
    // -----------------------------------------------------------------------

    private static void registerV2SchemaRoutes(Javalin app, AppWiring w) {
        // New canonical paths
        app.get("/api/v2/schemas",          w.schemaLibraryCtrl::list);
        app.post("/api/v2/schemas",         w.schemaLibraryCtrl::create);
        app.get("/api/v2/schemas/{id}",     w.schemaLibraryCtrl::get);
        app.put("/api/v2/schemas/{id}",     w.schemaLibraryCtrl::put);
        app.delete("/api/v2/schemas/{id}",  w.schemaLibraryCtrl::delete);

        // Backward-compat redirects for old /api/v2/schema-library paths
        app.get("/api/v2/schema-library",      ctx -> ctx.redirect("/api/v2/schemas", HttpStatus.MOVED_PERMANENTLY));
        app.get("/api/v2/schema-library/{id}", ctx -> ctx.redirect("/api/v2/schemas/" + ctx.pathParam("id"), HttpStatus.MOVED_PERMANENTLY));
    }
}

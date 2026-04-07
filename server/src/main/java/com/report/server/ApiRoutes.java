package com.report.server;

import io.javalin.Javalin;
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
        registerTemplateRoutes(app, w);
        registerProjectionRoutes(app, w);
        registerVersionRoutes(app, w);
        registerSchemaRoutes(app, w);
        registerBindingTreeRoutes(app, w);
        registerPublicFormRoutes(app, w);
        registerResponseRoutes(app, w);
        registerJobRoutes(app, w);
        registerPdfRoute(app, w);
        registerV2Routes(app, w);
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
                        && !origin.equals("http://localhost:5173")
                        && !origin.equals("http://localhost:" + SERVER_PORT)
                        && (ALLOWED_ORIGIN == null || !origin.equals(ALLOWED_ORIGIN))) {
                    throw new io.javalin.http.ForbiddenResponse("Cross-origin request rejected");
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
    }

    // ── Route groups ───────────────────────────────────────────────────────────

    private static void registerAuthRoutes(Javalin app, AppWiring w) {
        app.get("/api/v1/health", ctx -> ctx.json(Map.of("status", "ok")));
        app.get("/api/v1/auth/me", w.authCtrl::me);
        app.post("/api/v1/auth/login", w.authCtrl::login);
        app.post("/api/v1/auth/logout", w.authCtrl::logout);
    }

    private static void registerTemplateRoutes(Javalin app, AppWiring w) {
        app.get("/api/v1/templates", w.templateCtrl::list);
        app.post("/api/v1/templates", w.templateCtrl::create);
        app.patch("/api/v1/templates/{id}", w.templateCtrl::patch);
        app.delete("/api/v1/templates/{id}", w.templateCtrl::delete);

        app.get("/api/v1/templates/{id}/export", w.exportCtrl::export);
        app.post("/api/v1/templates/import", w.exportCtrl::importTemplate);
        app.post("/api/v1/templates/{id}/duplicate", w.exportCtrl::duplicate);
        app.post("/api/v1/templates/{id}/export-submission", w.submissionExportCtrl::export);

        // Thumbnail (on-the-fly with ETag caching)
        app.get("/api/v1/templates/{id}/thumbnail", w.thumbnailCtrl::get);
    }

    private static void registerProjectionRoutes(Javalin app, AppWiring w) {
        app.get("/api/v1/templates/{id}/designer-projection", w.projCtrl::get);
        app.put("/api/v1/templates/{id}/designer-projection", w.projCtrl::put);
    }

    private static void registerVersionRoutes(Javalin app, AppWiring w) {
        app.get("/api/v1/templates/{id}/versions", w.versionCtrl::list);
        app.post("/api/v1/templates/{id}/versions", w.versionCtrl::create);
        app.get("/api/v1/templates/{id}/versions/{vid}", w.versionCtrl::get);
        app.patch("/api/v1/templates/{id}/versions/{vid}", w.versionCtrl::updateLabel);
        app.delete("/api/v1/templates/{id}/versions/{vid}", w.versionCtrl::delete);
        app.post("/api/v1/templates/{id}/versions/{vid}/restore", w.versionCtrl::restore);
    }

    private static void registerSchemaRoutes(Javalin app, AppWiring w) {
        app.get("/api/v1/schemas/{id}", w.schemaCtrl::get);
        app.put("/api/v1/schemas/{id}", w.schemaCtrl::put);
        app.post("/api/v1/schemas", w.schemaCreateCtrl::create);
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

    private static void registerResponseRoutes(Javalin app, AppWiring w) {
        app.post("/api/v1/templates/{id}/responses", w.responseCtrl::submit);
        app.get("/api/v1/templates/{id}/responses", w.responseCtrl::list);
        app.get("/api/v1/templates/{id}/responses/export", w.responseCtrl::export);
        app.get("/api/v1/responses/{id}", w.responseCtrl::get);
        app.delete("/api/v1/responses/{id}", w.responseCtrl::delete);
    }

    private static void registerJobRoutes(Javalin app, AppWiring w) {
        app.post("/api/v1/jobs", w.jobCtrl::submit);
        app.get("/api/v1/jobs", w.jobCtrl::list);
        app.get("/api/v1/jobs/{id}", w.jobCtrl::status);
        app.get("/api/v1/jobs/{id}/output", w.jobCtrl::download);
        app.delete("/api/v1/jobs/{id}", w.jobCtrl::cancel);
    }

    private static void registerPdfRoute(Javalin app, AppWiring w) {
        app.post("/api/v1/templates/{id}/pdf", w.pdfCtrl::generate);
    }

    // ── V2 routes ─────────────────────────────────────────────────────────────

    private static void registerV2Routes(Javalin app, AppWiring w) {
        app.get("/api/v2/health", ctx -> ctx.status(204));
        app.get("/api/v2/templates", w.v2TemplateCtrl::list);
        app.post("/api/v2/templates", w.v2TemplateCtrl::create);
        app.get("/api/v2/templates/{id}", w.v2TemplateCtrl::get);
        app.put("/api/v2/templates/{id}", w.v2TemplateCtrl::put);
        app.delete("/api/v2/templates/{id}", w.v2TemplateCtrl::delete);
        app.post("/api/v2/templates/{id}/evaluate", w.v2EvalCtrl::evaluate);
        app.post("/api/v2/templates/{id}/validate", w.v2EvalCtrl::validate);
        app.get("/api/v2/templates/{id}/versions", w.v2VersionCtrl::list);
        app.post("/api/v2/templates/{id}/versions", w.v2VersionCtrl::create);
        app.post("/api/v2/templates/{id}/versions/{vid}/restore", w.v2VersionCtrl::restore);
    }
}

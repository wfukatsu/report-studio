package com.report.server;

import at.favre.lib.crypto.bcrypt.BCrypt;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.report.server.auth.FormSessionManager;
import com.report.server.auth.RateLimiter;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Public form endpoints — no admin auth required. Password-protected forms use bcrypt verification
 * + session cookies.
 */
public final class PublicFormController {

    private static final Logger log = LoggerFactory.getLogger(PublicFormController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String FORM_SESSION_COOKIE = "form_session";

    private final TemplateListRepository templateList;
    private final ProjectionRepository projRepo;
    private final JsonBlobRepository responseRepo;
    private final FormSessionManager sessionManager;
    private final RateLimiter rateLimiter;

    public PublicFormController(
            TemplateListRepository templateList,
            ProjectionRepository projRepo,
            JsonBlobRepository responseRepo,
            FormSessionManager sessionManager,
            RateLimiter rateLimiter) {
        this.templateList = templateList;
        this.projRepo = projRepo;
        this.responseRepo = responseRepo;
        this.sessionManager = sessionManager;
        this.rateLimiter = rateLimiter;
    }

    /**
     * GET /api/v1/public/forms/{id} Returns form info (published status, whether password is
     * required). Returns 404 for both not-found and not-published (enumeration protection).
     */
    public void getFormInfo(Context ctx) {
        String templateId = validateTemplateId(ctx);
        if (templateId == null) return;

        var metaOpt = templateList.findById(templateId);
        if (metaOpt.isEmpty() || !isPublished(metaOpt.get())) {
            notFound(ctx);
            return;
        }

        var meta = metaOpt.get();
        var settings =
                meta.formSettings() != null
                        ? meta.formSettings()
                        : TemplateListRepository.FormSettings.DEFAULT;

        ctx.json(
                Map.of(
                        "templateId",
                        meta.id(),
                        "name",
                        meta.name(),
                        "published",
                        true,
                        "passwordRequired",
                        settings.passwordHash() != null && !settings.passwordHash().isBlank(),
                        "defaultMode",
                        settings.defaultMode() != null ? settings.defaultMode() : "standard"));
    }

    /**
     * POST /api/v1/public/forms/{id}/verify Rate-limited bcrypt password verification. Sets
     * form_session cookie on success.
     */
    public void verifyPassword(Context ctx) {
        String templateId = validateTemplateId(ctx);
        if (templateId == null) return;

        // Rate limit by IP + templateId
        String clientKey = ctx.ip() + ":" + templateId;
        if (!rateLimiter.isAllowed(clientKey)) {
            ctx.status(HttpStatus.TOO_MANY_REQUESTS);
            ctx.json(Map.of("error", "Too many attempts. Please try again later."));
            return;
        }

        var metaOpt = templateList.findById(templateId);
        if (metaOpt.isEmpty() || !isPublished(metaOpt.get())) {
            notFound(ctx);
            return;
        }

        var meta = metaOpt.get();
        var settings = meta.formSettings();
        if (settings == null
                || settings.passwordHash() == null
                || settings.passwordHash().isBlank()) {
            // No password required — just grant access
            String token = sessionManager.createSession(templateId);
            setSessionCookie(ctx, token);
            ctx.json(Map.of("status", "ok"));
            return;
        }

        // Extract password from request body
        var body = ctx.bodyAsClass(Map.class);
        Object rawPassword = body.get("password");
        if (!(rawPassword instanceof String password) || password.isBlank()) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Password is required"));
            return;
        }

        // bcrypt verify
        BCrypt.Result result =
                BCrypt.verifyer().verify(password.toCharArray(), settings.passwordHash());
        if (!result.verified) {
            ctx.status(HttpStatus.UNAUTHORIZED);
            ctx.json(Map.of("error", "Invalid password"));
            log.info("Failed form password attempt for template {} from {}", templateId, ctx.ip());
            return;
        }

        String token = sessionManager.createSession(templateId);
        setSessionCookie(ctx, token);
        ctx.json(Map.of("status", "ok"));
        log.info("Form password verified for template {} from {}", templateId, ctx.ip());
    }

    /**
     * GET /api/v1/public/forms/{id}/projection Returns the projection for a published form.
     * Requires valid session if password-protected.
     */
    public void getProjection(Context ctx) {
        String templateId = validateTemplateId(ctx);
        if (templateId == null) return;

        var metaOpt = templateList.findById(templateId);
        if (metaOpt.isEmpty() || !isPublished(metaOpt.get())) {
            notFound(ctx);
            return;
        }

        // Check session if password-protected
        var meta = metaOpt.get();
        if (requiresPassword(meta) && !hasValidSession(ctx, templateId)) {
            ctx.status(HttpStatus.UNAUTHORIZED);
            ctx.json(Map.of("error", "Authentication required"));
            return;
        }

        var projOpt = projRepo.getProjection(templateId);
        if (projOpt.isEmpty()) {
            notFound(ctx);
            return;
        }

        // Strip schemaGroups from public projection to prevent field structure leakage
        String projection = projOpt.get();
        try {
            var node = MAPPER.readTree(projection);
            if (node.isObject() && node.has("schemaGroups")) {
                ((com.fasterxml.jackson.databind.node.ObjectNode) node).remove("schemaGroups");
                projection = node.toString();
            }
        } catch (Exception e) {
            log.warn("Failed to strip schemaGroups from projection: {}", e.getMessage());
        }

        ctx.contentType("application/json");
        ctx.result(projection);
    }

    /**
     * POST /api/v1/public/forms/{id}/submit Saves a form response for a published form. Requires
     * valid session if password-protected.
     */
    public void submitResponse(Context ctx) {
        String templateId = validateTemplateId(ctx);
        if (templateId == null) return;

        var metaOpt = templateList.findById(templateId);
        if (metaOpt.isEmpty() || !isPublished(metaOpt.get())) {
            notFound(ctx);
            return;
        }

        var meta = metaOpt.get();
        if (requiresPassword(meta) && !hasValidSession(ctx, templateId)) {
            ctx.status(HttpStatus.UNAUTHORIZED);
            ctx.json(Map.of("error", "Authentication required"));
            return;
        }

        String body = ctx.body();
        var dataNode = RequestValidator.validateResponseBody(ctx, body);
        if (dataNode == null) return;

        try {
            String responseId = "resp-" + UUID.randomUUID();
            long now = System.currentTimeMillis();

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("id", responseId);
            response.put("templateId", templateId);
            response.put("data", dataNode);
            response.put("submittedAt", now);

            responseRepo.put(responseId, MAPPER.writeValueAsString(response), templateId);

            ctx.status(HttpStatus.CREATED);
            ctx.json(Map.of("id", responseId, "templateId", templateId, "submittedAt", now));
            log.info("Public form response {} for template {}", responseId, templateId);
        } catch (Exception e) {
            log.error("Failed to save public form response for template {}", templateId, e);
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Failed to save response"));
        }
    }

    // ── Helpers ────────────────────────────────────────────

    private static String validateTemplateId(Context ctx) {
        return RequestValidator.validateId(ctx);
    }

    private static boolean isPublished(TemplateListRepository.TemplateMeta meta) {
        return meta.formSettings() != null && meta.formSettings().published();
    }

    private static boolean requiresPassword(TemplateListRepository.TemplateMeta meta) {
        return meta.formSettings() != null
                && meta.formSettings().passwordHash() != null
                && !meta.formSettings().passwordHash().isBlank();
    }

    private boolean hasValidSession(Context ctx, String templateId) {
        String token = ctx.cookie(FORM_SESSION_COOKIE);
        if (token == null) return false;
        String sessionTemplateId = sessionManager.validateSession(token);
        return templateId.equals(sessionTemplateId);
    }

    private static void setSessionCookie(Context ctx, String token) {
        var cookie = new io.javalin.http.Cookie(FORM_SESSION_COOKIE, token);
        cookie.setMaxAge(3600); // 1h
        cookie.setHttpOnly(true);
        cookie.setSecure(AppConfig.secureCookies());
        cookie.setSameSite(io.javalin.http.SameSite.LAX);
        cookie.setPath("/");
        ctx.cookie(cookie);
    }

    private static void notFound(Context ctx) {
        ctx.status(HttpStatus.NOT_FOUND);
        ctx.json(Map.of("error", "Form not found"));
    }
}

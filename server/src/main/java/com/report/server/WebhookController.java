package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.Principal;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Webhook configuration endpoints per template.
 *
 * <ul>
 *   <li>GET /api/v1/webhooks/{templateId} — get config (secret masked)
 *   <li>PUT /api/v1/webhooks/{templateId} — update config
 *   <li>POST /api/v1/webhooks/{templateId}/test — send test payload
 * </ul>
 */
public final class WebhookController {

    private static final Logger log = LoggerFactory.getLogger(WebhookController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final JsonBlobRepository webhookRepo;
    private final JsonBlobRepository definitionsRepo;
    private final WebhookDispatcher dispatcher;
    private final SecretCrypto crypto;

    public WebhookController(
            JsonBlobRepository webhookRepo,
            JsonBlobRepository definitionsRepo,
            WebhookDispatcher dispatcher,
            SecretCrypto crypto) {
        this.webhookRepo = webhookRepo;
        this.definitionsRepo = definitionsRepo;
        this.dispatcher = dispatcher;
        this.crypto = crypto;
    }

    /**
     * Reject access to a webhook config whose template the caller does not own (issue #198).
     * Returns true and sends a 404 when access is denied — callers must {@code return} on true.
     */
    private boolean denyIfNotOwner(Context ctx, String templateId) {
        if (TemplateController.ownsTemplate(ctx, definitionsRepo, templateId)) return false;
        ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Template not found");
        return true;
    }

    // ── GET /api/v1/webhooks/{templateId} ────────────────────────────────────

    public void getConfig(Context ctx) throws Exception {
        String templateId = RequestValidator.validateId(ctx, "templateId");
        if (templateId == null) return;
        if (denyIfNotOwner(ctx, templateId)) return;

        Optional<String> stored = webhookRepo.get(templateId);
        if (stored.isEmpty()) {
            ctx.json(Map.of("configured", false));
            return;
        }
        ObjectNode config = (ObjectNode) MAPPER.readTree(stored.get());
        // Mask secret
        if (config.has("secret") && !config.path("secret").isNull()) {
            config.put("secret", "****");
        }
        ctx.contentType("application/json");
        ctx.result(MAPPER.writeValueAsString(config));
    }

    // ── PUT /api/v1/webhooks/{templateId} ────────────────────────────────────

    public void putConfig(Context ctx) throws Exception {
        if (!requireAuth(ctx)) return;
        String templateId = RequestValidator.validateId(ctx, "templateId");
        if (templateId == null) return;
        if (denyIfNotOwner(ctx, templateId)) return;

        JsonNode req;
        try {
            req = MAPPER.readTree(ctx.body());
        } catch (Exception e) {
            ApiError.respond(ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Invalid JSON");
            return;
        }

        String url = req.path("url").asText(null);
        if (url != null && !url.isBlank()) {
            // Validate SSRF before saving
            try {
                WebhookDispatcher.validateUrl(url);
            } catch (IllegalArgumentException e) {
                ApiError.respond(ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", e.getMessage());
                return;
            }
        }

        // Build config — preserve existing secret if not provided in request
        Optional<String> stored = webhookRepo.get(templateId);
        ObjectNode config =
                stored.isPresent()
                        ? (ObjectNode) MAPPER.readTree(stored.get())
                        : MAPPER.createObjectNode();

        if (url != null) config.put("url", url.isBlank() ? null : url);
        if (req.has("secret")) {
            String secret = req.path("secret").asText(null);
            if (secret != null && !secret.equals("****")) {
                config.put("secret", secret);
            }
        }

        // Encrypt secret at rest (AES-256-GCM). Lazy migration: a plaintext secret
        // preserved from an earlier version is encrypted on this save once
        // WEBHOOK_SECRET_KEY is configured.
        String storedSecret = config.hasNonNull("secret") ? config.path("secret").asText() : null;
        if (storedSecret != null) {
            if (crypto.isEnabled()) {
                if (!SecretCrypto.isEncrypted(storedSecret)) {
                    config.put("secret", crypto.encrypt(storedSecret));
                }
            } else {
                log.warn(
                        "Storing webhook secret in PLAINTEXT for template {} — set {} "
                                + "(Base64-encoded 32 bytes) before running in production.",
                        templateId,
                        SecretCrypto.ENV_KEY);
            }
        }

        webhookRepo.put(templateId, MAPPER.writeValueAsString(config));
        // Return masked config
        ObjectNode masked = config.deepCopy();
        if (masked.has("secret") && !masked.path("secret").isNull()) masked.put("secret", "****");
        ctx.contentType("application/json");
        ctx.result(MAPPER.writeValueAsString(masked));
    }

    // ── POST /api/v1/webhooks/{templateId}/test ──────────────────────────────

    public void testWebhook(Context ctx) throws Exception {
        if (!requireAuth(ctx)) return;
        String templateId = RequestValidator.validateId(ctx, "templateId");
        if (templateId == null) return;
        if (denyIfNotOwner(ctx, templateId)) return;

        Optional<String> stored = webhookRepo.get(templateId);
        if (stored.isEmpty()) {
            ApiError.respond(ctx, HttpStatus.NOT_FOUND, "NOT_FOUND", "Webhook not configured");
            return;
        }

        JsonNode config = MAPPER.readTree(stored.get());
        String url = config.path("url").asText(null);
        if (url == null || url.isBlank()) {
            ApiError.respond(
                    ctx, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "No webhook URL configured");
            return;
        }
        String secret = crypto.decrypt(config.path("secret").asText(null));

        // Build test payload
        ObjectNode payload = MAPPER.createObjectNode();
        payload.put("event", "test");
        payload.put("templateId", templateId);
        payload.put("message", "This is a test webhook from Report Design Studio");
        payload.put("timestamp", Instant.now().toString());

        dispatcher.dispatch(url, secret, MAPPER.writeValueAsString(payload));
        ctx.json(Map.of("delivered", true, "url", url));
        log.info("Test webhook sent to {} for template {}", url, templateId);
    }

    // ── Package-private: dispatch for form response submission ────────────────

    /**
     * Dispatch webhook asynchronously for a form response. Called from FormResponseController. Does
     * NOT block — dispatch happens in the provided executor.
     */
    public void dispatchAsync(
            String templateId,
            String responseId,
            String responseJson,
            java.util.concurrent.ExecutorService executor) {
        executor.execute(
                () -> {
                    try {
                        Optional<String> stored = webhookRepo.get(templateId);
                        if (stored.isEmpty()) return;
                        JsonNode config = MAPPER.readTree(stored.get());
                        String url = config.path("url").asText(null);
                        if (url == null || url.isBlank()) return;
                        String secret = crypto.decrypt(config.path("secret").asText(null));

                        JsonNode resp = MAPPER.readTree(responseJson);
                        ObjectNode payload = MAPPER.createObjectNode();
                        payload.put("event", "form_response.received");
                        payload.put("timestamp", String.valueOf(System.currentTimeMillis() / 1000));
                        payload.put("templateId", templateId);
                        payload.put("responseId", responseId);
                        payload.put("submittedAt", resp.path("submittedAt").asText(""));
                        payload.put("submittedBy", resp.path("submittedBy").asText(""));
                        // summary
                        payload.set("data", resp.path("data"));

                        dispatcher.dispatch(url, secret, MAPPER.writeValueAsString(payload));
                    } catch (Exception e) {
                        // Never propagate — form response is already saved
                        log.warn(
                                "Webhook dispatch failed for template={} response={}: {}",
                                templateId,
                                responseId,
                                e.getMessage());
                    }
                });
    }

    private boolean requireAuth(Context ctx) {
        Principal principal = ctx.attribute("principal");
        if (principal == null || principal.isAnonymous()) {
            ApiError.respond(
                    ctx, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Authentication required");
            return false;
        }
        return true;
    }
}

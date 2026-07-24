package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Asynchronous webhook dispatch for form-response submissions — the HTTP-independent half of the
 * webhook feature (#419, extracted from {@code WebhookController}).
 *
 * <p>Dispatch is fire-and-forget on the injected executor: failures are logged and never propagate
 * to the caller, because the form response is already saved by the time a webhook fires. {@code
 * WebhookController} keeps the config CRUD + test endpoints; the submit flow ({@code
 * FormResponseController}) receives this service via constructor injection.
 */
public final class WebhookDispatchService {

    private static final Logger log = LoggerFactory.getLogger(WebhookDispatchService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final JsonBlobRepository webhookRepo;
    private final WebhookDispatcher dispatcher;
    private final SecretCrypto crypto;
    private final ExecutorService executor;

    public WebhookDispatchService(
            JsonBlobRepository webhookRepo,
            WebhookDispatcher dispatcher,
            SecretCrypto crypto,
            ExecutorService executor) {
        this.webhookRepo = webhookRepo;
        this.dispatcher = dispatcher;
        this.crypto = crypto;
        this.executor = executor;
    }

    /**
     * Dispatch the {@code form_response.received} webhook asynchronously for a form response. Does
     * NOT block — dispatch happens on the injected executor.
     */
    public void dispatchAsync(String templateId, String responseId, String responseJson) {
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
}

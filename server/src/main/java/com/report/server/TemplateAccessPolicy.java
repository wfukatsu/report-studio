package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.report.server.auth.Principal;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Template envelope access checks for response endpoints: envelope loading, ownership resolution,
 * and display names. Extracted from FormResponseController (#276) — no behavior change (logs keep
 * the FormResponseController category).
 */
final class TemplateAccessPolicy {

    private static final Logger log = LoggerFactory.getLogger(FormResponseController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final JsonBlobRepository definitionsRepo;

    TemplateAccessPolicy(JsonBlobRepository definitionsRepo) {
        this.definitionsRepo = definitionsRepo;
    }

    /** Load the template definition envelope JSON. Returns empty if not found or malformed. */
    Optional<JsonNode> loadDefinitionEnvelope(String templateId) {
        Optional<String> blob = definitionsRepo.get(templateId);
        if (blob.isEmpty()) return Optional.empty();
        try {
            return Optional.of(MAPPER.readTree(blob.get()));
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    /**
     * Check if the principal can access the template. If {@code created_by} is present, only the
     * owner can access. If absent (legacy templates without owner), access is allowed with a
     * warning log.
     */
    boolean canAccess(Principal principal, JsonNode envelope) {
        String createdBy = envelope.path("created_by").asText("");
        if (createdBy.isEmpty()) {
            log.warn(
                    "Template {} has no createdBy — allowing access without ownership check",
                    envelope.path("id").asText("?"));
            return true;
        }
        return principal.userId().equals(createdBy);
    }

    /** Get the template owner userId, or empty string if not set. */
    String getTemplateOwner(String templateId) {
        return loadDefinitionEnvelope(templateId)
                .map(env -> env.path("created_by").asText(""))
                .orElse("");
    }

    /** Best-effort human-readable template name from the stored envelope. */
    static String templateDisplayName(JsonNode env, String fallbackId) {
        String name = env.path("name").asText("");
        if (name.isEmpty()) name = env.path("definition").path("name").asText("");
        if (name.isEmpty()) name = env.path("report").path("name").asText("");
        return name.isEmpty() ? fallbackId : name;
    }
}

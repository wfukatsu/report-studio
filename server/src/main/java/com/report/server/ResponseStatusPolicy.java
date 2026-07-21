package com.report.server;

import java.util.Map;
import java.util.Set;

/**
 * Document lifecycle status policy (#163/#205): valid statuses and allowed transitions. Extracted
 * from FormResponseController (#276) — no behavior change.
 */
final class ResponseStatusPolicy {

    /** Document lifecycle statuses (#163). draft → issued → sent, or void at any point. */
    static final String DEFAULT_STATUS = "issued";

    static final Set<String> VALID_STATUSES = Set.of("draft", "issued", "sent", "void");

    /**
     * Allowed document-lifecycle transitions (#205). A status may advance draft → issued → sent,
     * and any non-terminal status may be voided; {@code void} is terminal. Any other transition
     * (e.g. void → issued, sent → draft) is rejected with 409 so a status machine cannot be driven
     * backwards or resurrected. A same-status "transition" is treated as an idempotent no-op, not
     * an error.
     */
    private static final Map<String, Set<String>> ALLOWED_TRANSITIONS =
            Map.of(
                    "draft", Set.of("issued", "void"),
                    "issued", Set.of("sent", "void"),
                    "sent", Set.of("void"),
                    "void", Set.of());

    private ResponseStatusPolicy() {}

    static boolean isValidTransition(String from, String to) {
        if (from == null || from.equals(to)) return true; // no-op / first assignment
        return ALLOWED_TRANSITIONS.getOrDefault(from, Set.of()).contains(to);
    }
}

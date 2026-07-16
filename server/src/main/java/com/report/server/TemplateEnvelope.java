package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Canonical template envelope handling (docs/template-envelope-spec.md).
 *
 * <p>The interchange format for a ReportDefinition is the versioned envelope
 * {@code {formatVersion: 2, definition: {...}}}. This class unwraps incoming
 * bodies, walking the migration ladder for older formats:
 * <ul>
 *   <li>v2 — {@code {formatVersion: 2, definition}} (canonical)</li>
 *   <li>v1 — bare definition marked with {@code $schema: "report-definition/v1"}</li>
 *   <li>bare definition without any marker — accepted by {@link #unwrap} as a
 *       deprecated transport form (treated as the current version), rejected by
 *       {@link #unwrapStrict}</li>
 * </ul>
 * Versions newer than {@link #CURRENT_FORMAT_VERSION} are always rejected —
 * forward compatibility is not attempted. The legacy v0 {@code Report} format
 * is only migratable client-side (see src/lib/migration.ts).
 */
public final class TemplateEnvelope {

    /** Current envelope format version (monotonically increasing integer). */
    public static final int CURRENT_FORMAT_VERSION = 2;

    /** Legacy v1 marker value carried in the {@code $schema} field. */
    public static final String V1_SCHEMA_MARKER = "report-definition/v1";

    /** Result of unwrapping: exactly one of {@code definition} / {@code error} is non-null. */
    public record Unwrapped(ObjectNode definition, String error) {
        static Unwrapped ok(ObjectNode definition) { return new Unwrapped(definition, null); }
        static Unwrapped fail(String error) { return new Unwrapped(null, error); }
        public boolean isError() { return error != null; }
    }

    private TemplateEnvelope() {}

    /**
     * Unwrap a request body into a definition, accepting the canonical v2
     * envelope, the v1 {@code $schema} marker form, and (deprecated) a bare
     * definition without markers.
     */
    public static Unwrapped unwrap(JsonNode root) {
        return unwrap(root, false);
    }

    /**
     * Like {@link #unwrap} but rejects bodies without an explicit version
     * marker. Used at the file-import boundary where an envelope is required.
     */
    public static Unwrapped unwrapStrict(JsonNode root) {
        return unwrap(root, true);
    }

    private static Unwrapped unwrap(JsonNode root, boolean requireEnvelope) {
        if (root == null || !root.isObject()) {
            return Unwrapped.fail("Body must be a JSON object");
        }

        JsonNode fv = root.get("formatVersion");
        if (fv != null && !fv.isNull()) {
            if (!fv.isIntegralNumber()) {
                return Unwrapped.fail("formatVersion must be an integer");
            }
            int version = fv.asInt();
            if (version > CURRENT_FORMAT_VERSION) {
                return Unwrapped.fail("Unsupported format version: " + version
                        + " (expected " + CURRENT_FORMAT_VERSION + ")");
            }
            if (version == CURRENT_FORMAT_VERSION) {
                JsonNode def = root.get("definition");
                if (def == null || !def.isObject()) {
                    return Unwrapped.fail("Missing 'definition' field");
                }
                return Unwrapped.ok(def.deepCopy());
            }
            // v1 as an integer envelope never shipped, but migrate it the same
            // way as the $schema marker form for robustness.
            if (version == 1) {
                ObjectNode def = root.deepCopy();
                def.remove("formatVersion");
                def.remove("$schema");
                return Unwrapped.ok(def);
            }
            return Unwrapped.fail("Unsupported format version: " + version
                    + " (expected " + CURRENT_FORMAT_VERSION + ")");
        }

        JsonNode schema = root.get("$schema");
        if (schema != null && schema.isTextual() && !schema.asText().isEmpty()) {
            if (!V1_SCHEMA_MARKER.equals(schema.asText())) {
                return Unwrapped.fail("Unsupported schema: " + schema.asText());
            }
            // v1 → v2: strip the marker, the rest is the definition
            ObjectNode def = root.deepCopy();
            def.remove("$schema");
            return Unwrapped.ok(def);
        }

        if (requireEnvelope) {
            return Unwrapped.fail("Unsupported format version: 0 (expected "
                    + CURRENT_FORMAT_VERSION + ")");
        }
        // Bare definition (deprecated transport form) — treat as current version
        return Unwrapped.ok(root.deepCopy());
    }
}

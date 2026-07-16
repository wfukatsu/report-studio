package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.InputStream;
import java.util.Optional;

/**
 * Server-side structural validation for a saved ReportDefinition (issue #52).
 *
 * <p>The frontend Zod schema enforces structural bounds (max pages/sections/
 * elements) but the server previously stored any JSON unchecked, so the limits
 * did not hold for direct API callers. This validator re-applies the same
 * bounds and basic shape checks at the save boundary. It is intentionally
 * lenient about per-element-type fields (those fail gracefully at render time)
 * — the goal is to reject documents that are structurally abusive or malformed,
 * not to fully mirror the type union.
 *
 * <p>Limits are loaded from {@code report-definition-limits.json} — the single
 * source at {@code schemas/report-definition-limits.json}, bundled into
 * resources by the {@code processResources} task and shared with the frontend
 * Zod schema (src/lib/schemas/limits.ts).
 */
public final class ReportDefinitionValidator {

    private static final Logger log = LoggerFactory.getLogger(ReportDefinitionValidator.class);
    private static final String LIMITS_RESOURCE = "/report-definition-limits.json";

    static final int MAX_PAGES;
    static final int MAX_SECTIONS_PER_PAGE;
    static final int MAX_ELEMENTS_PER_SECTION;
    static final int MAX_CALCULATION_RULES;
    static final int MAX_VALIDATION_RULES;
    static final int MAX_OUTPUT_VARIANTS;
    static final int MAX_TEMPLATE_VARIABLES;
    static final int MAX_DATA_SOURCES;
    static final int MAX_SUBMISSION_MODELS;

    static {
        JsonNode limits = loadLimits();
        MAX_PAGES = intLimit(limits, "maxPages", 50);
        MAX_SECTIONS_PER_PAGE = intLimit(limits, "maxSectionsPerPage", 20);
        MAX_ELEMENTS_PER_SECTION = intLimit(limits, "maxElementsPerSection", 500);
        MAX_CALCULATION_RULES = intLimit(limits, "maxCalculationRules", 50);
        MAX_VALIDATION_RULES = intLimit(limits, "maxValidationRules", 200);
        MAX_OUTPUT_VARIANTS = intLimit(limits, "maxOutputVariants", 50);
        MAX_TEMPLATE_VARIABLES = intLimit(limits, "maxTemplateVariables", 100);
        MAX_DATA_SOURCES = intLimit(limits, "maxDataSources", 50);
        MAX_SUBMISSION_MODELS = intLimit(limits, "maxSubmissionModels", 50);
    }

    private static JsonNode loadLimits() {
        try (InputStream in = ReportDefinitionValidator.class.getResourceAsStream(LIMITS_RESOURCE)) {
            if (in == null) {
                log.warn("Limits resource {} not found — falling back to built-in defaults", LIMITS_RESOURCE);
                return null;
            }
            return new ObjectMapper().readTree(in);
        } catch (Exception e) {
            log.warn("Failed to read limits resource {} — falling back to built-in defaults", LIMITS_RESOURCE, e);
            return null;
        }
    }

    private static int intLimit(JsonNode limits, String key, int fallback) {
        if (limits == null) return fallback;
        JsonNode v = limits.get(key);
        return (v != null && v.isInt() && v.asInt() > 0) ? v.asInt() : fallback;
    }

    private ReportDefinitionValidator() {}

    /** @return an error message if the definition is invalid, or empty if it passes. */
    public static Optional<String> validate(JsonNode def) {
        if (def == null || !def.isObject()) {
            return Optional.of("Definition must be a JSON object");
        }

        JsonNode pages = def.get("pages");
        if (pages != null && !pages.isNull()) {
            if (!pages.isArray()) return Optional.of("pages must be an array");
            if (pages.size() > MAX_PAGES) {
                return Optional.of("Too many pages (" + pages.size() + " > " + MAX_PAGES + ")");
            }
            for (int p = 0; p < pages.size(); p++) {
                Optional<String> err = validatePage(pages.get(p), p);
                if (err.isPresent()) return err;
            }
        }

        Optional<String> arrErr = checkArrayLimit(def, "calculationRules", MAX_CALCULATION_RULES);
        if (arrErr.isEmpty()) arrErr = checkArrayLimit(def, "validationRules", MAX_VALIDATION_RULES);
        if (arrErr.isEmpty()) arrErr = checkArrayLimit(def, "outputVariants", MAX_OUTPUT_VARIANTS);
        if (arrErr.isEmpty()) arrErr = checkArrayLimit(def, "templateVariables", MAX_TEMPLATE_VARIABLES);
        if (arrErr.isEmpty()) arrErr = checkArrayLimit(def, "dataSources", MAX_DATA_SOURCES);
        if (arrErr.isEmpty()) arrErr = checkArrayLimit(def, "submissionModels", MAX_SUBMISSION_MODELS);
        return arrErr;
    }

    private static Optional<String> checkArrayLimit(JsonNode def, String field, int max) {
        JsonNode arr = def.get(field);
        if (arr != null && arr.isArray() && arr.size() > max) {
            return Optional.of("Too many " + field + " (" + arr.size() + " > " + max + ")");
        }
        return Optional.empty();
    }

    private static Optional<String> validatePage(JsonNode page, int pageIdx) {
        if (page == null || !page.isObject()) {
            return Optional.of("pages[" + pageIdx + "] must be an object");
        }
        JsonNode sections = page.get("sections");
        if (sections == null || sections.isNull()) return Optional.empty();
        if (!sections.isArray()) return Optional.of("pages[" + pageIdx + "].sections must be an array");
        if (sections.size() > MAX_SECTIONS_PER_PAGE) {
            return Optional.of("pages[" + pageIdx + "] has too many sections ("
                    + sections.size() + " > " + MAX_SECTIONS_PER_PAGE + ")");
        }
        for (int s = 0; s < sections.size(); s++) {
            JsonNode elements = sections.get(s).get("elements");
            if (elements != null && elements.isArray() && elements.size() > MAX_ELEMENTS_PER_SECTION) {
                return Optional.of("pages[" + pageIdx + "].sections[" + s
                        + "] has too many elements (" + elements.size()
                        + " > " + MAX_ELEMENTS_PER_SECTION + ")");
            }
        }
        return Optional.empty();
    }
}

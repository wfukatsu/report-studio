package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;

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
 */
public final class ReportDefinitionValidator {

    // Mirror of src/lib/schemas/reportDefinition.ts limits
    static final int MAX_PAGES = 50;
    static final int MAX_SECTIONS_PER_PAGE = 20;
    static final int MAX_ELEMENTS_PER_SECTION = 500;
    static final int MAX_RULES = 200;

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

        for (String field : new String[]{"calculationRules", "validationRules", "outputVariants"}) {
            JsonNode arr = def.get(field);
            if (arr != null && arr.isArray() && arr.size() > MAX_RULES) {
                return Optional.of("Too many " + field + " (" + arr.size() + " > " + MAX_RULES + ")");
            }
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

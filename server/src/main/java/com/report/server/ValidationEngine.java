package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.re2j.Pattern;
import com.google.re2j.PatternSyntaxException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;

/**
 * ValidationEngine — server-side field constraint and validation rule evaluation.
 *
 * Mirrors the client-side validators.ts logic. Run before PDF generation to catch
 * constraint violations early and return HTTP 422 with structured error details.
 *
 * Phase 2: element-level FieldConstraint + template-level ValidationRule (stub condition).
 * Phase 5: ValidationRule condition will delegate to JEXL ExpressionEngine.
 */
public final class ValidationEngine {

    private static final Logger log = LoggerFactory.getLogger(ValidationEngine.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private ValidationEngine() {}

    /**
     * Represents a single validation violation.
     *
     * @param elementId  the ID of the violating element (may be null for template-level rules)
     * @param field      a human-readable field identifier
     * @param message    the error or warning message
     * @param severity   "error" or "warning"
     */
    public record Violation(String elementId, String field, String message, String severity) {}

    /**
     * Validate a projection JSON string against its embedded FieldConstraints
     * and ValidationRules. Uses `_formData` from the projection if present.
     *
     * @param projectionJson  the full projection JSON (templates + optional _formData)
     * @return list of violations (may be empty)
     */
    public static List<Violation> validate(String projectionJson) {
        List<Violation> violations = new ArrayList<>();
        if (projectionJson == null || projectionJson.isBlank()) return violations;

        try {
            JsonNode root = MAPPER.readTree(projectionJson);
            JsonNode formData = root.path("_formData");
            JsonNode templates = root.path("templates");
            if (!templates.isArray()) return violations;

            for (JsonNode template : templates) {
                validateTemplate(template, formData, violations);
            }
        } catch (Exception e) {
            // Malformed JSON — caller validates structure before invoking; log for visibility
            log.warn("ValidationEngine: malformed projection JSON — validation skipped: {}", e.getMessage());
        }

        return violations;
    }

    // ── Template-level validation ─────────────────────────────────────────────

    private static void validateTemplate(JsonNode template, JsonNode formData,
                                         List<Violation> out) {
        // Element-level FieldConstraint
        JsonNode sections = template.path("sections");
        if (sections.isArray()) {
            for (JsonNode section : sections) {
                validateSection(section, formData, out);
            }
        }

        // Template-level ValidationRules
        JsonNode rules = template.path("validationRules");
        if (rules.isArray()) {
            for (JsonNode rule : rules) {
                validateRule(rule, formData, out);
            }
        }
    }

    private static void validateSection(JsonNode section, JsonNode formData,
                                        List<Violation> out) {
        JsonNode elements = section.path("elements");
        if (!elements.isArray()) return;
        for (JsonNode element : elements) {
            validateElement(element, formData, out);
        }
    }

    // ── Element-level FieldConstraint ─────────────────────────────────────────

    private static void validateElement(JsonNode element, JsonNode formData,
                                        List<Violation> out) {
        JsonNode props = element.path("props");
        JsonNode constraint = props.path("constraint");
        if (constraint.isMissingNode() || constraint.isNull()) return;

        String bindingRef = element.path("bindingRef").asText(null);
        String value = resolveValue(bindingRef, formData);
        String constraintType = constraint.path("constraintType").asText("");
        String elementId = element.path("id").asText("");

        String violation = switch (constraintType) {
            case "text" -> validateTextConstraint(value, constraint);
            case "numeric" -> validateNumericConstraint(value, constraint);
            case "date" -> validateDateConstraint(value, constraint);
            case "codeSet" -> validateCodeSetConstraint(value, constraint);
            default -> null;
        };

        if (violation != null) {
            String severity = constraint.path("severity").asText("error");
            out.add(new Violation(elementId, bindingRef != null ? bindingRef : elementId,
                    violation, severity));
        }
    }

    private static String validateTextConstraint(String value, JsonNode c) {
        boolean required = c.path("required").asBoolean(false);
        if (required && (value == null || value.isEmpty())) {
            return c.path("errorMessage").asText("This field is required.");
        }
        if (value == null || value.isEmpty()) return null;

        int minLength = c.path("minLength").asInt(-1);
        if (minLength >= 0 && value.length() < minLength) {
            return c.path("errorMessage").asText("Minimum " + minLength + " characters required.");
        }
        int maxLength = c.path("maxLength").asInt(-1);
        if (maxLength >= 0 && value.length() > maxLength) {
            return c.path("errorMessage").asText("Maximum " + maxLength + " characters allowed.");
        }

        String charType = c.path("charType").asText("any");
        String charError = validateCharType(value, charType);
        if (charError != null) {
            return c.path("errorMessage").asText(charError);
        }

        String inputPattern = c.path("inputPattern").asText(null);
        if (inputPattern != null && !inputPattern.isBlank()) {
            if (!RequestValidator.isValidPattern(inputPattern)) return null; // skip invalid patterns
            try {
                if (!Pattern.compile(inputPattern).matcher(value).matches()) {
                    return c.path("errorMessage").asText("Value does not match the required format.");
                }
            } catch (PatternSyntaxException e) {
                // Should not reach here — isValidPattern filters these out
            }
        }
        return null;
    }

    private static String validateCharType(String value, String charType) {
        return switch (charType) {
            case "half-width" ->
                value.chars().anyMatch(ch -> ch > 0x7F) ? "Only half-width characters are allowed." : null;
            case "full-width" ->
                value.chars().anyMatch(ch -> ch <= 0x7F) ? "Only full-width characters are allowed." : null;
            case "alpha-numeric" ->
                value.chars().anyMatch(ch -> !Character.isLetterOrDigit(ch) || ch > 0x7F)
                    ? "Only alphanumeric characters are allowed." : null;
            case "kana" ->
                value.chars().anyMatch(ch -> ch < 0x30A0 || ch > 0x30FF)
                    ? "Only katakana characters are allowed." : null;
            default -> null;
        };
    }

    private static String validateNumericConstraint(String value, JsonNode c) {
        boolean required = c.path("required").asBoolean(false);
        if (required && (value == null || value.isEmpty())) {
            return c.path("errorMessage").asText("This field is required.");
        }
        if (value == null || value.isEmpty()) return null;

        double num;
        try {
            num = Double.parseDouble(value);
        } catch (NumberFormatException e) {
            return c.path("errorMessage").asText("A numeric value is required.");
        }

        JsonNode range = c.path("numericRange");
        if (!range.isMissingNode()) {
            if (range.has("min") && num < range.get("min").asDouble()) {
                return c.path("errorMessage").asText("Value must be at least " + range.get("min").asDouble() + ".");
            }
            if (range.has("max") && num > range.get("max").asDouble()) {
                return c.path("errorMessage").asText("Value must be at most " + range.get("max").asDouble() + ".");
            }
        }
        return null;
    }

    private static final java.util.regex.Pattern ISO_DATE = java.util.regex.Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");

    private static String validateDateConstraint(String value, JsonNode c) {
        boolean required = c.path("required").asBoolean(false);
        if (required && (value == null || value.isEmpty())) {
            return c.path("errorMessage").asText("This field is required.");
        }
        if (value == null || value.isEmpty()) return null;

        if (!ISO_DATE.matcher(value).matches()) {
            return c.path("errorMessage").asText("A valid date (YYYY-MM-DD) is required.");
        }

        JsonNode range = c.path("dateRange");
        if (!range.isMissingNode()) {
            String from = range.path("from").asText(null);
            String to = range.path("to").asText(null);
            if (from != null && value.compareTo(from) < 0) {
                return c.path("errorMessage").asText("Date must be on or after " + from + ".");
            }
            if (to != null && value.compareTo(to) > 0) {
                return c.path("errorMessage").asText("Date must be on or before " + to + ".");
            }
        }
        return null;
    }

    private static String validateCodeSetConstraint(String value, JsonNode c) {
        boolean required = c.path("required").asBoolean(false);
        if (required && (value == null || value.isEmpty())) {
            return c.path("errorMessage").asText("This field is required.");
        }
        if (value == null || value.isEmpty()) return null;

        JsonNode codeSet = c.path("codeSet");
        if (codeSet.isArray()) {
            for (JsonNode code : codeSet) {
                if (value.equals(code.asText())) return null;
            }
            return c.path("errorMessage").asText("Value is not in the allowed code set.");
        }
        return null;
    }

    // ── Template-level ValidationRule ─────────────────────────────────────────

    private static void validateRule(JsonNode rule, JsonNode formData, List<Violation> out) {
        String condition = rule.path("condition").asText(null);
        // Phase 2: only fire rules with null/blank conditions (unconditional rules)
        if (!ExpressionEngine.evaluate(condition, CalculationEngine.formDataToMap(formData), 0)) return;

        String message = rule.path("message").asText("Validation rule violated.");
        String severity = rule.path("severity").asText("error");

        // Apply the violation to each target element
        JsonNode targets = rule.path("targets");
        if (targets.isArray() && !targets.isEmpty()) {
            for (JsonNode target : targets) {
                out.add(new Violation(target.asText(), target.asText(), message, severity));
            }
        } else {
            out.add(new Violation(null, "template", message, severity));
        }
    }

    // ── Utilities ─────────────────────────────────────────────────────────────

    private static String resolveValue(String bindingRef, JsonNode formData) {
        if (bindingRef == null || bindingRef.isBlank() || formData == null || formData.isMissingNode()) {
            return null;
        }
        // Simple top-level field lookup (detail row binding deferred to full implementation)
        JsonNode val = formData.get(bindingRef);
        return (val != null && !val.isNull()) ? val.asText() : null;
    }
}

package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Evaluates conditional display rules against form data (Jackson API).
 * Used by PdfRenderer to determine element visibility.
 */
public final class ConditionEvaluator {

    private static final Pattern DETAIL_FIELD_PATTERN = Pattern.compile("^(.+)\\[]\\.(.+)$");

    private ConditionEvaluator() {}

    /**
     * Check if an element should be visible based on its conditionalDisplay rules.
     * Returns true if the element should be rendered.
     */
    public static boolean shouldRender(JsonNode element, JsonNode formData, int detailRowIndex) {
        JsonNode cd = element.get("conditionalDisplay");
        if (cd == null || cd.isNull() || cd.isMissingNode()) return true;

        JsonNode conditions = cd.get("conditions");
        if (conditions == null || !conditions.isArray() || conditions.isEmpty()) return true;

        String logic = cd.has("logic") ? cd.get("logic").asText("and") : "and";

        if ("or".equals(logic)) {
            for (JsonNode c : conditions) {
                if (evaluateCondition(c, formData, detailRowIndex)) return true;
            }
            return false;
        } else {
            for (JsonNode c : conditions) {
                if (!evaluateCondition(c, formData, detailRowIndex)) return false;
            }
            return true;
        }
    }

    private static boolean evaluateCondition(JsonNode condition, JsonNode formData, int detailRowIndex) {
        String fieldPath = condition.has("fieldPath") ? condition.get("fieldPath").asText() : "";
        String operator = condition.has("operator") ? condition.get("operator").asText() : "equals";

        String fieldValue = resolveFieldValue(fieldPath, formData, detailRowIndex);

        if ("empty".equals(operator)) {
            return fieldValue == null || fieldValue.isEmpty();
        }
        if ("not_empty".equals(operator)) {
            return fieldValue != null && !fieldValue.isEmpty();
        }

        String conditionValue = condition.has("value") && !condition.get("value").isNull()
                ? condition.get("value").asText("")
                : "";

        return switch (operator) {
            case "equals" -> String.valueOf(fieldValue).equals(conditionValue);
            case "not_equals" -> !String.valueOf(fieldValue).equals(conditionValue);
            case "contains" -> fieldValue != null && fieldValue.contains(conditionValue);
            case "not_contains" -> fieldValue == null || !fieldValue.contains(conditionValue);
            case "greater_than" -> compareNumeric(fieldValue, conditionValue) > 0;
            case "less_than" -> compareNumeric(fieldValue, conditionValue) < 0;
            case "greater_than_or_equal" -> compareNumeric(fieldValue, conditionValue) >= 0;
            case "less_than_or_equal" -> compareNumeric(fieldValue, conditionValue) <= 0;
            default -> true;
        };
    }

    private static String resolveFieldValue(String fieldPath, JsonNode formData, int detailRowIndex) {
        if (formData == null) return null;

        Matcher m = DETAIL_FIELD_PATTERN.matcher(fieldPath);
        if (m.matches()) {
            String groupKey = m.group(1);
            String fieldKey = m.group(2);
            JsonNode group = formData.get(groupKey);
            if (group == null || !group.isArray() || detailRowIndex >= group.size()) return null;
            JsonNode val = group.get(detailRowIndex).get(fieldKey);
            return val != null && !val.isNull() ? val.asText() : null;
        }

        JsonNode val = formData.get(fieldPath);
        return val != null && !val.isNull() ? val.asText() : null;
    }

    private static int compareNumeric(String a, String b) {
        try {
            double da = a != null ? Double.parseDouble(a) : 0;
            double db = Double.parseDouble(b);
            return Double.compare(da, db);
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}

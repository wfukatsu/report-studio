package com.report.server;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Collection;
import java.util.Map;

/**
 * Custom JEXL functions available without namespace prefix.
 *
 * <p>Registered as the default namespace (null key) in {@link ExpressionEngine}. Uses Object
 * parameter types so JEXL resolves calls regardless of the concrete Collection implementation (e.g.
 * ImmutableCollections$ListN from List.of()).
 *
 * <p>Original (V1 compatible):
 *
 * <ul>
 *   <li>{@code sum(collection, fieldName)} — sum a numeric field across a list of maps
 *   <li>{@code count(collection)} — count elements in a collection
 *   <li>{@code round(value, scale)} — round a number to N decimal places
 * </ul>
 *
 * <p>Phase 3 additions:
 *
 * <ul>
 *   <li>{@code avg(collection, fieldName)} — average of a numeric field
 *   <li>{@code min(collection, fieldName)} — minimum of a numeric field
 *   <li>{@code max(collection, fieldName)} — maximum of a numeric field
 *   <li>{@code concat(str1, str2, ...)} — concatenate strings
 *   <li>{@code ifExpr(condition, thenValue, elseValue)} — conditional (if is JEXL keyword)
 *   <li>{@code formatNumber(value, pattern?)} — format a number as a locale string
 *   <li>{@code formatDate(dateStr, pattern?)} — format a date string
 * </ul>
 */
public final class JexlFunctions {

    JexlFunctions() {}

    // ── V1 Compatible ─────────────────────────────────────────────────────────

    /** Sum a numeric field across a collection of maps. */
    public double sum(Object items, String field) {
        if (!(items instanceof Collection<?> col)) return 0.0;
        double total = 0.0;
        for (Object item : col) {
            if (item instanceof Map<?, ?> m) {
                Object val = m.get(field);
                if (val instanceof Number n) total += n.doubleValue();
                else if (val instanceof String s) {
                    try {
                        total += Double.parseDouble(s);
                    } catch (NumberFormatException ignored) {
                    }
                }
            }
        }
        return total;
    }

    /** Count elements in a collection. */
    public int count(Object items) {
        if (!(items instanceof Collection<?> col)) return 0;
        return col.size();
    }

    /**
     * Round a numeric value to the given number of decimal places. Accepts Number for scale — JEXL
     * passes Byte/Short/Integer for small integer literals.
     */
    public double round(double value, Number scale) {
        return BigDecimal.valueOf(value)
                .setScale(scale.intValue(), RoundingMode.HALF_UP)
                .doubleValue();
    }

    // ── Phase 3 additions ─────────────────────────────────────────────────────

    /**
     * Average of a numeric field across a collection of maps. Returns null for empty collections.
     */
    public Object avg(Object items, String field) {
        if (!(items instanceof Collection<?> col) || col.isEmpty()) return null;
        double total = 0.0;
        int count = 0;
        for (Object item : col) {
            if (item instanceof Map<?, ?> m) {
                Object val = m.get(field);
                Double d = toDouble(val);
                if (d != null) {
                    total += d;
                    count++;
                }
            }
        }
        return count == 0 ? null : total / count;
    }

    /**
     * Minimum of a numeric field across a collection of maps. Returns null for empty collections.
     */
    public Object min(Object items, String field) {
        if (!(items instanceof Collection<?> col) || col.isEmpty()) return null;
        Double minVal = null;
        for (Object item : col) {
            if (item instanceof Map<?, ?> m) {
                Double d = toDouble(m.get(field));
                if (d != null && (minVal == null || d < minVal)) minVal = d;
            }
        }
        return minVal;
    }

    /**
     * Maximum of a numeric field across a collection of maps. Returns null for empty collections.
     */
    public Object max(Object items, String field) {
        if (!(items instanceof Collection<?> col) || col.isEmpty()) return null;
        Double maxVal = null;
        for (Object item : col) {
            if (item instanceof Map<?, ?> m) {
                Double d = toDouble(m.get(field));
                if (d != null && (maxVal == null || d > maxVal)) maxVal = d;
            }
        }
        return maxVal;
    }

    /** Concatenate multiple values as strings. */
    public String concat(Object... parts) {
        if (parts == null) return "";
        StringBuilder sb = new StringBuilder();
        for (Object p : parts) {
            sb.append(p == null ? "" : p.toString());
        }
        return sb.toString();
    }

    /**
     * Conditional expression — named {@code ifExpr} because {@code if} is a JEXL keyword. {@code
     * ifExpr(score >= 60, "合格", "不合格")}
     */
    public Object ifExpr(Object condition, Object thenValue, Object elseValue) {
        boolean cond =
                condition instanceof Boolean b ? b : (condition != null && !condition.equals(0));
        return cond ? thenValue : elseValue;
    }

    /**
     * Format a number as a localized string. Pattern: "integer" (default), "decimal2", "currency"
     * (JPY).
     */
    public String formatNumber(Object value, Object pattern) {
        if (value == null) return "";
        double d =
                value instanceof Number n ? n.doubleValue() : Double.parseDouble(value.toString());
        String pat = pattern == null ? "integer" : pattern.toString();
        return switch (pat) {
            case "decimal2" -> String.format("%.2f", d);
            case "currency" -> new DecimalFormat("¥#,##0").format(d);
            default -> new DecimalFormat("#,##0").format(d);
        };
    }

    /**
     * Format a date string using the given pattern. Input: ISO date string (yyyy-MM-dd) or epoch
     * millis as string. Pattern: "yyyy/MM/dd" (default), "yyyy-MM-dd", "yyyy年MM月dd日".
     */
    public String formatDate(Object dateStr, Object pattern) {
        if (dateStr == null) return "";
        String input = dateStr.toString().trim();
        if (input.isBlank()) return "";
        String fmt = pattern == null ? "yyyy/MM/dd" : pattern.toString();

        try {
            LocalDate date = LocalDate.parse(input.substring(0, 10)); // take yyyy-MM-dd prefix
            DateTimeFormatter formatter =
                    DateTimeFormatter.ofPattern(
                            fmt.replace("yyyy", "uuuu")); // DateTimeFormatter uses 'u' for year
            // Re-map user-facing pattern tokens to Java tokens
            return date.format(
                    DateTimeFormatter.ofPattern(
                            fmt.replace("yyyy", String.valueOf(date.getYear()))
                                    .replace("MM", String.format("%02d", date.getMonthValue()))
                                    .replace("dd", String.format("%02d", date.getDayOfMonth()))));
        } catch (Exception e) {
            return input; // return as-is if parsing fails
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private static Double toDouble(Object val) {
        if (val instanceof Number n) return n.doubleValue();
        if (val instanceof String s) {
            try {
                return Double.parseDouble(s);
            } catch (NumberFormatException ignored) {
            }
        }
        return null;
    }
}

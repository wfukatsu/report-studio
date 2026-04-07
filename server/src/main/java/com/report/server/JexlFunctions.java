package com.report.server;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Collection;
import java.util.Map;

/**
 * Custom JEXL functions available without namespace prefix.
 *
 * <p>Registered as the default namespace (null key) in {@link ExpressionEngine}.
 * Uses Object parameter types so JEXL resolves calls regardless of the concrete
 * Collection implementation (e.g. ImmutableCollections$ListN from List.of()).
 *
 * <ul>
 *   <li>{@code sum(collection, fieldName)} — sum a numeric field across a list of maps</li>
 *   <li>{@code count(collection)} — count elements in a collection</li>
 *   <li>{@code round(value, scale)} — round a number to N decimal places</li>
 * </ul>
 */
public final class JexlFunctions {

    JexlFunctions() {}

    /**
     * Sum a numeric field across a collection of maps.
     * {@code sum(items, 'amount')} → total of items[].amount
     */
    public double sum(Object items, String field) {
        if (!(items instanceof Collection<?> col)) return 0.0;
        double total = 0.0;
        for (Object item : col) {
            if (item instanceof Map<?, ?> m) {
                Object val = m.get(field);
                if (val instanceof Number n) total += n.doubleValue();
                else if (val instanceof String s) {
                    try { total += Double.parseDouble(s); } catch (NumberFormatException ignored) {}
                }
            }
        }
        return total;
    }

    /**
     * Count elements in a collection.
     */
    public int count(Object items) {
        if (!(items instanceof Collection<?> col)) return 0;
        return col.size();
    }

    /**
     * Round a numeric value to the given number of decimal places.
     * {@code round(12.567, 2)} → 12.57
     * Accepts Number for scale — JEXL passes Byte/Short/Integer for small integer literals.
     */
    public double round(double value, Number scale) {
        return BigDecimal.valueOf(value)
                .setScale(scale.intValue(), RoundingMode.HALF_UP)
                .doubleValue();
    }
}

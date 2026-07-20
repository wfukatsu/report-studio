package com.report.server;

import java.util.Set;

/**
 * Thrown when CalculationEngine detects a circular dependency among CalculationRules. Callers
 * should return HTTP 422 with {@code "error": "circular_dependency", "cycle": [...]}.
 */
public final class CircularDependencyException extends RuntimeException {

    private final Set<String> cycle;

    public CircularDependencyException(Set<String> cycle) {
        super("Circular dependency detected among fields: " + cycle);
        this.cycle = Set.copyOf(cycle);
    }

    /** The set of field names involved in the cycle. */
    public Set<String> getCycle() {
        return cycle;
    }
}

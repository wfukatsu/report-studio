package com.report.server;

/**
 * Thrown when a JEXL expression evaluation exceeds the configured timeout.
 * Callers should return HTTP 422 with {@code "error": "expression_timeout"}.
 */
public final class ExpressionTimeoutException extends RuntimeException {
    public ExpressionTimeoutException(String message) {
        super(message);
    }
}

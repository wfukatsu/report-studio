package com.report.server;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class CorrelationIdTest {

    @Test
    void generate_returns8Characters() {
        String id = CorrelationId.generate();
        assertEquals(8, id.length());
    }

    @Test
    void generate_isAlphanumeric() {
        String id = CorrelationId.generate();
        assertTrue(id.matches("[a-f0-9]{8}"), "Expected lowercase hex, got: " + id);
    }

    @Test
    void generate_twoCalls_produceDifferentIds() {
        String a = CorrelationId.generate();
        String b = CorrelationId.generate();
        assertNotEquals(a, b);
    }
}

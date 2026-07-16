package com.report.server.job;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class JobConcurrencyLimiterTest {

    @Test
    void acquiresUpToCap_thenRejects() {
        JobConcurrencyLimiter limiter = new JobConcurrencyLimiter(2);
        assertTrue(limiter.tryAcquire());
        assertTrue(limiter.tryAcquire());
        assertFalse(limiter.tryAcquire());
        assertEquals(2, limiter.active());
    }

    @Test
    void release_freesASlot() {
        JobConcurrencyLimiter limiter = new JobConcurrencyLimiter(1);
        assertTrue(limiter.tryAcquire());
        assertFalse(limiter.tryAcquire());
        limiter.release();
        assertTrue(limiter.tryAcquire());
    }

    @Test
    void rejectedAcquire_doesNotLeakSlots() {
        JobConcurrencyLimiter limiter = new JobConcurrencyLimiter(1);
        assertTrue(limiter.tryAcquire());
        for (int i = 0; i < 5; i++) assertFalse(limiter.tryAcquire());
        assertEquals(1, limiter.active());
        limiter.release();
        assertEquals(0, limiter.active());
    }
}

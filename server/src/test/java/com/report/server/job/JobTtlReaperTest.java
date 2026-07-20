package com.report.server.job;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

/**
 * JobTtlReaper — scheduled TTL reclamation (#222).
 *
 * <p>The reaper owns the schedule; the actual deletion lives in {@link JobStore#deleteExpired}.
 * These tests verify it (a) invokes deleteExpired periodically with the current wall-clock time and
 * (b) keeps running after a deleteExpired failure — the guarantee provided by its internal
 * try/catch, without which a single throw would silently cancel all future runs
 * (scheduleAtFixedRate semantics).
 */
class JobTtlReaperTest {

    /** Minimal JobStore recording deleteExpired invocations; other methods are unused here. */
    private static final class RecordingStore implements JobStore {
        final CountDownLatch latch;
        final AtomicInteger calls = new AtomicInteger();
        final AtomicLong lastNow = new AtomicLong(-1);
        volatile boolean throwOnEachCall = false;

        RecordingStore(int expectedInvocations) {
            this.latch = new CountDownLatch(expectedInvocations);
        }

        @Override
        public int deleteExpired(long nowMillis) {
            calls.incrementAndGet();
            lastNow.set(nowMillis);
            latch.countDown();
            if (throwOnEachCall) throw new RuntimeException("boom");
            return 0;
        }

        // ── Unused in these tests ──
        @Override
        public void save(JobRecord record) {}

        @Override
        public Optional<JobRecord> findById(String jobId) {
            return Optional.empty();
        }

        @Override
        public List<JobRecord> listAll() {
            return List.of();
        }

        @Override
        public void delete(String jobId) {}

        @Override
        public Path jobDir(String jobId) {
            return Path.of("unused");
        }

        @Override
        public Path getOutputDir(String jobId) {
            return Path.of("unused");
        }

        @Override
        public Path getOutputZipPath(String jobId) {
            return Path.of("unused");
        }
    }

    @Test
    void invokesDeleteExpiredWithCurrentWallClock() throws Exception {
        RecordingStore store = new RecordingStore(1);
        long before = System.currentTimeMillis();
        try (JobTtlReaper reaper = new JobTtlReaper(store, 1)) {
            assertTrue(
                    store.latch.await(5, TimeUnit.SECONDS),
                    "reaper should have invoked deleteExpired at least once");
        }
        assertTrue(store.lastNow.get() >= before, "deleteExpired should receive the current time");
    }

    @Test
    void keepsRunningAfterADeleteExpiredFailure() throws Exception {
        // Every invocation throws; the reaper's try/catch must swallow it so the
        // fixed-rate schedule is NOT cancelled and later runs still fire.
        RecordingStore store = new RecordingStore(2);
        store.throwOnEachCall = true;
        try (JobTtlReaper reaper = new JobTtlReaper(store, 1)) {
            assertTrue(
                    store.latch.await(6, TimeUnit.SECONDS),
                    "reaper must keep invoking deleteExpired despite exceptions");
        }
        assertTrue(store.calls.get() >= 2);
    }

    @Test
    void closeStopsFurtherReaping() throws Exception {
        RecordingStore store = new RecordingStore(1);
        JobTtlReaper reaper = new JobTtlReaper(store, 1);
        assertTrue(store.latch.await(5, TimeUnit.SECONDS));
        reaper.close();
        int afterClose = store.calls.get();
        // No further invocations once shut down.
        Thread.sleep(1500);
        assertEquals(afterClose, store.calls.get(), "no reaping should occur after close()");
    }
}

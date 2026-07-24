package com.report.server;

import com.scalar.db.api.DistributedTransaction;
import com.scalar.db.api.DistributedTransactionAdmin;
import com.scalar.db.api.DistributedTransactionManager;
import com.scalar.db.api.TableMetadata;
import com.scalar.db.exception.storage.ExecutionException;
import com.scalar.db.service.TransactionFactory;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Single access point for direct ScalarDB usage across controllers (#421).
 *
 * <p>Before this class existed, every controller that talked to ScalarDB held its own {@link
 * TransactionFactory} reference, created short-lived {@link DistributedTransactionAdmin} instances
 * inline, and (in one case) kept a private {@link TableMetadata} cache. This gateway centralizes
 * those three concerns:
 *
 * <ul>
 *   <li><b>Transaction manager</b> — owns the single app-wide {@link DistributedTransactionManager}
 *       (created once, reused everywhere, closed on shutdown — issue #203).
 *   <li><b>Admin access</b> — {@link #createAdmin()} hands out fresh short-lived admin instances;
 *       callers close them via try-with-resources exactly as before.
 *   <li><b>Metadata + cache</b> — {@link #getCachedTableMetadata} hosts the TTL cache that used to
 *       live in {@code ScalarDbRowController}; {@link #getTableMetadata} is the uncached
 *       fetch-per-request path kept for callers whose freshness semantics must not change.
 * </ul>
 *
 * <p>{@link #inTransaction} captures the common begin/commit/abort-quietly pattern. It rethrows the
 * original exception unchanged so callers keep their existing per-exception handling
 * (CommitConflictException → 409, TransactionException → 503, ...). Call sites whose transaction
 * block deviates from this pattern (e.g. mid-transaction abort + early return) intentionally keep
 * their hand-rolled transaction code — behavior preservation takes precedence over consolidation.
 */
public final class ScalarDbGateway {

    private static final long METADATA_CACHE_TTL_MS = 5 * 60 * 1000L; // 5 minutes

    private record CachedMeta(TableMetadata meta, long cachedAt) {}

    private final TransactionFactory factory;
    private final DistributedTransactionManager manager;
    private final ConcurrentHashMap<String, CachedMeta> metadataCache = new ConcurrentHashMap<>();

    /**
     * Production constructor — creates the single shared {@link DistributedTransactionManager} from
     * the factory. ScalarDB managers are thread-safe and meant to be created once and reused;
     * {@code factory.getTransactionManager()} builds a fresh manager (with its own connection pool)
     * on every call and never closes it (issue #203).
     */
    public ScalarDbGateway(TransactionFactory factory) {
        this(factory, factory.getTransactionManager());
    }

    /** Package-private constructor for testing — accepts a pre-built (mock) manager. */
    ScalarDbGateway(TransactionFactory factory, DistributedTransactionManager manager) {
        this.factory = factory;
        this.manager = manager;
    }

    /** The single shared transaction manager. Never close it from a call site. */
    public DistributedTransactionManager transactionManager() {
        return manager;
    }

    /**
     * Creates a fresh short-lived {@link DistributedTransactionAdmin}. The caller owns its
     * lifecycle and must close it (use try-with-resources).
     */
    public DistributedTransactionAdmin createAdmin() {
        return factory.getTransactionAdmin();
    }

    /**
     * Fetches {@link TableMetadata} with a fresh admin round-trip (uncached). Returns {@code null}
     * when the table does not exist.
     */
    public TableMetadata getTableMetadata(String namespace, String table)
            throws ExecutionException {
        try (DistributedTransactionAdmin admin = factory.getTransactionAdmin()) {
            return admin.getTableMetadata(namespace, table);
        }
    }

    /**
     * Fetches {@link TableMetadata} through the shared TTL cache (5 minutes). Returns {@code null}
     * when the table does not exist (never cached). Moved from {@code ScalarDbRowController}.
     */
    public TableMetadata getCachedTableMetadata(String namespace, String table)
            throws ExecutionException {
        String key = namespace + "." + table;
        CachedMeta cached = metadataCache.get(key);
        if (cached != null
                && System.currentTimeMillis() - cached.cachedAt < METADATA_CACHE_TTL_MS) {
            return cached.meta;
        }
        TableMetadata meta = getTableMetadata(namespace, table);
        if (meta != null) metadataCache.put(key, new CachedMeta(meta, System.currentTimeMillis()));
        return meta;
    }

    /** Invalidate cached metadata for a table. Call after DDL changes. */
    public void invalidateMetadataCache(String namespace, String table) {
        metadataCache.remove(namespace + "." + table);
    }

    /** Remove all expired entries from the metadata cache. */
    void cleanExpiredCache() {
        long now = System.currentTimeMillis();
        metadataCache
                .entrySet()
                .removeIf(e -> now - e.getValue().cachedAt >= METADATA_CACHE_TTL_MS);
    }

    /** A unit of work executed inside a single ScalarDB transaction. */
    @FunctionalInterface
    public interface TransactionWork<T> {
        T execute(DistributedTransaction tx) throws Exception;
    }

    /**
     * Runs {@code work} inside a transaction: begin → work → commit. On any exception the
     * transaction is aborted quietly (abort failures swallowed) and the <em>original</em> exception
     * is rethrown unchanged, so callers keep their existing exception-type-specific handling.
     */
    public <T> T inTransaction(TransactionWork<T> work) throws Exception {
        DistributedTransaction tx = null;
        try {
            tx = manager.start();
            T result = work.execute(tx);
            tx.commit();
            return result;
        } catch (Exception e) {
            abortQuietly(tx);
            throw e;
        }
    }

    private static void abortQuietly(DistributedTransaction tx) {
        if (tx != null) {
            try {
                tx.abort();
            } catch (Exception ignored) {
            }
        }
    }
}

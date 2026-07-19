package com.report.server;

import java.util.Set;

/**
 * System namespaces that hold application-internal data (users with password
 * hashes, API-token hashes, webhook secrets, form responses with PII, ScalarDB
 * bookkeeping). The generic ScalarDB CRUD/scan endpoints must never expose or
 * mutate these — data isolation for this app lives at the application layer, so
 * these tables are only reachable through their dedicated, authorization-checked
 * controllers, never through the raw table browser.
 *
 * <p>This single source of truth is shared by both the write side
 * ({@link ScalarDbRowController}) and the read side ({@link ScalarDbScanController})
 * so the deny list cannot drift between them.
 */
public final class SystemNamespaces {

    private SystemNamespaces() {}

    /** Namespaces rejected by the generic row CRUD/scan endpoints. */
    public static final Set<String> PROTECTED = Set.of(
        "report_studio", "scalardb", "coordinator"
    );

    /** True when the namespace is system-internal and off-limits to generic table access. */
    public static boolean isProtected(String namespace) {
        return namespace != null && PROTECTED.contains(namespace);
    }
}

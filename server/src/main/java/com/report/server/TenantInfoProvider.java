package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Process-wide access point for the tenant info document (issue #54).
 *
 * <p>{@link PdfRenderer} is a static pipeline shared by every PDF entry point (stateless,
 * stored-template, jobs, batch); registering the supplier once in AppWiring gives all of them
 * tenant resolution without threading a repository through each call site. A projection can still
 * override the document via a root-level {@code _tenant} node — used by tests and previews.
 */
public final class TenantInfoProvider {

    private static final Logger log = LoggerFactory.getLogger(TenantInfoProvider.class);

    private static volatile Supplier<JsonNode> supplier;

    private TenantInfoProvider() {}

    /** Register the tenant lookup (called once from AppWiring). */
    public static void setSupplier(Supplier<JsonNode> s) {
        supplier = s;
    }

    /** Current tenant info, or null when unconfigured/unavailable. */
    public static JsonNode get() {
        Supplier<JsonNode> s = supplier;
        if (s == null) return null;
        try {
            return s.get();
        } catch (Exception e) {
            log.warn("Tenant info lookup failed: {}", e.getMessage());
            return null;
        }
    }
}

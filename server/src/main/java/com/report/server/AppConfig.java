package com.report.server;

import com.scalar.db.service.TransactionFactory;
import io.javalin.config.JavalinConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

/**
 * Static configuration utilities for server startup.
 * Handles port resolution, data directory setup, and ScalarDB factory creation.
 */
public final class AppConfig {

    private static final Logger log = LoggerFactory.getLogger(AppConfig.class);
    private static final int DEFAULT_PORT = 8080;
    private static final String CONFIG_FILE = "scalardb.properties";

    private AppConfig() {}

    public static int resolvePort(String[] args) {
        if (args.length > 0) {
            try { return Integer.parseInt(args[0]); } catch (NumberFormatException ignored) { }
        }
        String envPort = System.getenv("PORT");
        if (envPort != null) {
            try { return Integer.parseInt(envPort); } catch (NumberFormatException ignored) { }
        }
        return DEFAULT_PORT;
    }

    public static void ensureDataDir() {
        try {
            Files.createDirectories(Path.of("data"));
        } catch (Exception e) {
            log.warn("Could not create data directory: {}", e.getMessage());
        }
    }

    /**
     * Create TransactionFactory from environment variables or config file.
     *
     * <p>Environment variables (highest priority):
     * <ul>
     *   <li>SCALARDB_STORAGE          → scalar.db.storage</li>
     *   <li>SCALARDB_CONTACT_POINTS   → scalar.db.contact_points</li>
     *   <li>SCALARDB_USERNAME         → scalar.db.username</li>
     *   <li>SCALARDB_PASSWORD         → scalar.db.password</li>
     *   <li>SCALARDB_TX_MANAGER       → scalar.db.transaction_manager</li>
     * </ul>
     * Falls back to scalardb.properties file if no env vars are set.
     */
    public static TransactionFactory createTransactionFactory() throws IOException {
        String contactPoints = System.getenv("SCALARDB_CONTACT_POINTS");
        if (contactPoints != null && !contactPoints.isBlank()) {
            Properties props = new Properties();
            props.setProperty("scalar.db.storage",
                envOrDefault("SCALARDB_STORAGE", "jdbc"));
            props.setProperty("scalar.db.contact_points", contactPoints);
            props.setProperty("scalar.db.username",
                envOrDefault("SCALARDB_USERNAME", ""));
            props.setProperty("scalar.db.password",
                envOrDefault("SCALARDB_PASSWORD", ""));
            props.setProperty("scalar.db.transaction_manager",
                envOrDefault("SCALARDB_TX_MANAGER", "jdbc"));
            // Connection pool defaults
            props.setProperty("scalar.db.jdbc.connection_pool.min_idle", "1");
            props.setProperty("scalar.db.jdbc.connection_pool.max_idle", "5");
            props.setProperty("scalar.db.jdbc.connection_pool.max_total", "10");
            log.info("ScalarDB configured via environment variables (contact_points={})", contactPoints);
            return TransactionFactory.create(props);
        }
        log.info("ScalarDB configured via {}", CONFIG_FILE);
        return TransactionFactory.create(CONFIG_FILE);
    }

    /** Configure Javalin: request size limit + CORS. */
    public static void configure(JavalinConfig config) {
        config.http.maxRequestSize = 5_000_000L;
        String allowedOrigin = System.getenv("ALLOWED_ORIGIN");
        config.bundledPlugins.enableCors(cors ->
            cors.addRule(rule -> {
                rule.allowHost("http://localhost:5173");
                if (allowedOrigin != null && !allowedOrigin.isBlank()) {
                    rule.allowHost(allowedOrigin);
                }
                rule.allowCredentials = true;
            })
        );
    }

    /**
     * Returns {@code true} when cookies should carry the {@code Secure} flag.
     *
     * <p>Enabled automatically when {@code ALLOWED_ORIGIN} starts with {@code https://}
     * (production HTTPS environment), or when {@code COOKIE_SECURE=true} is set explicitly.
     * Always {@code false} on localhost to keep development cookie-sending intact.
     */
    public static boolean secureCookies() {
        String explicit = System.getenv("COOKIE_SECURE");
        if ("true".equalsIgnoreCase(explicit)) return true;
        String origin = System.getenv("ALLOWED_ORIGIN");
        return origin != null && origin.startsWith("https://");
    }

    private static String envOrDefault(String envKey, String defaultValue) {
        String value = System.getenv(envKey);
        return (value != null && !value.isBlank()) ? value : defaultValue;
    }
}

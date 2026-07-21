package com.report.server;

import com.scalar.db.service.TransactionFactory;
import io.javalin.config.JavalinConfig;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Static configuration utilities for server startup. Handles port resolution, data directory setup,
 * and ScalarDB factory creation.
 */
public final class AppConfig {

    private static final Logger log = LoggerFactory.getLogger(AppConfig.class);
    private static final int DEFAULT_PORT = 8080;
    private static final String CONFIG_FILE = "scalardb.properties";

    private AppConfig() {}

    public static int resolvePort(String[] args) {
        return resolvePort(args, System.getenv("PORT"));
    }

    /** Testable overload: same precedence (args over env over default), explicit env value. */
    static int resolvePort(String[] args, String envPort) {
        if (args.length > 0) {
            try {
                return Integer.parseInt(args[0]);
            } catch (NumberFormatException ignored) {
            }
        }
        if (envPort != null) {
            try {
                return Integer.parseInt(envPort);
            } catch (NumberFormatException ignored) {
            }
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
     *
     * <ul>
     *   <li>SCALARDB_STORAGE → scalar.db.storage
     *   <li>SCALARDB_CONTACT_POINTS → scalar.db.contact_points
     *   <li>SCALARDB_USERNAME → scalar.db.username
     *   <li>SCALARDB_PASSWORD → scalar.db.password
     *   <li>SCALARDB_TX_MANAGER → scalar.db.transaction_manager
     * </ul>
     *
     * <p>Connection pool sizing (#274) is overridable via {@code SCALARDB_POOL_MIN_IDLE} / {@code
     * SCALARDB_POOL_MAX_IDLE} / {@code SCALARDB_POOL_MAX_TOTAL} on <b>both</b> paths: the env-based
     * configuration (defaults 1/5/10 as before) and the properties-file path, where the env values
     * are applied on top of whatever the file declares.
     *
     * <p>Falls back to scalardb.properties file if no env vars are set.
     */
    public static TransactionFactory createTransactionFactory() throws IOException {
        String contactPoints = System.getenv("SCALARDB_CONTACT_POINTS");
        String minIdle = System.getenv("SCALARDB_POOL_MIN_IDLE");
        String maxIdle = System.getenv("SCALARDB_POOL_MAX_IDLE");
        String maxTotal = System.getenv("SCALARDB_POOL_MAX_TOTAL");
        if (contactPoints != null && !contactPoints.isBlank()) {
            Properties props = new Properties();
            props.setProperty("scalar.db.storage", envOrDefault("SCALARDB_STORAGE", "jdbc"));
            props.setProperty("scalar.db.contact_points", contactPoints);
            props.setProperty("scalar.db.username", envOrDefault("SCALARDB_USERNAME", ""));
            props.setProperty("scalar.db.password", envOrDefault("SCALARDB_PASSWORD", ""));
            props.setProperty(
                    "scalar.db.transaction_manager", envOrDefault("SCALARDB_TX_MANAGER", "jdbc"));
            // Connection pool defaults, overridable via SCALARDB_POOL_* (#274)
            props.setProperty("scalar.db.jdbc.connection_pool.min_idle", "1");
            props.setProperty("scalar.db.jdbc.connection_pool.max_idle", "5");
            props.setProperty("scalar.db.jdbc.connection_pool.max_total", "10");
            applyPoolOverrides(props, minIdle, maxIdle, maxTotal);
            log.info(
                    "ScalarDB configured via environment variables (contact_points={})",
                    contactPoints);
            return TransactionFactory.create(props);
        }
        log.info("ScalarDB configured via {}", CONFIG_FILE);
        return TransactionFactory.create(
                loadFileProperties(Path.of(CONFIG_FILE), minIdle, maxIdle, maxTotal));
    }

    /**
     * Loads a ScalarDB properties file and applies the SCALARDB_POOL_* env overrides on top.
     * Package-private for tests (explicit values, same pattern as {@link #resolvePort}).
     */
    static Properties loadFileProperties(
            Path configFile, String minIdle, String maxIdle, String maxTotal) throws IOException {
        Properties props = new Properties();
        try (var in = Files.newInputStream(configFile)) {
            props.load(in);
        }
        applyPoolOverrides(props, minIdle, maxIdle, maxTotal);
        return props;
    }

    /**
     * Applies connection-pool env overrides onto {@code props}. Absent/blank values leave the
     * existing property untouched; non-numeric or non-positive values are ignored with a warning
     * (bad ops input must not take the server down).
     */
    static void applyPoolOverrides(
            Properties props, String minIdle, String maxIdle, String maxTotal) {
        setPoolProp(props, "scalar.db.jdbc.connection_pool.min_idle", minIdle);
        setPoolProp(props, "scalar.db.jdbc.connection_pool.max_idle", maxIdle);
        setPoolProp(props, "scalar.db.jdbc.connection_pool.max_total", maxTotal);
    }

    private static void setPoolProp(Properties props, String key, String value) {
        if (value == null || value.isBlank()) return;
        try {
            int parsed = Integer.parseInt(value.trim());
            if (parsed < 0) {
                log.warn("Ignoring negative pool setting {}={}", key, value);
                return;
            }
            props.setProperty(key, String.valueOf(parsed));
        } catch (NumberFormatException e) {
            log.warn("Ignoring non-numeric pool setting {}={}", key, value);
        }
    }

    /** Default max request size in bytes (5 MB), overridable via MAX_REQUEST_SIZE (#274). */
    static final long DEFAULT_MAX_REQUEST_SIZE = 5_000_000L;

    /** Default Vite dev-server port range allowed by CORS, overridable via CORS_DEV_PORT_RANGE. */
    static final int DEFAULT_CORS_DEV_PORT_MIN = 5173;

    static final int DEFAULT_CORS_DEV_PORT_MAX = 5200;

    /** Configure Javalin: request size limit + CORS. */
    public static void configure(JavalinConfig config) {
        configure(
                config,
                System.getenv("MAX_REQUEST_SIZE"),
                System.getenv("CORS_DEV_PORT_RANGE"),
                System.getenv("ALLOWED_ORIGIN"));
    }

    /** Testable overload: explicit env values, same behavior (#274). */
    static void configure(
            JavalinConfig config,
            String maxRequestSizeEnv,
            String corsDevPortRangeEnv,
            String allowedOrigin) {
        config.http.maxRequestSize = parseMaxRequestSize(maxRequestSizeEnv);
        int[] devPorts = parseDevPortRange(corsDevPortRangeEnv);
        config.bundledPlugins.enableCors(
                cors ->
                        cors.addRule(
                                rule -> {
                                    // Allow local Vite dev server ports (default 5173–5200)
                                    for (int port = devPorts[0]; port <= devPorts[1]; port++) {
                                        rule.allowHost("http://localhost:" + port);
                                    }
                                    if (allowedOrigin != null && !allowedOrigin.isBlank()) {
                                        rule.allowHost(allowedOrigin);
                                    }
                                    rule.allowCredentials = true;
                                }));
    }

    /**
     * Parses MAX_REQUEST_SIZE (bytes). Invalid or non-positive values fall back to the 5 MB default
     * with a warning.
     */
    static long parseMaxRequestSize(String env) {
        if (env == null || env.isBlank()) return DEFAULT_MAX_REQUEST_SIZE;
        try {
            long parsed = Long.parseLong(env.trim());
            if (parsed > 0) return parsed;
            log.warn("Ignoring non-positive MAX_REQUEST_SIZE={}", env);
        } catch (NumberFormatException e) {
            log.warn("Ignoring non-numeric MAX_REQUEST_SIZE={}", env);
        }
        return DEFAULT_MAX_REQUEST_SIZE;
    }

    /**
     * Parses CORS_DEV_PORT_RANGE ("lo-hi", e.g. "5173-5200") into {@code {lo, hi}}. Malformed
     * ranges (bad syntax, lo &gt; hi, out of 1–65535) fall back to the default 5173–5200 with a
     * warning.
     */
    static int[] parseDevPortRange(String env) {
        int[] defaults = {DEFAULT_CORS_DEV_PORT_MIN, DEFAULT_CORS_DEV_PORT_MAX};
        if (env == null || env.isBlank()) return defaults;
        var m = java.util.regex.Pattern.compile("^(\\d{1,5})-(\\d{1,5})$").matcher(env.trim());
        if (!m.matches()) {
            log.warn("Ignoring malformed CORS_DEV_PORT_RANGE={} (expected \"lo-hi\")", env);
            return defaults;
        }
        int lo = Integer.parseInt(m.group(1));
        int hi = Integer.parseInt(m.group(2));
        if (lo < 1 || hi > 65_535 || lo > hi) {
            log.warn("Ignoring out-of-range CORS_DEV_PORT_RANGE={}", env);
            return defaults;
        }
        return new int[] {lo, hi};
    }

    /**
     * Returns {@code true} when cookies should carry the {@code Secure} flag.
     *
     * <p>Enabled automatically when {@code ALLOWED_ORIGIN} starts with {@code https://} (production
     * HTTPS environment), or when {@code COOKIE_SECURE=true} is set explicitly. Always {@code
     * false} on localhost to keep development cookie-sending intact.
     */
    public static boolean secureCookies() {
        return secureCookies(System.getenv("COOKIE_SECURE"), System.getenv("ALLOWED_ORIGIN"));
    }

    /** Testable overload: explicit COOKIE_SECURE / ALLOWED_ORIGIN values, same behavior. */
    static boolean secureCookies(String cookieSecure, String allowedOrigin) {
        if ("true".equalsIgnoreCase(cookieSecure)) return true;
        return allowedOrigin != null && allowedOrigin.startsWith("https://");
    }

    private static String envOrDefault(String envKey, String defaultValue) {
        String value = System.getenv(envKey);
        return (value != null && !value.isBlank()) ? value : defaultValue;
    }
}

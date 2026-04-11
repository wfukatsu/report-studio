package com.report.server;

import com.report.server.auth.Principal;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.StringReader;
import java.io.StringWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

/**
 * Admin-only server configuration endpoints:
 * <ul>
 *   <li>GET  /api/v1/admin/server-config        — read scalardb.properties (password masked)</li>
 *   <li>PUT  /api/v1/admin/server-config        — write scalardb.properties</li>
 *   <li>POST /api/v1/admin/server-config/test   — test connection with given config</li>
 *   <li>POST /api/v1/admin/server/restart       — schedule JVM exit (process manager restarts)</li>
 * </ul>
 */
public final class AdminServerController {

    private static final Logger log = LoggerFactory.getLogger(AdminServerController.class);

    /** Properties that are exposed to the UI (subset to avoid exposing internal keys). */
    private static final Set<String> EXPOSED_KEYS = Set.of(
        "scalar.db.storage",
        "scalar.db.contact_points",
        "scalar.db.username",
        "scalar.db.password",
        "scalar.db.transaction_manager",
        "scalar.db.jdbc.connection_pool.min_idle",
        "scalar.db.jdbc.connection_pool.max_idle",
        "scalar.db.jdbc.connection_pool.max_total"
    );

    private final Path propsPath;

    public AdminServerController(Path propsPath) {
        this.propsPath = propsPath;
    }

    private boolean requireAdmin(Context ctx) {
        Principal principal = ctx.attribute("principal");
        if (principal == null || principal.isAnonymous() || !principal.roles().contains("admin")) {
            ctx.status(HttpStatus.FORBIDDEN);
            ctx.json(Map.of("error", "Admin role required"));
            return false;
        }
        return true;
    }

    /** GET /api/v1/admin/server-config — return current properties (password masked). */
    public void getConfig(Context ctx) {
        if (!requireAdmin(ctx)) return;

        try {
            Properties props = loadProps();
            Map<String, String> config = new LinkedHashMap<>();
            for (String key : EXPOSED_KEYS) {
                String value = props.getProperty(key, "");
                // Mask password field
                if (key.endsWith(".password") && !value.isBlank()) {
                    value = "***";
                }
                config.put(key, value);
            }
            ctx.json(config);
        } catch (IOException e) {
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Failed to read config: " + e.getMessage()));
        }
    }

    /** PUT /api/v1/admin/server-config — write properties (atomically). */
    public void putConfig(Context ctx) {
        if (!requireAdmin(ctx)) return;

        try {
            @SuppressWarnings("unchecked")
            Map<String, String> incoming = ctx.bodyAsClass(Map.class);

            Properties props = loadProps();
            for (Map.Entry<String, String> entry : incoming.entrySet()) {
                String key = entry.getKey();
                String value = entry.getValue();
                // Don't overwrite with masked placeholder
                if (!EXPOSED_KEYS.contains(key)) continue;
                if (key.endsWith(".password") && "***".equals(value)) continue;
                props.setProperty(key, value);
            }

            saveProps(props);
            log.info("Admin updated server config");
            ctx.json(Map.of("message", "Config saved. Restart the server to apply."));
        } catch (IOException e) {
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Failed to write config: " + e.getMessage()));
        }
    }

    /**
     * POST /api/v1/admin/server-config/test — test ScalarDB connection with given config.
     * Accepts same body as PUT. Creates a temporary TransactionFactory to test connectivity.
     */
    public void testConfig(Context ctx) {
        if (!requireAdmin(ctx)) return;

        try {
            @SuppressWarnings("unchecked")
            Map<String, String> incoming = ctx.bodyAsClass(Map.class);

            Properties props = loadProps();
            for (Map.Entry<String, String> entry : incoming.entrySet()) {
                String key = entry.getKey();
                String value = entry.getValue();
                if (!EXPOSED_KEYS.contains(key)) continue;
                if (key.endsWith(".password") && "***".equals(value)) continue;
                props.setProperty(key, value);
            }

            // Try to create a factory — if it succeeds, connection is valid
            // TransactionFactory doesn't have a close() method; just creating it tests connectivity
            com.scalar.db.service.TransactionFactory.create(props);

            ctx.json(Map.of("success", true, "message", "接続テスト成功"));
            log.info("Admin server-config test: success");
        } catch (Exception e) {
            log.warn("Admin server-config test failed: {}", e.getMessage());
            ctx.status(HttpStatus.BAD_GATEWAY);
            ctx.json(Map.of("success", false, "message", "接続テスト失敗: " + e.getMessage()));
        }
    }

    /**
     * POST /api/v1/admin/server/restart — schedule JVM halt after 2s.
     * The process manager (gradle, shell script) is expected to restart the server.
     * Returns 200 before halting.
     */
    public void restart(Context ctx) {
        if (!requireAdmin(ctx)) return;

        ctx.json(Map.of("message", "再起動中...サーバーが再起動するまでしばらくお待ちください。"));
        log.warn("Admin requested server restart — halting JVM in 2 seconds");

        CompletableFuture.runAsync(() -> {
            try { Thread.sleep(2000); } catch (InterruptedException ignored) {}
            Runtime.getRuntime().halt(0);
        });
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private Properties loadProps() throws IOException {
        Properties props = new Properties();
        if (Files.exists(propsPath)) {
            props.load(Files.newBufferedReader(propsPath));
        }
        return props;
    }

    private void saveProps(Properties props) throws IOException {
        StringWriter sw = new StringWriter();
        props.store(sw, "ScalarDB configuration (managed by Report Design Studio)");
        Path tmp = propsPath.resolveSibling(propsPath.getFileName() + ".tmp");
        Files.writeString(tmp, sw.toString());
        Files.move(tmp, propsPath, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    }
}

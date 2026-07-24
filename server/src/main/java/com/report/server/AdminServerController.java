package com.report.server;

import com.report.server.auth.Principal;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.io.IOException;
import java.io.StringWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Admin-only server configuration endpoints:
 *
 * <ul>
 *   <li>GET /api/v1/admin/server-config — read scalardb.properties (password masked)
 *   <li>PUT /api/v1/admin/server-config — write scalardb.properties
 *   <li>POST /api/v1/admin/server-config/test — test connection with given config
 *   <li>POST /api/v1/admin/server/restart — schedule JVM exit (process manager restarts)
 * </ul>
 */
public final class AdminServerController {

    private static final Logger log = LoggerFactory.getLogger(AdminServerController.class);

    /** Properties that are exposed to the UI (subset to avoid exposing internal keys). */
    private static final Set<String> EXPOSED_KEYS =
            Set.of(
                    "scalar.db.storage",
                    "scalar.db.contact_points",
                    "scalar.db.username",
                    "scalar.db.password",
                    "scalar.db.transaction_manager",
                    "scalar.db.jdbc.connection_pool.min_idle",
                    "scalar.db.jdbc.connection_pool.max_idle",
                    "scalar.db.jdbc.connection_pool.max_total");

    private static final long RESTART_COOLDOWN_MS = 60_000; // 1 minute between restarts

    private final Path propsPath;
    private final AtomicLong lastRestartRequestMs = new AtomicLong(0);

    public AdminServerController(Path propsPath) {
        this.propsPath = propsPath;
    }

    /** GET /api/v1/admin/server-config — return current properties (password masked). */
    public void getConfig(Context ctx) {

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
            log.error("Failed to read server config", e);
            ApiError.respond(
                    ctx, HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "サーバー設定の読み込みに失敗しました");
        }
    }

    /** PUT /api/v1/admin/server-config — write properties (atomically). */
    public void putConfig(Context ctx) {

        try {
            @SuppressWarnings("unchecked")
            Map<String, String> incoming = ctx.bodyAsClass(Map.class);
            Properties props = mergeIncoming(incoming);
            saveProps(props);
            log.info("Admin updated server config");
            ctx.json(
                    Map.of(
                            "message",
                            "Config saved. Restart the server to apply.",
                            "code",
                            "CONFIG_SAVED"));
        } catch (IOException e) {
            log.error("Failed to write server config", e);
            ApiError.respond(
                    ctx, HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "サーバー設定の保存に失敗しました");
        }
    }

    /**
     * POST /api/v1/admin/server-config/test — test ScalarDB connection with given config. Accepts
     * same body as PUT. Creates a temporary TransactionFactory to test connectivity.
     */
    public void testConfig(Context ctx) {

        try {
            @SuppressWarnings("unchecked")
            Map<String, String> incoming = ctx.bodyAsClass(Map.class);
            Properties props = mergeIncoming(incoming);

            // Try to create a factory — if it succeeds, connection is valid
            com.scalar.db.service.TransactionFactory.create(props);

            ctx.json(
                    Map.of(
                            "success",
                            true,
                            "message",
                            "接続テスト成功",
                            "code",
                            "CONNECTION_TEST_SUCCESS"));
            log.info("Admin server-config test: success");
        } catch (Exception e) {
            Principal principal = ctx.attribute("principal");
            String userId = (principal != null) ? principal.userId() : "unknown";
            log.warn("Admin [{}] server-config test failed: {}", userId, e.getMessage());
            ctx.status(HttpStatus.BAD_GATEWAY);
            ctx.json(
                    Map.of(
                            "success",
                            false,
                            "message",
                            "接続テストに失敗しました。サーバーログを確認してください。",
                            "code",
                            "CONNECTION_TEST_FAILED"));
        }
    }

    /**
     * POST /api/v1/admin/server/restart — schedule graceful JVM exit after 2s. The process manager
     * (gradle, shell script) is expected to restart the server. Returns 200 before exiting.
     * Rate-limited to 1 request per minute.
     */
    public void restart(Context ctx) {

        long now = System.currentTimeMillis();
        long last = lastRestartRequestMs.get();
        if (now - last < RESTART_COOLDOWN_MS) {
            ApiError.respond(
                    ctx,
                    HttpStatus.TOO_MANY_REQUESTS,
                    "RATE_LIMITED",
                    "再起動は1分に1回までです。しばらくお待ちください。");
            return;
        }
        lastRestartRequestMs.set(now);

        Principal principal = ctx.attribute("principal");
        String userId = (principal != null) ? principal.userId() : "unknown";
        ctx.json(Map.of("message", "再起動中...サーバーが再起動するまでしばらくお待ちください。", "code", "RESTART_SCHEDULED"));
        log.warn("Admin [{}] requested server restart — exiting JVM in 2 seconds", userId);

        CompletableFuture.runAsync(
                () -> {
                    try {
                        Thread.sleep(2000);
                    } catch (InterruptedException ignored) {
                    }
                    System.exit(0);
                });
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    /**
     * Merge incoming config into current properties, skipping unknown keys and masked passwords.
     */
    private Properties mergeIncoming(Map<String, String> incoming) throws IOException {
        Properties props = loadProps();
        for (Map.Entry<String, String> entry : incoming.entrySet()) {
            String key = entry.getKey();
            String value = entry.getValue();
            if (!EXPOSED_KEYS.contains(key)) continue;
            if (key.endsWith(".password") && "***".equals(value)) continue;
            props.setProperty(key, value);
        }
        return props;
    }

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
        Files.move(
                tmp,
                propsPath,
                StandardCopyOption.REPLACE_EXISTING,
                StandardCopyOption.ATOMIC_MOVE);
    }
}

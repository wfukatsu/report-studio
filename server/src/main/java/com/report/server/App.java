package com.report.server;

import io.javalin.Javalin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Report Design Studio — local development server entry point.
 *
 * <p>Startup sequence:
 *
 * <ol>
 *   <li>{@link AppConfig} — port resolution, data directory, ScalarDB factory
 *   <li>{@link AppWiring} — repository + controller instantiation
 *   <li>{@link ApiRoutes} — middleware and route registration
 * </ol>
 */
public final class App {

    private static final Logger log = LoggerFactory.getLogger(App.class);

    private App() {}

    public static void main(String[] args) {
        int port = AppConfig.resolvePort(args);
        AppConfig.ensureDataDir();

        AppWiring wiring;
        try {
            var factory = AppConfig.createTransactionFactory();
            wiring = new AppWiring(factory);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to initialize server infrastructure", e);
        }

        Javalin app =
                Javalin.create(
                        config -> {
                            AppConfig.configure(config);
                            ApiRoutes.register(config, wiring, port);
                            config.events.serverStopping(wiring::shutdown);
                        });

        app.start(port);
        log.info("Server started on port {}", port);
    }
}

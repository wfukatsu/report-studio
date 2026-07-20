package com.report.server;

import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Reusable GET/PUT handler for JSON blob endpoints. */
public final class GenericJsonController {

    private static final Logger log = LoggerFactory.getLogger(GenericJsonController.class);

    private final JsonBlobRepository repo;
    private final String resourceName;
    private final String emptyResponse;

    public GenericJsonController(
            JsonBlobRepository repo, String resourceName, String emptyResponse) {
        this.repo = repo;
        this.resourceName = resourceName;
        this.emptyResponse = emptyResponse;
    }

    /** GET /{id} */
    public void get(Context ctx) {
        String id = RequestValidator.validateId(ctx);
        if (id == null) return;

        Optional<String> json = repo.get(id);
        ctx.status(HttpStatus.OK);
        ctx.contentType("application/json");
        ctx.result(json.orElse(emptyResponse));
    }

    /** PUT /{id} */
    public void put(Context ctx) {
        String id = RequestValidator.validateId(ctx);
        if (id == null) return;

        String body = ctx.body();
        if (!RequestValidator.validateJson(ctx, body)) return;

        repo.put(id, body);
        log.info("Saved {} for id: {}", resourceName, id);

        ctx.status(HttpStatus.OK);
        ctx.json(Map.of("status", "saved", "id", id));
    }
}

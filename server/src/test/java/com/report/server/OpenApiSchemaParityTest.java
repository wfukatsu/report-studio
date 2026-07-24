package com.report.server;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLMapper;
import com.report.server.auth.Principal;
import com.report.server.auth.RateLimiter;
import com.report.server.job.JobController;
import com.report.server.job.JobRecord;
import com.report.server.job.JobRepository;
import com.report.server.testsupport.InMemoryJobStore;
import io.javalin.Javalin;
import io.javalin.testtools.JavalinTest;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/**
 * Schema-level OpenAPI parity for the main resources (#275): templates, responses, pdf-jobs,
 * schemas.
 *
 * <p>{@link OpenApiRouteParityTest} guarantees method+path parity; this test goes one level deeper
 * for the primary resources. It spins up a real Javalin server wired with the real controllers
 * (repositories mocked, same idiom as the controller unit tests), exercises each operation over
 * HTTP, and validates the actual JSON response against the response schema declared in {@code
 * docs/openapi.yaml}: declared status code presence, required properties, and property types.
 * Deliberately hand-rolled (required/type depth only) — the spec is hand-written and the code is
 * the source of truth, so a full JSON-Schema validator is overkill.
 */
class OpenApiSchemaParityTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Principal USER =
            new Principal("user-1", "Test User", java.util.Set.of("user"));

    private static final String TEMPLATE_ENVELOPE =
            """
            {"id":"tmpl-1","name":"テスト帳票","created_at":1000,"updated_at":2000,
             "created_by":"user-1","visibility":"private","definition":{"pages":[]}}
            """;
    private static final String RESPONSE_JSON =
            """
            {"id":"resp-1","templateId":"tmpl-1","submittedAt":1000,"submittedBy":"user-1",
             "status":"issued","data":{"customer":"評価商事"}}
            """;
    private static final String SCHEMA_ENVELOPE =
            """
            {"id":"sch-1","name":"スキーマ","created_at":1000,"updated_at":2000,
             "created_by":"user-1","visibility":"private","definition":{"groups":[]}}
            """;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @AfterEach
    void tearDown() {
        executor.shutdownNow();
    }

    /** One exercised operation: spec lookup key + concrete request + expected status. */
    private record Case(
            String method, String specPath, String requestPath, Map<String, ?> body, int status) {}

    private static final List<Case> CASES =
            List.of(
                    // templates
                    new Case("get", "/api/v2/templates", "/api/v2/templates", null, 200),
                    new Case(
                            "post",
                            "/api/v2/templates",
                            "/api/v2/templates",
                            Map.of("name", "新規帳票"),
                            201),
                    new Case(
                            "get", "/api/v2/templates/{id}", "/api/v2/templates/tmpl-1", null, 200),
                    new Case(
                            "get",
                            "/api/v2/templates/{id}",
                            "/api/v2/templates/tmpl-missing",
                            null,
                            404),
                    // template responses
                    new Case(
                            "get",
                            "/api/v2/templates/{id}/responses",
                            "/api/v2/templates/tmpl-1/responses",
                            null,
                            200),
                    new Case(
                            "post",
                            "/api/v2/templates/{id}/responses",
                            "/api/v2/templates/tmpl-1/responses",
                            Map.of("data", Map.of("customer", "評価商事")),
                            201),
                    new Case(
                            "get",
                            "/api/v2/templates/{id}/responses/{rid}",
                            "/api/v2/templates/tmpl-1/responses/resp-1",
                            null,
                            200),
                    // schemas
                    new Case("get", "/api/v2/schemas", "/api/v2/schemas", null, 200),
                    new Case(
                            "post",
                            "/api/v2/schemas",
                            "/api/v2/schemas",
                            Map.of("name", "新スキーマ", "definition", Map.of("groups", List.of())),
                            201),
                    new Case("get", "/api/v2/schemas/{id}", "/api/v2/schemas/sch-1", null, 200),
                    new Case(
                            "get",
                            "/api/v2/schemas/{id}",
                            "/api/v2/schemas/sch-missing",
                            null,
                            404),
                    // pdf-jobs
                    new Case("get", "/api/v2/pdf-jobs", "/api/v2/pdf-jobs", null, 200),
                    new Case(
                            "post",
                            "/api/v2/pdf-jobs",
                            "/api/v2/pdf-jobs",
                            Map.of("templateId", "tmpl-1"),
                            202),
                    new Case(
                            "get",
                            "/api/v2/pdf-jobs/{jobId}",
                            "/api/v2/pdf-jobs/pjob-seeded",
                            null,
                            200),
                    new Case(
                            "get",
                            "/api/v2/pdf-jobs/{jobId}",
                            "/api/v2/pdf-jobs/pjob-unknown",
                            null,
                            404));

    // ── App wiring (real controllers, mocked repositories) ───────────────────

    private Javalin buildApp() throws Exception {
        JsonBlobRepository definitionsRepo = mock(JsonBlobRepository.class);
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(TEMPLATE_ENVELOPE));
        when(definitionsRepo.get("tmpl-missing")).thenReturn(Optional.empty());
        when(definitionsRepo.list()).thenReturn(List.of(TEMPLATE_ENVELOPE));

        JsonBlobRepository responseRepo = mock(JsonBlobRepository.class);
        when(responseRepo.listByGroupKey("tmpl-1")).thenReturn(List.of(RESPONSE_JSON));
        when(responseRepo.get("resp-1")).thenReturn(Optional.of(RESPONSE_JSON));

        JsonBlobRepository schemaRepo = mock(JsonBlobRepository.class);
        when(schemaRepo.listByGroupKey("user-1")).thenReturn(List.of(SCHEMA_ENVELOPE));
        when(schemaRepo.list()).thenReturn(List.of(SCHEMA_ENVELOPE));
        when(schemaRepo.get("sch-1")).thenReturn(Optional.of(SCHEMA_ENVELOPE));
        when(schemaRepo.get("sch-missing")).thenReturn(Optional.empty());

        RateLimiter submitLimiter = mock(RateLimiter.class);
        when(submitLimiter.isAllowed(anyString())).thenReturn(true);

        TemplateController templateCtrl = new TemplateController(definitionsRepo);
        FormResponseController formResponseCtrl =
                new FormResponseController(
                        responseRepo,
                        definitionsRepo,
                        submitLimiter,
                        mock(DocumentNumberService.class),
                        mock(WebhookDispatchService.class),
                        mock(StatusAuditRepository.class));
        SchemaLibraryController schemaCtrl = new SchemaLibraryController(schemaRepo);

        InMemoryJobStore jobStore = new InMemoryJobStore();
        jobStore.save(
                JobRecord.create("pjob-seeded", "tmpl-1", JobRecord.TYPE_V2_PDF, "user-1", 1, 0));
        PdfJobController pdfJobCtrl = new PdfJobController(definitionsRepo, jobStore, executor);

        JobRepository jobRepo = mock(JobRepository.class);
        when(jobRepo.listAll())
                .thenReturn(
                        List.of(
                                new JobRecord(
                                        "job-1",
                                        "tmpl-1",
                                        JobRecord.COMPLETED,
                                        10,
                                        9,
                                        1,
                                        null,
                                        1000L,
                                        2000L,
                                        3000L)));
        JobController jobCtrl =
                new JobController(
                        jobRepo, mock(com.report.server.job.BatchPdfProcessor.class), executor);

        return Javalin.create(
                config -> {
                    config.routes.before("/api/*", ctx -> ctx.attribute("principal", USER));
                    // Same registrations as ApiRoutes.java for the covered resources
                    config.routes.get("/api/v2/templates", templateCtrl::list);
                    config.routes.post("/api/v2/templates", templateCtrl::create);
                    config.routes.get("/api/v2/templates/{id}", templateCtrl::get);
                    config.routes.get("/api/v2/templates/{id}/responses", formResponseCtrl::list);
                    config.routes.post(
                            "/api/v2/templates/{id}/responses", formResponseCtrl::submit);
                    config.routes.get(
                            "/api/v2/templates/{id}/responses/{rid}", formResponseCtrl::get);
                    config.routes.get("/api/v2/schemas", schemaCtrl::list);
                    config.routes.post("/api/v2/schemas", schemaCtrl::create);
                    config.routes.get("/api/v2/schemas/{id}", schemaCtrl::get);
                    config.routes.get("/api/v2/pdf-jobs", jobCtrl::listUnified);
                    config.routes.post("/api/v2/pdf-jobs", pdfJobCtrl::submit);
                    config.routes.get("/api/v2/pdf-jobs/{jobId}", pdfJobCtrl::getStatus);
                });
    }

    // ── The test ─────────────────────────────────────────────────────────────

    @Test
    void actualResponsesMatchDeclaredSchemas() throws Exception {
        Path specFile = Path.of("../docs/openapi.yaml");
        assertTrue(Files.exists(specFile), "docs/openapi.yaml not found");
        JsonNode spec = new YAMLMapper().readTree(specFile.toFile());

        List<String> failures = new ArrayList<>();

        JavalinTest.test(
                buildApp(),
                (server, client) -> {
                    for (Case c : CASES) {
                        io.javalin.testtools.Response resp =
                                switch (c.method()) {
                                    case "get" -> client.get(c.requestPath());
                                    case "post" -> client.post(c.requestPath(), c.body());
                                    default ->
                                            throw new IllegalStateException(
                                                    "unsupported method " + c.method());
                                };
                        String caseId = c.method().toUpperCase() + " " + c.requestPath();
                        if (resp.code() != c.status()) {
                            failures.add(
                                    caseId
                                            + ": expected HTTP "
                                            + c.status()
                                            + " got "
                                            + resp.code());
                            continue;
                        }

                        // 1. The status code must be declared in the spec
                        JsonNode operation = spec.path("paths").path(c.specPath()).path(c.method());
                        if (operation.isMissingNode()) {
                            failures.add(caseId + ": operation missing from openapi.yaml");
                            continue;
                        }
                        JsonNode response =
                                resolveRef(
                                        spec,
                                        operation
                                                .path("responses")
                                                .path(String.valueOf(c.status())));
                        if (response.isMissingNode()) {
                            failures.add(
                                    caseId
                                            + ": status "
                                            + c.status()
                                            + " not declared in openapi.yaml");
                            continue;
                        }

                        // 2. The body must satisfy the declared schema
                        JsonNode schema =
                                resolveRef(
                                        spec,
                                        response.path("content")
                                                .path("application/json")
                                                .path("schema"));
                        if (schema.isMissingNode()) {
                            failures.add(
                                    caseId
                                            + ": no application/json schema declared for status "
                                            + c.status());
                            continue;
                        }
                        JsonNode body = MAPPER.readTree(resp.body().string());
                        validate(spec, schema, body, caseId + " $", failures);
                    }
                });

        assertTrue(
                failures.isEmpty(),
                "OpenAPI schema parity violations:\n  " + String.join("\n  ", failures));
    }

    // ── Hand-rolled required/type validation ─────────────────────────────────

    /** Follows a local {@code $ref} ("#/...") if present; otherwise returns the node itself. */
    private static JsonNode resolveRef(JsonNode spec, JsonNode node) {
        if (node.has("$ref")) {
            String ref = node.get("$ref").asText();
            assertTrue(ref.startsWith("#/"), "only local refs supported: " + ref);
            return spec.at(ref.substring(1));
        }
        return node;
    }

    private static void validate(
            JsonNode spec, JsonNode schema, JsonNode node, String loc, List<String> failures) {
        schema = resolveRef(spec, schema);
        String type = schema.path("type").asText("");
        switch (type) {
            case "object" -> {
                if (!node.isObject()) {
                    failures.add(loc + ": expected object, got " + node.getNodeType());
                    return;
                }
                for (JsonNode required : schema.path("required")) {
                    if (!node.has(required.asText())) {
                        failures.add(
                                loc + ": missing required property '" + required.asText() + "'");
                    }
                }
                JsonNode props = schema.path("properties");
                props.fieldNames()
                        .forEachRemaining(
                                name -> {
                                    if (node.has(name) && !node.get(name).isNull()) {
                                        validate(
                                                spec,
                                                props.get(name),
                                                node.get(name),
                                                loc + "." + name,
                                                failures);
                                    }
                                });
            }
            case "array" -> {
                if (!node.isArray()) {
                    failures.add(loc + ": expected array, got " + node.getNodeType());
                    return;
                }
                JsonNode items = schema.path("items");
                if (!items.isMissingNode()) {
                    int i = 0;
                    for (JsonNode element : node) {
                        validate(spec, items, element, loc + "[" + i++ + "]", failures);
                    }
                }
            }
            case "string" -> {
                if (!node.isTextual()) {
                    failures.add(loc + ": expected string, got " + node.getNodeType());
                }
            }
            case "integer" -> {
                if (!node.isIntegralNumber()) {
                    failures.add(loc + ": expected integer, got " + node.getNodeType());
                }
            }
            case "number" -> {
                if (!node.isNumber()) {
                    failures.add(loc + ": expected number, got " + node.getNodeType());
                }
            }
            case "boolean" -> {
                if (!node.isBoolean()) {
                    failures.add(loc + ": expected boolean, got " + node.getNodeType());
                }
            }
            default -> {
                // untyped schema — nothing to check at this depth
            }
        }
    }
}

package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.dataformat.yaml.YAMLMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Iterator;
import java.util.Map;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * Guards the hand-authored OpenAPI spec against drift (#225).
 *
 * <p>{@code ApiRoutes.java} is the authoritative route registration. This test extracts every
 * {@code app.<verb>("/path", …)} it registers and every operation declared in {@code
 * docs/openapi.yaml}, then asserts the two sets are identical. Adding a route without documenting
 * it (or documenting a route that no longer exists) fails CI — so the machine-readable API surface
 * that external PAT clients rely on stays truthful.
 */
class OpenApiRouteParityTest {

    // Matches config.routes.get("/x", …) / config.routes.post(...) etc. in ApiRoutes.java.
    private static final Pattern ROUTE =
            Pattern.compile("config\\.routes\\.(get|post|put|delete|patch)\\(\\s*\"([^\"]+)\"");

    /** Resolve a repo file from the server/ working dir (gradle test default). */
    private static Path repoFile(String relativeToServer) {
        Path p = Path.of(relativeToServer);
        assertTrue(Files.exists(p), () -> "Expected file not found: " + p.toAbsolutePath());
        return p;
    }

    private TreeSet<String> routesFromApiRoutes() throws IOException {
        String src = Files.readString(repoFile("src/main/java/com/report/server/ApiRoutes.java"));
        TreeSet<String> out = new TreeSet<>();
        Matcher m = ROUTE.matcher(src);
        while (m.find()) {
            out.add(m.group(1).toUpperCase() + " " + m.group(2));
        }
        return out;
    }

    private TreeSet<String> operationsFromSpec() throws IOException {
        JsonNode root = new YAMLMapper().readTree(repoFile("../docs/openapi.yaml").toFile());
        JsonNode paths = root.get("paths");
        assertNotNull(paths, "openapi.yaml must have a top-level 'paths'");
        TreeSet<String> out = new TreeSet<>();
        Iterator<Map.Entry<String, JsonNode>> pathIt = paths.fields();
        while (pathIt.hasNext()) {
            Map.Entry<String, JsonNode> pathEntry = pathIt.next();
            String path = pathEntry.getKey();
            Iterator<String> methodIt = pathEntry.getValue().fieldNames();
            while (methodIt.hasNext()) {
                String method = methodIt.next();
                if (isHttpMethod(method)) {
                    out.add(method.toUpperCase() + " " + path);
                }
            }
        }
        return out;
    }

    private static boolean isHttpMethod(String key) {
        return switch (key) {
            case "get", "post", "put", "delete", "patch" -> true;
            default -> false; // e.g. "parameters", "summary"
        };
    }

    @Test
    void everyRegisteredRouteIsDocumented() throws IOException {
        TreeSet<String> routes = routesFromApiRoutes();
        TreeSet<String> documented = operationsFromSpec();

        TreeSet<String> undocumented = new TreeSet<>(routes);
        undocumented.removeAll(documented);
        assertTrue(
                undocumented.isEmpty(),
                "Routes registered in ApiRoutes.java but missing from docs/openapi.yaml:\n  "
                        + String.join("\n  ", undocumented));
    }

    @Test
    void everyDocumentedOperationExistsAsARoute() throws IOException {
        TreeSet<String> routes = routesFromApiRoutes();
        TreeSet<String> documented = operationsFromSpec();

        TreeSet<String> phantom = new TreeSet<>(documented);
        phantom.removeAll(routes);
        assertTrue(
                phantom.isEmpty(),
                "Operations in docs/openapi.yaml with no matching route in ApiRoutes.java:\n  "
                        + String.join("\n  ", phantom));
    }

    @Test
    void sanityCheck_bothSidesAreNonTrivial() throws IOException {
        // Guard against a broken extractor silently comparing two empty sets.
        assertTrue(routesFromApiRoutes().size() > 50, "expected many routes");
        assertEquals(
                routesFromApiRoutes().size(),
                operationsFromSpec().size(),
                "route count and documented-operation count must match exactly");
    }
}

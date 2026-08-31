package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * Guards against a path-parameter route swallowing a literal route registered after it.
 *
 * <p>Javalin matches handlers in registration order, so {@code POST /api/v2/templates/{id}}
 * registered before {@code POST /api/v2/templates/import} makes the import endpoint unreachable —
 * every import silently became "PUT the template whose id is the string {@code import}", creating a
 * bogus template instead of importing one. Nothing failed: the client got 200 and a template back.
 *
 * <p>This is a whole class of bug rather than one incident, and it is invisible in {@link
 * OpenApiRouteParityTest} (both routes exist and are documented), so it is pinned here at the
 * source level: for each verb, no earlier parameterized path may match a later literal path.
 */
class RouteShadowingTest {

    private static final Pattern ROUTE =
            Pattern.compile("config\\.routes\\.(get|post|put|delete|patch)\\(\\s*\"([^\"]+)\"");

    private record Route(String verb, String path, String[] segments) {}

    private static Route route(String verb, String path) {
        return new Route(verb, path, path.split("/"));
    }

    private List<Route> routesInRegistrationOrder() throws IOException {
        Path file = Path.of("src/main/java/com/report/server/ApiRoutes.java");
        assertTrue(Files.exists(file), () -> "Not found: " + file.toAbsolutePath());
        List<Route> routes = new ArrayList<>();
        Matcher m = ROUTE.matcher(Files.readString(file));
        while (m.find()) {
            String path = m.group(2);
            routes.add(new Route(m.group(1).toUpperCase(), path, path.split("/")));
        }
        assertFalse(routes.isEmpty(), "No routes parsed — has the registration style changed?");
        return routes;
    }

    private static boolean isParam(String segment) {
        return segment.startsWith("{") && segment.endsWith("}");
    }

    /**
     * True when {@code earlier} would capture a request aimed at {@code later}: same segment count,
     * and every earlier segment is either a parameter or textually identical.
     */
    private static boolean shadows(Route earlier, Route later) {
        if (!earlier.verb().equals(later.verb())) return false;
        if (earlier.segments().length != later.segments().length) return false;
        boolean laterIsMoreSpecific = false;
        for (int i = 0; i < earlier.segments().length; i++) {
            String a = earlier.segments()[i];
            String b = later.segments()[i];
            if (isParam(a)) {
                // A parameter swallows a literal; two parameters are the same route shape.
                if (!isParam(b)) laterIsMoreSpecific = true;
            } else if (!a.equals(b)) {
                return false;
            }
        }
        return laterIsMoreSpecific;
    }

    @Test
    void noLiteralRouteIsShadowedByAnEarlierParameterizedRoute() throws IOException {
        List<Route> routes = routesInRegistrationOrder();
        List<String> violations = new ArrayList<>();
        for (int later = 0; later < routes.size(); later++) {
            for (int earlier = 0; earlier < later; earlier++) {
                if (shadows(routes.get(earlier), routes.get(later))) {
                    violations.add(
                            routes.get(later).verb()
                                    + " "
                                    + routes.get(later).path()
                                    + " is unreachable — shadowed by the earlier "
                                    + routes.get(earlier).path()
                                    + ". Register the literal path first.");
                }
            }
        }
        assertTrue(violations.isEmpty(), String.join("\n", violations));
    }

    @Test
    void theImportRouteIsRegisteredAheadOfTheTemplateIdRoute() throws IOException {
        List<Route> routes = routesInRegistrationOrder();
        int importIdx = -1;
        int paramIdx = -1;
        for (int i = 0; i < routes.size(); i++) {
            Route r = routes.get(i);
            if (!r.verb().equals("POST")) continue;
            if (r.path().equals("/api/v2/templates/import")) importIdx = i;
            if (r.path().equals("/api/v2/templates/{id}")) paramIdx = i;
        }
        assertTrue(importIdx >= 0, "POST /api/v2/templates/import is no longer registered");
        assertTrue(paramIdx >= 0, "POST /api/v2/templates/{id} is no longer registered");
        assertTrue(
                importIdx < paramIdx,
                "POST /api/v2/templates/import must be registered before /{id}, or imports"
                        + " silently become a PUT of a template literally named 'import'");
    }

    /** The detector itself must actually detect — otherwise the guard is decorative. */
    @Test
    void shadowDetectionRecognizesTheKnownBadOrdering() {
        Route param = route("POST", "/api/v2/templates/{id}");
        Route literal = route("POST", "/api/v2/templates/import");
        assertTrue(shadows(param, literal), "a parameter route must shadow a literal one");
        assertFalse(shadows(literal, param), "shadowing is directional");
    }

    @Test
    void shadowDetectionIgnoresDifferentVerbsAndDepths() {
        assertFalse(
                shadows(
                        route("GET", "/api/v2/templates/{id}"),
                        route("POST", "/api/v2/templates/import")),
                "different verbs cannot shadow each other");
        assertFalse(
                shadows(
                        route("GET", "/api/v2/templates/{id}"),
                        route("GET", "/api/v2/templates/{id}/export")),
                "different segment counts cannot shadow each other");
    }
}

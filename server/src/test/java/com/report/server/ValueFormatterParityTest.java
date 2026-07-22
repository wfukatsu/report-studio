package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;

/**
 * Front&lt;-&gt;server formatter parity (#329 Phase 4).
 *
 * <p>Loads the SAME {@code src/lib/formatGolden.json} as the frontend
 * {@code src/lib/numberFormatter.parity.test.ts} and asserts
 * {@link ValueFormatter#applyFormat(JsonNode, JsonNode)} equals {@code expected} for every case.
 * A single shared fixture (instead of two hand-mirrored test files) means any drift between the TS
 * and Java formatters fails on exactly one side and is caught before it can break preview/PDF
 * parity (#311-#325).
 *
 * <p>Date cases use a local {@code T00:00:00} form so both runtimes resolve the same civil date
 * regardless of timezone.
 */
class ValueFormatterParityTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** Walk up from the test working dir (the module dir under Gradle) to the repo root. */
    private static Path locateFixture() {
        Path dir = Path.of("").toAbsolutePath();
        for (int i = 0; i < 6 && dir != null; i++) {
            Path candidate = dir.resolve("src/lib/formatGolden.json");
            if (Files.exists(candidate)) return candidate;
            dir = dir.getParent();
        }
        throw new IllegalStateException(
                "formatGolden.json not found starting from " + Path.of("").toAbsolutePath());
    }

    @TestFactory
    Stream<DynamicTest> matchesSharedGoldenFixture() throws IOException {
        JsonNode root = MAPPER.readTree(Files.readString(locateFixture()));
        List<DynamicTest> tests = new ArrayList<>();
        for (JsonNode c : root.get("cases")) {
            String name = c.get("name").asText();
            JsonNode value = c.get("value");
            JsonNode format = c.get("format");
            String expected = c.get("expected").asText();
            tests.add(
                    DynamicTest.dynamicTest(
                            "applyFormat: " + name,
                            () -> assertEquals(expected, ValueFormatter.applyFormat(value, format), name)));
        }
        assertTrue(tests.size() > 20, "expected many parity cases");
        return tests.stream();
    }
}

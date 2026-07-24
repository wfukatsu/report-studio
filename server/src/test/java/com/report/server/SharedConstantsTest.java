package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/**
 * #425: pins {@link SharedConstants} to the cross-language single source at {@code
 * schemas/shared-constants.json} (imported directly by the frontend). Same repo-root relative
 * fixture pattern as TaxRatesTest.
 */
class SharedConstantsTest {

    @Test
    void constantsMatchSharedJson() throws Exception {
        Path fixture = Path.of("..", "schemas", "shared-constants.json");
        assertTrue(Files.exists(fixture), "shared fixture must exist: " + fixture);
        JsonNode json = new ObjectMapper().readTree(Files.readString(fixture));

        assertEquals(
                json.path("systemGroupProductMaster").asText(),
                SharedConstants.SYSTEM_GROUP_PRODUCT_MASTER);
        assertEquals(
                json.path("dbIdentifierPattern").asText(), SharedConstants.DB_IDENTIFIER_PATTERN);
    }

    @Test
    void identifierPatternBehaviour() {
        assertTrue(SharedConstants.DB_IDENTIFIER.matcher("customer_name").matches());
        assertTrue(SharedConstants.DB_IDENTIFIER.matcher("_private").matches());
        assertFalse(SharedConstants.DB_IDENTIFIER.matcher("1starts_with_digit").matches());
        assertFalse(SharedConstants.DB_IDENTIFIER.matcher("has-hyphen").matches());
        assertFalse(SharedConstants.DB_IDENTIFIER.matcher("").matches());
    }
}

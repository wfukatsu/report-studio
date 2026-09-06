package com.report.server.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** Stored-JSON compatibility for the #499 fields on {@link UserRecord}. */
class UserRecordJsonTest {

    private static final ObjectMapper M = new ObjectMapper();

    @Test
    void legacyRecordWithoutProviderReadsAsLocal() throws Exception {
        UserRecord u =
                M.readValue(
                        "{\"userId\":\"admin\",\"displayName\":\"A\",\"passwordHash\":\"h\",\"roles\":[\"admin\"]}",
                        UserRecord.class);
        assertEquals(UserRecord.PROVIDER_LOCAL, u.provider());
        assertNull(u.externalId());
        assertTrue(u.hasPassword());
        assertFalse(u.isOidc());
    }

    @Test
    void oidcRecordRoundTrips() throws Exception {
        UserRecord in =
                new UserRecord(
                        "alice", "Alice", null, Set.of("user"), UserRecord.PROVIDER_OIDC, "s");
        UserRecord out = M.readValue(M.writeValueAsString(in), UserRecord.class);
        assertEquals(in, out);
        assertFalse(out.hasPassword());
        assertTrue(out.isOidc());
    }

    @Test
    void repositoryMapperIgnoresUnknownFieldsForForwardCompatibility() throws Exception {
        // A record written by a newer server (extra field) must still load (L: rollback safety)
        UserRecord u =
                UserRepository.MAPPER.readValue(
                        "{\"userId\":\"admin\",\"displayName\":\"A\",\"passwordHash\":\"h\","
                                + "\"roles\":[\"admin\"],\"futureField\":42}",
                        UserRecord.class);
        assertEquals("admin", u.userId());
    }
}

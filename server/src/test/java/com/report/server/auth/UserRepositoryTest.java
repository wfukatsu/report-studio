package com.report.server.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.report.server.JsonBlobRepository;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Tests for {@link UserRepository#ensureDefaultUser(String)} — the admin bootstrap must never
 * silently reset a password that was changed from the admin UI (issue #70 security audit).
 */
class UserRepositoryTest {

    private static final String EXISTING_ADMIN_JSON =
            "{\"userId\":\"admin\",\"displayName\":\"管理者\","
                    + "\"passwordHash\":\"$2a$12$existinghash\",\"roles\":[\"admin\",\"user\"]}";

    private JsonBlobRepository blob;
    private UserRepository repo;

    @BeforeEach
    void setUp() {
        blob = mock(JsonBlobRepository.class);
        repo = new UserRepository(blob);
    }

    @Test
    void createsAdminWithDefaultPasswordWhenAbsentAndNoEnv() throws Exception {
        when(blob.get("admin")).thenReturn(Optional.empty());

        repo.ensureDefaultUser(null);

        verify(blob).put(eq("admin"), anyString());
    }

    @Test
    void createsAdminWithEnvPasswordWhenAbsent() throws Exception {
        when(blob.get("admin")).thenReturn(Optional.empty());

        repo.ensureDefaultUser("s3cure-Passw0rd!");

        verify(blob).put(eq("admin"), anyString());
    }

    @Test
    void leavesExistingAdminUntouchedWhenNoEnvPassword() throws Exception {
        when(blob.get("admin")).thenReturn(Optional.of(EXISTING_ADMIN_JSON));

        repo.ensureDefaultUser(null);

        verify(blob, never()).put(any(), any());
    }

    @Test
    void leavesExistingAdminUntouchedWhenEnvPasswordBlank() throws Exception {
        when(blob.get("admin")).thenReturn(Optional.of(EXISTING_ADMIN_JSON));

        repo.ensureDefaultUser("   ");

        verify(blob, never()).put(any(), any());
    }

    @Test
    void resetsExistingAdminPasswordWhenEnvPasswordSet() throws Exception {
        when(blob.get("admin")).thenReturn(Optional.of(EXISTING_ADMIN_JSON));

        repo.ensureDefaultUser("recovery-Passw0rd!");

        verify(blob).put(eq("admin"), anyString());
    }

    // ── #499 (review M2 / M9) ────────────────────────────────────────────────

    @Test
    void findByExternalIdScansOnceAcrossProvidersAndSkipsLegacyRecords() {
        when(blob.list())
                .thenReturn(
                        java.util.List.of(
                                EXISTING_ADMIN_JSON, // legacy: no provider / externalId
                                "{\"userId\":\"alice\",\"displayName\":\"A\",\"passwordHash\":\"h\","
                                        + "\"roles\":[\"user\"],\"provider\":\"local\",\"externalId\":\"sub-a\"}",
                                "{\"userId\":\"bob\",\"displayName\":\"B\",\"passwordHash\":null,"
                                        + "\"roles\":[\"user\"],\"provider\":\"oidc\",\"externalId\":\"sub-b\"}"));
        assertEquals("alice", repo.findByExternalId("sub-a").orElseThrow().userId());
        assertEquals("bob", repo.findByExternalId("sub-b").orElseThrow().userId());
        assertTrue(repo.findByExternalId("sub-zzz").isEmpty());
        assertTrue(repo.findByExternalId(null).isEmpty());
        verify(blob, times(3)).list();
    }

    @Test
    void saveOrThrowPropagatesStoreFailuresWhileSaveStaysLenient() {
        org.mockito.Mockito.doThrow(new JsonBlobRepository.RepositoryException("down", null))
                .when(blob)
                .put(
                        org.mockito.ArgumentMatchers.eq("alice"),
                        org.mockito.ArgumentMatchers.anyString());
        UserRecord alice = new UserRecord("alice", "A", "h", Set.of("user"));
        repo.save(alice); // logs, does not throw (existing behaviour)
        org.junit.jupiter.api.Assertions.assertThrows(
                JsonBlobRepository.RepositoryException.class, () -> repo.saveOrThrow(alice));
    }
}

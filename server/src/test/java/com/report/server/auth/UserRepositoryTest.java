package com.report.server.auth;

import com.report.server.JsonBlobRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests for {@link UserRepository#ensureDefaultUser(String)} — the admin
 * bootstrap must never silently reset a password that was changed from the
 * admin UI (issue #70 security audit).
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
}

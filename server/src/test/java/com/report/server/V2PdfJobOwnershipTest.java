package com.report.server;

import com.report.server.auth.Principal;
import com.report.server.job.JobRecord;
import io.javalin.http.Context;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * Ownership checks for async PDF jobs (issue #58): a job submitted by an
 * authenticated user must not be visible to other users.
 */
class V2PdfJobOwnershipTest {

    private static JobRecord job(String owner) {
        return new JobRecord("pjob-1", "tpl-1", JobRecord.COMPLETED, 1, 1, 0, null,
                0L, 0L, 0L, JobRecord.TYPE_V2_PDF, owner, "/tmp/x.pdf", 0L);
    }

    private static Context ctxWith(Principal principal) {
        Context ctx = mock(Context.class);
        when(ctx.attribute("principal")).thenReturn(principal);
        return ctx;
    }

    private static Principal user(String id, String... roles) {
        Principal p = mock(Principal.class);
        when(p.userId()).thenReturn(id);
        when(p.isAnonymous()).thenReturn(false);
        when(p.roles()).thenReturn(Set.of(roles));
        return p;
    }

    @Test
    void ownerCanAccessOwnJob() {
        assertTrue(V2PdfJobController.canAccess(ctxWith(user("alice")), job("alice")));
    }

    @Test
    void otherUserCannotAccessJob() {
        assertFalse(V2PdfJobController.canAccess(ctxWith(user("mallory")), job("alice")));
    }

    @Test
    void anonymousCannotAccessOwnedJob() {
        assertFalse(V2PdfJobController.canAccess(ctxWith(null), job("alice")));
        Principal anon = mock(Principal.class);
        when(anon.isAnonymous()).thenReturn(true);
        assertFalse(V2PdfJobController.canAccess(ctxWith(anon), job("alice")));
    }

    @Test
    void adminCanAccessAnyJob() {
        assertTrue(V2PdfJobController.canAccess(ctxWith(user("root", "admin")), job("alice")));
    }

    @Test
    void anonymouslySubmittedJob_remainsAccessible() {
        // owner == null → auth-disabled deployments keep working
        assertTrue(V2PdfJobController.canAccess(ctxWith(null), job(null)));
    }
}

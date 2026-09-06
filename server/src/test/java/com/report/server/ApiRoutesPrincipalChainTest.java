package com.report.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.report.server.auth.AuthController;
import com.report.server.auth.Principal;
import com.report.server.auth.oidc.OidcController;
import io.javalin.http.Context;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * The before-filter's principal resolution order (#499): cookie session → Bearer PAT → Bearer OIDC
 * JWT — with JWT-shaped tokens skipping the PAT store lookup, and no OIDC step when OIDC is not
 * configured.
 */
class ApiRoutesPrincipalChainTest {

    private static final Principal SESSION = new Principal("s", "S", Set.of("user"));
    private static final Principal PAT = new Principal("p", "P", Set.of("user"));
    private static final Principal JWT =
            new Principal("j", "J", Set.of("user"), Principal.PROVIDER_OIDC);

    private AuthController authCtrl;
    private ApiTokenController patCtrl;
    private OidcController oidcCtrl;
    private Context ctx;

    @BeforeEach
    void setUp() {
        authCtrl = mock(AuthController.class);
        patCtrl = mock(ApiTokenController.class);
        oidcCtrl = mock(OidcController.class);
        ctx = mock(Context.class);
        when(authCtrl.resolveFromRequest(ctx)).thenReturn(Principal.ANONYMOUS);
        when(patCtrl.resolveFromBearer(ctx)).thenReturn(Principal.ANONYMOUS);
        when(oidcCtrl.resolveFromBearer(ctx)).thenReturn(Principal.ANONYMOUS);
    }

    @Test
    void sessionWinsWithoutConsultingBearer() {
        when(authCtrl.resolveFromRequest(ctx)).thenReturn(SESSION);
        assertEquals(SESSION, ApiRoutes.resolvePrincipal(ctx, authCtrl, patCtrl, oidcCtrl));
        verify(patCtrl, never()).resolveFromBearer(ctx);
        verify(oidcCtrl, never()).resolveFromBearer(ctx);
    }

    @Test
    void opaquePatIsResolvedByThePatStoreOnly() {
        when(ctx.header("Authorization")).thenReturn("Bearer rpat_abc");
        when(patCtrl.resolveFromBearer(ctx)).thenReturn(PAT);
        assertEquals(PAT, ApiRoutes.resolvePrincipal(ctx, authCtrl, patCtrl, oidcCtrl));
        verify(oidcCtrl, never()).resolveFromBearer(ctx);
    }

    @Test
    void jwtShapedTokenSkipsThePatLookupAndGoesToOidc() {
        when(ctx.header("Authorization")).thenReturn("Bearer aaa.bbb.ccc");
        when(oidcCtrl.resolveFromBearer(ctx)).thenReturn(JWT);
        assertEquals(JWT, ApiRoutes.resolvePrincipal(ctx, authCtrl, patCtrl, oidcCtrl));
        verify(patCtrl, never()).resolveFromBearer(ctx);
    }

    @Test
    void jwtIsIgnoredWhenOidcIsNotConfigured() {
        when(ctx.header("Authorization")).thenReturn("Bearer aaa.bbb.ccc");
        assertTrue(ApiRoutes.resolvePrincipal(ctx, authCtrl, patCtrl, null).isAnonymous());
        verify(patCtrl, never()).resolveFromBearer(ctx);
    }

    @Test
    void nothingMatchesIsAnonymous() {
        when(ctx.header("Authorization")).thenReturn("Bearer rpat_unknown");
        assertTrue(ApiRoutes.resolvePrincipal(ctx, authCtrl, patCtrl, oidcCtrl).isAnonymous());
    }
}

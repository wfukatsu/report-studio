package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.report.server.auth.Principal;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Base64;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class WebhookControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String KEY = Base64.getEncoder().encodeToString(new byte[32]);
    private static final String TEMPLATE_ID = "tpl-1";
    // Literal public IP — validateUrl resolves hostnames via DNS, which tests must avoid
    private static final String URL = "https://8.8.8.8/hook";

    private JsonBlobRepository repo;
    private WebhookDispatcher dispatcher;
    private SecretCrypto crypto;
    private WebhookController controller;
    private Context ctx;

    @BeforeEach
    void setUp() {
        repo = mock(JsonBlobRepository.class);
        dispatcher = mock(WebhookDispatcher.class);
        crypto = new SecretCrypto(KEY);
        controller = new WebhookController(repo, dispatcher, crypto);
        ctx = mock(Context.class);
        when(ctx.pathParam("templateId")).thenReturn(TEMPLATE_ID);
        when(ctx.attribute("principal")).thenReturn(new Principal("u1", "User One", Set.of("admin")));
    }

    private String capturePutJson() {
        ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
        verify(repo).put(eq(TEMPLATE_ID), captor.capture());
        return captor.getValue();
    }

    private String captureResult() {
        ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
        verify(ctx).result(captor.capture());
        return captor.getValue();
    }

    // ── PUT: save ─────────────────────────────────────────────────────────────

    @Test
    void putConfig_storesSecretEncrypted() throws Exception {
        when(ctx.body()).thenReturn("{\"url\":\"" + URL + "\",\"secret\":\"hook-secret-1234\"}");
        when(repo.get(TEMPLATE_ID)).thenReturn(Optional.empty());

        controller.putConfig(ctx);

        JsonNode saved = MAPPER.readTree(capturePutJson());
        String storedSecret = saved.path("secret").asText();
        assertTrue(SecretCrypto.isEncrypted(storedSecret), "secret must be stored encrypted");
        assertEquals("hook-secret-1234", crypto.decrypt(storedSecret));
        assertEquals(URL, saved.path("url").asText());
    }

    @Test
    void putConfig_withoutKey_storesPlaintext() throws Exception {
        controller = new WebhookController(repo, dispatcher, new SecretCrypto(null));
        when(ctx.body()).thenReturn("{\"secret\":\"hook-secret-1234\"}");
        when(repo.get(TEMPLATE_ID)).thenReturn(Optional.empty());

        controller.putConfig(ctx);

        JsonNode saved = MAPPER.readTree(capturePutJson());
        assertEquals("hook-secret-1234", saved.path("secret").asText());
    }

    @Test
    void putConfig_lazilyEncryptsLegacyPlaintextSecret() throws Exception {
        // Existing config from before encryption was introduced
        when(repo.get(TEMPLATE_ID)).thenReturn(
                Optional.of("{\"url\":\"" + URL + "\",\"secret\":\"legacy-plain\"}"));
        // Update that does not touch the secret
        when(ctx.body()).thenReturn("{\"url\":\"" + URL + "\"}");

        controller.putConfig(ctx);

        JsonNode saved = MAPPER.readTree(capturePutJson());
        String storedSecret = saved.path("secret").asText();
        assertTrue(SecretCrypto.isEncrypted(storedSecret), "legacy secret must be migrated on save");
        assertEquals("legacy-plain", crypto.decrypt(storedSecret));
    }

    @Test
    void putConfig_maskSentinelDoesNotOverwriteStoredSecret() throws Exception {
        String encrypted = crypto.encrypt("original-secret");
        when(repo.get(TEMPLATE_ID)).thenReturn(
                Optional.of("{\"url\":\"" + URL + "\",\"secret\":\"" + encrypted + "\"}"));
        when(ctx.body()).thenReturn("{\"url\":\"" + URL + "\",\"secret\":\"****\"}");

        controller.putConfig(ctx);

        JsonNode saved = MAPPER.readTree(capturePutJson());
        assertEquals("original-secret", crypto.decrypt(saved.path("secret").asText()));
    }

    @Test
    void putConfig_responseNeverExposesSecret() throws Exception {
        when(ctx.body()).thenReturn("{\"url\":\"" + URL + "\",\"secret\":\"hook-secret-1234\"}");
        when(repo.get(TEMPLATE_ID)).thenReturn(Optional.empty());

        controller.putConfig(ctx);

        String response = captureResult();
        assertFalse(response.contains("hook-secret-1234"), "plaintext secret leaked in response");
        assertFalse(response.contains("enc:v1:"), "ciphertext leaked in response");
        assertEquals("****", MAPPER.readTree(response).path("secret").asText());
    }

    @Test
    void putConfig_requiresAuthentication() throws Exception {
        when(ctx.attribute("principal")).thenReturn(null);

        controller.putConfig(ctx);

        verify(ctx).status(HttpStatus.UNAUTHORIZED);
        verify(repo, never()).put(anyString(), anyString());
    }

    // ── GET: read ─────────────────────────────────────────────────────────────

    @Test
    void getConfig_masksSecret() throws Exception {
        String encrypted = crypto.encrypt("hook-secret-1234");
        when(repo.get(TEMPLATE_ID)).thenReturn(
                Optional.of("{\"url\":\"" + URL + "\",\"secret\":\"" + encrypted + "\"}"));

        controller.getConfig(ctx);

        String response = captureResult();
        assertEquals("****", MAPPER.readTree(response).path("secret").asText());
        assertFalse(response.contains("hook-secret-1234"));
        assertFalse(response.contains("enc:v1:"));
        assertEquals(URL, MAPPER.readTree(response).path("url").asText());
    }

    @Test
    void getConfig_returnsNotConfiguredWhenMissing() throws Exception {
        when(repo.get(TEMPLATE_ID)).thenReturn(Optional.empty());

        controller.getConfig(ctx);

        verify(ctx).json(java.util.Map.of("configured", false));
    }

    // ── Dispatch: secret is decrypted for signing ─────────────────────────────

    @Test
    void testWebhook_decryptsSecretBeforeDispatch() throws Exception {
        String encrypted = crypto.encrypt("hook-secret-1234");
        when(repo.get(TEMPLATE_ID)).thenReturn(
                Optional.of("{\"url\":\"" + URL + "\",\"secret\":\"" + encrypted + "\"}"));

        controller.testWebhook(ctx);

        verify(dispatcher).dispatch(eq(URL), eq("hook-secret-1234"), anyString());
    }

    @Test
    void dispatchAsync_decryptsSecretBeforeDispatch() throws Exception {
        String encrypted = crypto.encrypt("hook-secret-1234");
        when(repo.get(TEMPLATE_ID)).thenReturn(
                Optional.of("{\"url\":\"" + URL + "\",\"secret\":\"" + encrypted + "\"}"));

        java.util.concurrent.ExecutorService direct = mock(java.util.concurrent.ExecutorService.class);
        doAnswer(inv -> { ((Runnable) inv.getArgument(0)).run(); return null; })
                .when(direct).execute(any(Runnable.class));

        controller.dispatchAsync(TEMPLATE_ID, "resp-1", "{\"data\":{}}", direct);

        verify(dispatcher).dispatch(eq(URL), eq("hook-secret-1234"), anyString());
    }

    @Test
    void dispatchAsync_legacyPlaintextSecretStillWorks() throws Exception {
        when(repo.get(TEMPLATE_ID)).thenReturn(
                Optional.of("{\"url\":\"" + URL + "\",\"secret\":\"legacy-plain\"}"));

        java.util.concurrent.ExecutorService direct = mock(java.util.concurrent.ExecutorService.class);
        doAnswer(inv -> { ((Runnable) inv.getArgument(0)).run(); return null; })
                .when(direct).execute(any(Runnable.class));

        controller.dispatchAsync(TEMPLATE_ID, "resp-1", "{\"data\":{}}", direct);

        verify(dispatcher).dispatch(eq(URL), eq("legacy-plain"), anyString());
    }
}

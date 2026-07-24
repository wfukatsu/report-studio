package com.report.server;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Base64;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link WebhookDispatchService} — asynchronous {@code form_response.received}
 * dispatch (moved from {@code WebhookControllerTest} with the #419 extraction): secret decryption,
 * legacy plaintext secrets, and failure isolation.
 */
class WebhookDispatchServiceTest {

    private static final String KEY = Base64.getEncoder().encodeToString(new byte[32]);
    private static final String TEMPLATE_ID = "tpl-1";
    // Literal public IP — validateUrl resolves hostnames via DNS, which tests must avoid
    private static final String URL = "https://8.8.8.8/hook";

    private JsonBlobRepository repo;
    private WebhookDispatcher dispatcher;
    private SecretCrypto crypto;
    private ExecutorService direct;
    private WebhookDispatchService service;

    @BeforeEach
    void setUp() {
        repo = mock(JsonBlobRepository.class);
        dispatcher = mock(WebhookDispatcher.class);
        crypto = new SecretCrypto(KEY);
        // Same-thread executor so dispatch outcomes are observable synchronously
        direct = mock(ExecutorService.class);
        doAnswer(
                        inv -> {
                            ((Runnable) inv.getArgument(0)).run();
                            return null;
                        })
                .when(direct)
                .execute(any(Runnable.class));
        service = new WebhookDispatchService(repo, dispatcher, crypto, direct);
    }

    @Test
    void dispatchAsync_decryptsSecretBeforeDispatch() throws Exception {
        String encrypted = crypto.encrypt("hook-secret-1234");
        when(repo.get(TEMPLATE_ID))
                .thenReturn(
                        Optional.of("{\"url\":\"" + URL + "\",\"secret\":\"" + encrypted + "\"}"));

        service.dispatchAsync(TEMPLATE_ID, "resp-1", "{\"data\":{}}");

        verify(dispatcher).dispatch(eq(URL), eq("hook-secret-1234"), anyString());
    }

    @Test
    void dispatchAsync_legacyPlaintextSecretStillWorks() throws Exception {
        when(repo.get(TEMPLATE_ID))
                .thenReturn(Optional.of("{\"url\":\"" + URL + "\",\"secret\":\"legacy-plain\"}"));

        service.dispatchAsync(TEMPLATE_ID, "resp-1", "{\"data\":{}}");

        verify(dispatcher).dispatch(eq(URL), eq("legacy-plain"), anyString());
    }

    @Test
    void dispatchAsync_unconfigured_doesNotDispatch() throws Exception {
        when(repo.get(TEMPLATE_ID)).thenReturn(Optional.empty());

        service.dispatchAsync(TEMPLATE_ID, "resp-1", "{\"data\":{}}");

        verify(dispatcher, never()).dispatch(anyString(), any(), anyString());
    }

    @Test
    void dispatchAsync_dispatchFailure_neverPropagates() throws Exception {
        when(repo.get(TEMPLATE_ID))
                .thenReturn(Optional.of("{\"url\":\"" + URL + "\",\"secret\":\"s\"}"));
        doThrow(new RuntimeException("boom"))
                .when(dispatcher)
                .dispatch(anyString(), any(), anyString());

        // Must not throw — the form response is already saved when webhooks fire.
        service.dispatchAsync(TEMPLATE_ID, "resp-1", "{\"data\":{}}");
    }
}

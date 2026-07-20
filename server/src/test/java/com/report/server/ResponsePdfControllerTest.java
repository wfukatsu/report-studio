package com.report.server;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.report.server.auth.Principal;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * Unit tests for {@link ResponsePdfController#generatePdf} — GET
 * /api/v2/templates/{id}/responses/{rid}/pdf. Happy path returns real PDF bytes (%PDF magic,
 * application/pdf); unknown ids return 404; ownership violations return 403.
 */
class ResponsePdfControllerTest {

    private JsonBlobRepository responseRepo;
    private JsonBlobRepository definitionsRepo;
    private ExecutorService executor;
    private ResponsePdfController controller;
    private Context ctx;

    @BeforeEach
    void setUp() {
        responseRepo = mock(JsonBlobRepository.class);
        definitionsRepo = mock(JsonBlobRepository.class);
        executor = Executors.newSingleThreadExecutor();
        controller = new ResponsePdfController(responseRepo, definitionsRepo, executor);
        ctx = mock(Context.class);
        when(ctx.attribute("principal"))
                .thenReturn(new Principal("user-1", "Test User", java.util.Set.of("user")));
        when(ctx.pathParam("id")).thenReturn("tmpl-1");
        when(ctx.pathParam("rid")).thenReturn("resp-1");
    }

    @AfterEach
    void tearDown() {
        executor.shutdownNow();
    }

    private static final String ENVELOPE =
            "{\"id\":\"tmpl-1\",\"created_by\":\"user-1\",\"definition\":{\"pages\":[]}}";
    private static final String RESPONSE =
            "{\"id\":\"resp-1\",\"templateId\":\"tmpl-1\",\"data\":{\"name\":\"太郎\"}}";

    @Test
    void generatePdf_returnsPdfBytesForStoredResponse() throws Exception {
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(ENVELOPE));
        when(responseRepo.get("resp-1")).thenReturn(Optional.of(RESPONSE));

        controller.generatePdf(ctx);

        verify(ctx).contentType("application/pdf");
        verify(ctx).header(eq("Content-Disposition"), contains("resp-1"));
        ArgumentCaptor<byte[]> pdfCaptor = ArgumentCaptor.forClass(byte[].class);
        verify(ctx).result(pdfCaptor.capture());
        byte[] pdf = pdfCaptor.getValue();
        assertTrue(pdf.length > 4, "PDF should be non-trivial");
        assertEquals('%', (char) pdf[0]);
        assertEquals('P', (char) pdf[1]);
        assertEquals('D', (char) pdf[2]);
        assertEquals('F', (char) pdf[3]);
    }

    @Test
    void generatePdf_returns404ForUnknownResponseId() throws Exception {
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(ENVELOPE));
        when(responseRepo.get("resp-1")).thenReturn(Optional.empty());

        controller.generatePdf(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
        verify(ctx, never()).result(any(byte[].class));
    }

    @Test
    void generatePdf_returns404ForUnknownTemplateId() throws Exception {
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.empty());

        controller.generatePdf(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
        verify(responseRepo, never()).get(anyString());
    }

    @Test
    void generatePdf_returns404WhenResponseBelongsToAnotherTemplate() throws Exception {
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(ENVELOPE));
        when(responseRepo.get("resp-1"))
                .thenReturn(
                        Optional.of(
                                "{\"id\":\"resp-1\",\"templateId\":\"tmpl-OTHER\",\"data\":{}}"));

        controller.generatePdf(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
        verify(ctx, never()).result(any(byte[].class));
    }

    @Test
    void generatePdf_returns403WhenNotTemplateOwner() throws Exception {
        when(definitionsRepo.get("tmpl-1"))
                .thenReturn(
                        Optional.of(
                                "{\"id\":\"tmpl-1\",\"created_by\":\"other-user\","
                                        + "\"definition\":{\"pages\":[]}}"));

        controller.generatePdf(ctx);

        verify(ctx).status(HttpStatus.FORBIDDEN);
        verify(ctx, never()).result(any(byte[].class));
    }

    @Test
    void generatePdf_rejectsInvalidResponseIdFormat() throws Exception {
        when(ctx.pathParam("rid")).thenReturn("../../etc/passwd");

        controller.generatePdf(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(definitionsRepo, never()).get(anyString());
    }

    @Test
    void generatePdf_rendersBareDefinitionBlobWithoutEnvelope() throws Exception {
        // Legacy blobs may be a bare definition (no {definition:...} wrapper)
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of("{\"pages\":[]}"));
        when(responseRepo.get("resp-1")).thenReturn(Optional.of(RESPONSE));

        controller.generatePdf(ctx);

        verify(ctx).contentType("application/pdf");
        ArgumentCaptor<byte[]> pdfCaptor = ArgumentCaptor.forClass(byte[].class);
        verify(ctx).result(pdfCaptor.capture());
        assertEquals('%', (char) pdfCaptor.getValue()[0]);
    }
}

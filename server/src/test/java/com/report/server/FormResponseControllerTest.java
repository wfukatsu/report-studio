package com.report.server;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.Principal;
import com.report.server.auth.RateLimiter;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class FormResponseControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private JsonBlobRepository responseRepo;
    private JsonBlobRepository definitionsRepo;
    private RateLimiter submitLimiter;
    private FormResponseController controller;
    private Context ctx;
    private Principal principal;

    @BeforeEach
    void setUp() {
        responseRepo = mock(JsonBlobRepository.class);
        definitionsRepo = mock(JsonBlobRepository.class);
        submitLimiter = mock(RateLimiter.class);
        controller = new FormResponseController(responseRepo, definitionsRepo, submitLimiter);
        ctx = mock(Context.class);
        principal = new Principal("user-1", "Test User", java.util.Set.of("user"));
        when(ctx.attribute("principal")).thenReturn(principal);
        when(submitLimiter.isAllowed(anyString())).thenReturn(true);
    }

    // ── Helper methods ────────────────────────────────────────────────────────

    private String buildEnvelope(String id, String name, String createdBy) throws Exception {
        ObjectNode env = MAPPER.createObjectNode();
        env.put("id", id);
        env.put("name", name);
        env.put("created_at", 1000L);
        env.put("updated_at", 2000L);
        if (createdBy != null) env.put("created_by", createdBy);
        env.set("definition", MAPPER.createObjectNode());
        return MAPPER.writeValueAsString(env);
    }

    private String buildResponse(String id, String templateId, String submittedBy) throws Exception {
        ObjectNode resp = MAPPER.createObjectNode();
        resp.put("id", id);
        resp.put("templateId", templateId);
        resp.put("submittedAt", 1000L);
        resp.put("submittedBy", submittedBy);
        ObjectNode data = resp.putObject("data");
        data.put("field1", "value1");
        return MAPPER.writeValueAsString(resp);
    }

    // ── submit ────────────────────────────────────────────────────────────────

    @Test
    void submit_returnsCreatedWithId() throws Exception {
        when(ctx.pathParam("id")).thenReturn("tmpl-1");
        when(ctx.body()).thenReturn("{\"data\": {\"name\": \"Alice\"}}");
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(buildEnvelope("tmpl-1", "Test", "user-1")));

        controller.submit(ctx);

        verify(ctx).status(HttpStatus.CREATED);
        verify(responseRepo).put(anyString(), anyString(), eq("tmpl-1"));
    }

    @Test
    void submit_rejectsRateLimited() throws Exception {
        when(ctx.pathParam("id")).thenReturn("tmpl-1");
        when(submitLimiter.isAllowed("user-1")).thenReturn(false);

        controller.submit(ctx);

        verify(ctx).status(429);
        verify(responseRepo, never()).put(anyString(), anyString(), anyString());
    }

    @Test
    void submit_returns404ForUnknownTemplate() throws Exception {
        when(ctx.pathParam("id")).thenReturn("tmpl-999");
        when(definitionsRepo.get("tmpl-999")).thenReturn(Optional.empty());

        controller.submit(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
    }

    @Test
    void submit_returns403WhenNotOwner() throws Exception {
        when(ctx.pathParam("id")).thenReturn("tmpl-1");
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(buildEnvelope("tmpl-1", "Test", "other-user")));

        controller.submit(ctx);

        verify(ctx).status(HttpStatus.FORBIDDEN);
    }

    @Test
    void submit_rejectsMissingDataField() throws Exception {
        when(ctx.pathParam("id")).thenReturn("tmpl-1");
        when(ctx.body()).thenReturn("{\"other\": \"value\"}");
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(buildEnvelope("tmpl-1", "Test", "user-1")));

        controller.submit(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
    }

    @Test
    void submit_storesSubmittedByServerSide() throws Exception {
        when(ctx.pathParam("id")).thenReturn("tmpl-1");
        // Body does NOT include submittedBy — server must stamp it
        when(ctx.body()).thenReturn("{\"data\": {\"name\": \"Alice\"}}");
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(buildEnvelope("tmpl-1", "Test", "user-1")));

        controller.submit(ctx);

        ArgumentCaptor<String> jsonCaptor = ArgumentCaptor.forClass(String.class);
        verify(responseRepo).put(anyString(), jsonCaptor.capture(), eq("tmpl-1"));
        var node = MAPPER.readTree(jsonCaptor.getValue());
        assertEquals("user-1", node.path("submittedBy").asText());
    }

    @Test
    void submit_allowsAccessToLegacyTemplateWithNoCreatedBy() throws Exception {
        when(ctx.pathParam("id")).thenReturn("tmpl-legacy");
        when(ctx.body()).thenReturn("{\"data\": {\"x\": \"y\"}}");
        // Legacy template: no created_by field
        when(definitionsRepo.get("tmpl-legacy")).thenReturn(Optional.of(buildEnvelope("tmpl-legacy", "Legacy", null)));

        controller.submit(ctx);

        verify(ctx).status(HttpStatus.CREATED);
    }

    // ── list ─────────────────────────────────────────────────────────────────

    @Test
    void list_returnsPaginatedItems() throws Exception {
        when(ctx.pathParam("id")).thenReturn("tmpl-1");
        when(ctx.queryParam("offset")).thenReturn(null);
        when(ctx.queryParam("limit")).thenReturn(null);
        when(ctx.queryParam("aggregate")).thenReturn(null);
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(buildEnvelope("tmpl-1", "Test", "user-1")));
        when(responseRepo.listByGroupKey("tmpl-1")).thenReturn(List.of(
            buildResponse("resp-1", "tmpl-1", "user-1"),
            buildResponse("resp-2", "tmpl-1", "user-1")
        ));

        controller.list(ctx);

        ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
        verify(ctx).json(captor.capture());
        @SuppressWarnings("unchecked")
        var result = (java.util.Map<String, Object>) captor.getValue();
        assertEquals(2, result.get("total"));
    }

    @Test
    void list_returns403WhenNotOwner() throws Exception {
        when(ctx.pathParam("id")).thenReturn("tmpl-1");
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(buildEnvelope("tmpl-1", "Test", "other-user")));

        controller.list(ctx);

        verify(ctx).status(HttpStatus.FORBIDDEN);
    }

    @Test
    void list_returns422WhenTooManyResponses() throws Exception {
        when(ctx.pathParam("id")).thenReturn("tmpl-1");
        when(ctx.queryParam(anyString())).thenReturn(null);
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(buildEnvelope("tmpl-1", "Test", "user-1")));
        // Create 2001 responses (above MAX_INLINE_RESPONSES=2000)
        List<String> many = new java.util.ArrayList<>();
        for (int i = 0; i < 2001; i++) {
            many.add(buildResponse("resp-" + i, "tmpl-1", "user-1"));
        }
        when(responseRepo.listByGroupKey("tmpl-1")).thenReturn(many);

        controller.list(ctx);

        verify(ctx).status(422);
    }

    // ── get ───────────────────────────────────────────────────────────────────

    @Test
    void get_returnsResponseJson() throws Exception {
        when(ctx.pathParam("id")).thenReturn("tmpl-1");
        when(ctx.pathParam("rid")).thenReturn("resp-1");
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(buildEnvelope("tmpl-1", "Test", "user-1")));
        String respJson = buildResponse("resp-1", "tmpl-1", "user-1");
        when(responseRepo.get("resp-1")).thenReturn(Optional.of(respJson));

        controller.get(ctx);

        verify(ctx).contentType("application/json");
        verify(ctx).result(respJson);
    }

    @Test
    void get_returns404ForWrongTemplate() throws Exception {
        when(ctx.pathParam("id")).thenReturn("tmpl-1");
        when(ctx.pathParam("rid")).thenReturn("resp-1");
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(buildEnvelope("tmpl-1", "Test", "user-1")));
        // Response belongs to a different template
        when(responseRepo.get("resp-1")).thenReturn(Optional.of(buildResponse("resp-1", "tmpl-OTHER", "user-1")));

        controller.get(ctx);

        verify(ctx).status(HttpStatus.NOT_FOUND);
    }

    // ── delete ────────────────────────────────────────────────────────────────

    @Test
    void delete_allowsSubmitterToDelete() throws Exception {
        when(ctx.pathParam("id")).thenReturn("tmpl-1");
        when(ctx.pathParam("rid")).thenReturn("resp-1");
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(buildEnvelope("tmpl-1", "Test", "owner-user")));
        // user-1 is the submitter
        when(responseRepo.get("resp-1")).thenReturn(Optional.of(buildResponse("resp-1", "tmpl-1", "user-1")));

        controller.delete(ctx);

        verify(responseRepo).delete("resp-1");
    }

    @Test
    void delete_allowsTemplateOwnerToDelete() throws Exception {
        when(ctx.pathParam("id")).thenReturn("tmpl-1");
        when(ctx.pathParam("rid")).thenReturn("resp-1");
        // user-1 is the template owner
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(buildEnvelope("tmpl-1", "Test", "user-1")));
        // response was submitted by someone else
        when(responseRepo.get("resp-1")).thenReturn(Optional.of(buildResponse("resp-1", "tmpl-1", "other-user")));

        controller.delete(ctx);

        verify(responseRepo).delete("resp-1");
    }

    @Test
    void delete_returns403ForNonOwnerNonSubmitter() throws Exception {
        when(ctx.pathParam("id")).thenReturn("tmpl-1");
        when(ctx.pathParam("rid")).thenReturn("resp-1");
        // template owned by "owner-user", submitted by "submitter-user"
        when(definitionsRepo.get("tmpl-1")).thenReturn(Optional.of(buildEnvelope("tmpl-1", "Test", "owner-user")));
        when(responseRepo.get("resp-1")).thenReturn(Optional.of(buildResponse("resp-1", "tmpl-1", "submitter-user")));
        // principal is user-1 (neither owner nor submitter)

        controller.delete(ctx);

        verify(ctx).status(HttpStatus.FORBIDDEN);
        verify(responseRepo, never()).delete(anyString());
    }

    // ── updateStatus — transition guard + transactional RMW (#205) ──────────────

    /** A response JSON with an explicit lifecycle status, submitted by the test principal. */
    private String responseWithStatus(String status) throws Exception {
        ObjectNode resp = (ObjectNode) MAPPER.readTree(buildResponse("resp-1", "tmpl-1", "user-1"));
        resp.put("status", status);
        return MAPPER.writeValueAsString(resp);
    }

    /** Wire the transactional read path so getWithinTx returns the given stored response. */
    private com.scalar.db.api.DistributedTransaction stubStatusTx(String storedResponseJson) throws Exception {
        com.scalar.db.api.DistributedTransactionManager mgr =
                mock(com.scalar.db.api.DistributedTransactionManager.class);
        com.scalar.db.api.DistributedTransaction tx =
                mock(com.scalar.db.api.DistributedTransaction.class);
        when(responseRepo.getTransactionManager()).thenReturn(mgr);
        when(mgr.start()).thenReturn(tx);
        when(responseRepo.getWithinTx(eq(tx), eq("resp-1"))).thenReturn(Optional.of(storedResponseJson));
        return tx;
    }

    @Test
    void updateStatus_validTransition_issuedToSent_commits() throws Exception {
        when(ctx.pathParam("id")).thenReturn("tmpl-1");
        when(ctx.pathParam("rid")).thenReturn("resp-1");
        when(ctx.body()).thenReturn("{\"status\":\"sent\"}");
        com.scalar.db.api.DistributedTransaction tx = stubStatusTx(responseWithStatus("issued"));

        controller.updateStatus(ctx);

        // Persisted within the transaction and committed.
        verify(responseRepo).putWithinTx(eq(tx), eq("resp-1"), anyString(), eq("tmpl-1"));
        verify(tx).commit();
        // Legacy per-op put must NOT be used (that was the lost-update path).
        verify(responseRepo, never()).put(anyString(), anyString(), anyString());
    }

    @Test
    void updateStatus_invalidTransition_voidToIssued_409_noWrite() throws Exception {
        when(ctx.pathParam("id")).thenReturn("tmpl-1");
        when(ctx.pathParam("rid")).thenReturn("resp-1");
        when(ctx.body()).thenReturn("{\"status\":\"issued\"}");
        com.scalar.db.api.DistributedTransaction tx = stubStatusTx(responseWithStatus("void"));

        controller.updateStatus(ctx);

        verify(ctx).status(HttpStatus.CONFLICT);
        verify(responseRepo, never()).putWithinTx(any(), anyString(), anyString(), anyString());
        verify(tx, never()).commit();
        verify(tx).abort();
    }

    @Test
    void updateStatus_invalidTransition_sentToDraft_409() throws Exception {
        when(ctx.pathParam("id")).thenReturn("tmpl-1");
        when(ctx.pathParam("rid")).thenReturn("resp-1");
        when(ctx.body()).thenReturn("{\"status\":\"draft\"}");
        stubStatusTx(responseWithStatus("sent"));

        controller.updateStatus(ctx);

        verify(ctx).status(HttpStatus.CONFLICT);
    }

    @Test
    void updateStatus_sameStatus_isNoOp_noWrite() throws Exception {
        when(ctx.pathParam("id")).thenReturn("tmpl-1");
        when(ctx.pathParam("rid")).thenReturn("resp-1");
        when(ctx.body()).thenReturn("{\"status\":\"issued\"}");
        com.scalar.db.api.DistributedTransaction tx = stubStatusTx(responseWithStatus("issued"));

        controller.updateStatus(ctx);

        verify(responseRepo, never()).putWithinTx(any(), anyString(), anyString(), anyString());
        verify(tx, never()).commit();
    }

    @Test
    void updateStatus_invalidStatusValue_400() throws Exception {
        when(ctx.pathParam("id")).thenReturn("tmpl-1");
        when(ctx.pathParam("rid")).thenReturn("resp-1");
        when(ctx.body()).thenReturn("{\"status\":\"archived\"}");

        controller.updateStatus(ctx);

        verify(ctx).status(HttpStatus.BAD_REQUEST);
        verify(responseRepo, never()).getTransactionManager();
    }

    @Test
    void updateStatus_voidingIssued_allowed() throws Exception {
        when(ctx.pathParam("id")).thenReturn("tmpl-1");
        when(ctx.pathParam("rid")).thenReturn("resp-1");
        when(ctx.body()).thenReturn("{\"status\":\"void\"}");
        com.scalar.db.api.DistributedTransaction tx = stubStatusTx(responseWithStatus("issued"));

        controller.updateStatus(ctx);

        verify(responseRepo).putWithinTx(eq(tx), eq("resp-1"), anyString(), eq("tmpl-1"));
        verify(tx).commit();
    }

    // ── listDocuments — unbounded-scan guard (#208) ────────────────────────────

    @Test
    void listDocuments_aboveInlineCap_returns422() {
        java.util.List<String> huge = new java.util.ArrayList<>();
        for (int i = 0; i < 2_001; i++) { // MAX_INLINE_RESPONSES = 2000
            huge.add("{\"id\":\"r" + i + "\",\"templateId\":\"t\",\"status\":\"issued\",\"submittedBy\":\"user-1\"}");
        }
        when(responseRepo.list()).thenReturn(huge);
        when(ctx.status(anyInt())).thenReturn(ctx);

        controller.listDocuments(ctx);

        verify(ctx).status(422);
        // Must bail out before doing the O(n) per-template envelope lookups.
        verify(definitionsRepo, never()).get(anyString());
    }
}

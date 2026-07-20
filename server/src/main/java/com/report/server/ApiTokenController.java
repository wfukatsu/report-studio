package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.report.server.auth.AuthController;
import com.report.server.auth.Principal;
import com.report.server.auth.UserRecord;
import com.report.server.auth.UserRepository;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Personal Access Token (PAT) management and Bearer authentication (#195).
 *
 * <p>Tokens let CI jobs and the CLI authenticate without the cookie-session login
 * ritual. Only a SHA-256 hash of each token is stored — the plaintext is shown
 * exactly once, at creation. Management endpoints require a real logged-in session
 * (so a token cannot mint further tokens); the token itself is then presented as
 * {@code Authorization: Bearer <token>} on subsequent requests.
 *
 * <ul>
 *   <li>{@code POST   /api/v1/auth/tokens}      — create; returns the plaintext once</li>
 *   <li>{@code GET    /api/v1/auth/tokens}      — list the caller's tokens (metadata only)</li>
 *   <li>{@code DELETE /api/v1/auth/tokens/{id}} — revoke</li>
 * </ul>
 */
public final class ApiTokenController {

    private static final Logger log = LoggerFactory.getLogger(ApiTokenController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String TOKEN_PREFIX = "rpat_";
    private static final int TOKEN_BYTES = 32;
    /** Skip a lastUsedAt write if it was touched within this window (reduce write load). */
    private static final long LAST_USED_THROTTLE_MS = 60_000L;

    private final AuthController authCtrl;
    private final UserRepository userRepo;
    private final JsonBlobRepository tokenRepo;

    public ApiTokenController(AuthController authCtrl, UserRepository userRepo, JsonBlobRepository tokenRepo) {
        this.authCtrl = authCtrl;
        this.userRepo = userRepo;
        this.tokenRepo = tokenRepo;
    }

    // ── Management (session-authenticated) ──────────────────────────────────────

    /** POST /api/v1/auth/tokens — body {label?}. Returns plaintext token once. */
    public void create(Context ctx) {
        Principal principal = authCtrl.resolveFromRequest(ctx);
        if (principal == null || principal.isAnonymous()) {
            unauthorized(ctx);
            return;
        }
        String label = "";
        try {
            if (ctx.body() != null && !ctx.body().isBlank()) {
                JsonNode body = MAPPER.readTree(ctx.body());
                label = body.path("label").asText("").strip();
            }
        } catch (Exception e) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Invalid JSON"));
            return;
        }
        if (label.length() > 100) label = label.substring(0, 100);

        byte[] raw = new byte[TOKEN_BYTES];
        RANDOM.nextBytes(raw);
        String plaintext = TOKEN_PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        String hash = sha256(plaintext);
        String preview = plaintext.substring(0, Math.min(plaintext.length(), 12)) + "…";
        long now = System.currentTimeMillis();

        ObjectNode rec = MAPPER.createObjectNode();
        rec.put("id", hash);
        rec.put("userId", principal.userId());
        rec.put("label", label);
        rec.put("preview", preview);
        rec.put("createdAt", now);
        rec.put("lastUsedAt", 0L);
        try {
            tokenRepo.put(hash, MAPPER.writeValueAsString(rec), principal.userId());
        } catch (Exception e) {
            log.error("Failed to persist API token for {}", principal.userId(), e);
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Failed to create token"));
            return;
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", hash);
        out.put("token", plaintext); // shown exactly once
        out.put("label", label);
        out.put("preview", preview);
        out.put("createdAt", now);
        ctx.status(HttpStatus.CREATED);
        ctx.json(out);
        log.info("Created API token {} for user {}", preview, principal.userId());
    }

    /** GET /api/v1/auth/tokens — list the caller's tokens (no plaintext). */
    public void list(Context ctx) {
        Principal principal = authCtrl.resolveFromRequest(ctx);
        if (principal == null || principal.isAnonymous()) {
            unauthorized(ctx);
            return;
        }
        List<Map<String, Object>> items = new ArrayList<>();
        for (String json : tokenRepo.listByGroupKey(principal.userId())) {
            try {
                JsonNode n = MAPPER.readTree(json);
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", n.path("id").asText());
                m.put("label", n.path("label").asText(""));
                m.put("preview", n.path("preview").asText(""));
                m.put("createdAt", n.path("createdAt").asLong());
                m.put("lastUsedAt", n.path("lastUsedAt").asLong());
                items.add(m);
            } catch (Exception ignored) { /* skip */ }
        }
        items.sort((a, b) -> Long.compare(
                ((Number) b.getOrDefault("createdAt", 0L)).longValue(),
                ((Number) a.getOrDefault("createdAt", 0L)).longValue()));
        ctx.json(Map.of("tokens", items));
    }

    /** DELETE /api/v1/auth/tokens/{id} — revoke one of the caller's tokens. */
    public void revoke(Context ctx) {
        Principal principal = authCtrl.resolveFromRequest(ctx);
        if (principal == null || principal.isAnonymous()) {
            unauthorized(ctx);
            return;
        }
        String id = ctx.pathParam("id");
        Optional<String> stored = tokenRepo.get(id);
        if (stored.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "Token not found"));
            return;
        }
        try {
            JsonNode n = MAPPER.readTree(stored.get());
            if (!principal.userId().equals(n.path("userId").asText(""))) {
                // Don't reveal existence of other users' tokens
                ctx.status(HttpStatus.NOT_FOUND);
                ctx.json(Map.of("error", "Token not found"));
                return;
            }
        } catch (Exception e) {
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Failed to read token"));
            return;
        }
        // Only report success if the delete actually committed. A swallowed failure here
        // would leave a "revoked" token still usable for Bearer auth (issue #206).
        try {
            tokenRepo.delete(id);
        } catch (Exception e) {
            log.warn("Token revocation failed for id={}: {}", id, e.getMessage());
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR);
            ctx.json(Map.of("error", "Failed to revoke token"));
            return;
        }
        ctx.json(Map.of("revoked", true, "id", id));
    }

    // ── Bearer resolution (called from the auth before-filter) ──────────────────

    /**
     * Resolve a principal from an {@code Authorization: Bearer <token>} header.
     * Returns {@link Principal#ANONYMOUS} when absent, malformed, unknown, or the
     * backing user no longer exists.
     */
    public Principal resolveFromBearer(Context ctx) {
        String header = ctx.header("Authorization");
        if (header == null || !header.startsWith("Bearer ")) return Principal.ANONYMOUS;
        String token = header.substring("Bearer ".length()).trim();
        if (token.isEmpty()) return Principal.ANONYMOUS;

        String hash = sha256(token);
        Optional<String> stored;
        try { stored = tokenRepo.get(hash); }
        catch (Exception e) { return Principal.ANONYMOUS; }
        if (stored.isEmpty()) return Principal.ANONYMOUS;

        JsonNode rec;
        try { rec = MAPPER.readTree(stored.get()); }
        catch (Exception e) { return Principal.ANONYMOUS; }

        String userId = rec.path("userId").asText("");
        Optional<UserRecord> userOpt = userRepo.findById(userId);
        if (userOpt.isEmpty()) return Principal.ANONYMOUS;

        touchLastUsed(hash, rec);
        UserRecord user = userOpt.get();
        return new Principal(user.userId(), user.displayName(), user.roles());
    }

    private void touchLastUsed(String hash, JsonNode rec) {
        long last = rec.path("lastUsedAt").asLong(0);
        long now = System.currentTimeMillis();
        if (now - last < LAST_USED_THROTTLE_MS) return;
        try {
            ObjectNode updated = (ObjectNode) rec;
            updated.put("lastUsedAt", now);
            tokenRepo.put(hash, MAPPER.writeValueAsString(updated), rec.path("userId").asText(""));
        } catch (Exception ignored) { /* best-effort */ }
    }

    private static void unauthorized(Context ctx) {
        ctx.status(HttpStatus.UNAUTHORIZED);
        ctx.json(Map.of("error", "Authentication required (session login)"));
    }

    static String sha256(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}

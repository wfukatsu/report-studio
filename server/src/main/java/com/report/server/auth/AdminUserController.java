package com.report.server.auth;

import at.favre.lib.crypto.bcrypt.BCrypt;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Admin-only user management endpoints:
 * <ul>
 *   <li>GET    /api/v1/admin/users         — list all users (passwords masked)</li>
 *   <li>POST   /api/v1/admin/users         — create user</li>
 *   <li>PUT    /api/v1/admin/users/{id}    — update displayName, password, roles</li>
 *   <li>DELETE /api/v1/admin/users/{id}    — delete user (cannot delete self)</li>
 * </ul>
 *
 * All endpoints require the "admin" role; returns 403 otherwise.
 */
public final class AdminUserController {

    private static final Logger log = LoggerFactory.getLogger(AdminUserController.class);
    private final UserRepository userRepo;

    public AdminUserController(UserRepository userRepo) {
        this.userRepo = userRepo;
    }

    /** Assert the calling principal has the "admin" role. Returns false (and sets 403) if not. */
    private boolean requireAdmin(Context ctx) {
        Principal principal = ctx.attribute("principal");
        if (principal == null || principal.isAnonymous() || !principal.roles().contains("admin")) {
            ctx.status(HttpStatus.FORBIDDEN);
            ctx.json(Map.of("error", "Admin role required"));
            return false;
        }
        return true;
    }

    /** GET /api/v1/admin/users — list all users (passwordHash masked). */
    public void list(Context ctx) {
        if (!requireAdmin(ctx)) return;

        List<Map<String, Object>> users = userRepo.list().stream()
            .map(u -> Map.<String, Object>of(
                "userId", u.userId(),
                "displayName", u.displayName(),
                "roles", u.roles()
            ))
            .collect(Collectors.toList());

        ctx.json(Map.of("users", users));
    }

    /** POST /api/v1/admin/users — create a new user. Body: { userId, displayName, password, roles: [] } */
    public void create(Context ctx) {
        if (!requireAdmin(ctx)) return;

        var body = ctx.bodyAsClass(Map.class);
        String userId      = (String) body.get("userId");
        String displayName = (String) body.get("displayName");
        String password    = (String) body.get("password");

        if (userId == null || userId.isBlank() || password == null || password.isBlank()) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "userId and password are required"));
            return;
        }

        if (userRepo.findById(userId).isPresent()) {
            ctx.status(HttpStatus.CONFLICT);
            ctx.json(Map.of("error", "User already exists: " + userId));
            return;
        }

        @SuppressWarnings("unchecked")
        List<String> rolesList = body.get("roles") instanceof List<?> l
                ? (List<String>) l : List.of("user");
        Set<String> roles = Set.copyOf(rolesList);

        String hash = BCrypt.withDefaults().hashToString(12, password.toCharArray());
        UserRecord user = new UserRecord(
            userId.strip(),
            displayName != null ? displayName.strip() : userId.strip(),
            hash,
            roles
        );
        userRepo.save(user);

        ctx.status(HttpStatus.CREATED);
        ctx.json(Map.of(
            "userId", user.userId(),
            "displayName", user.displayName(),
            "roles", user.roles()
        ));
        log.info("Admin created user: {}", userId);
    }

    /** PUT /api/v1/admin/users/{id} — update displayName, password, roles. */
    public void update(Context ctx) {
        if (!requireAdmin(ctx)) return;

        String targetId = ctx.pathParam("id");
        var existing = userRepo.findById(targetId);
        if (existing.isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "User not found: " + targetId));
            return;
        }

        UserRecord user = existing.get();
        var body = ctx.bodyAsClass(Map.class);

        String newDisplayName = (String) body.get("displayName");
        String newPassword    = (String) body.get("password");

        String updatedDisplayName = (newDisplayName != null && !newDisplayName.isBlank())
                ? newDisplayName.strip() : user.displayName();

        String updatedHash = user.passwordHash();
        if (newPassword != null && !newPassword.isBlank()) {
            updatedHash = BCrypt.withDefaults().hashToString(12, newPassword.toCharArray());
        }

        @SuppressWarnings("unchecked")
        Set<String> updatedRoles = body.get("roles") instanceof List<?> l
                ? Set.copyOf((List<String>) l) : user.roles();

        UserRecord updated = new UserRecord(user.userId(), updatedDisplayName, updatedHash, updatedRoles);
        userRepo.save(updated);

        ctx.json(Map.of(
            "userId", updated.userId(),
            "displayName", updated.displayName(),
            "roles", updated.roles()
        ));
        log.info("Admin updated user: {}", targetId);
    }

    /** DELETE /api/v1/admin/users/{id} — delete user (cannot delete self). */
    public void delete(Context ctx) {
        if (!requireAdmin(ctx)) return;

        Principal principal = ctx.attribute("principal");
        String targetId = ctx.pathParam("id");

        if (targetId.equals(principal.userId())) {
            ctx.status(HttpStatus.BAD_REQUEST);
            ctx.json(Map.of("error", "Cannot delete your own account"));
            return;
        }

        if (userRepo.findById(targetId).isEmpty()) {
            ctx.status(HttpStatus.NOT_FOUND);
            ctx.json(Map.of("error", "User not found: " + targetId));
            return;
        }

        userRepo.delete(targetId);
        ctx.status(HttpStatus.NO_CONTENT);
        log.info("Admin deleted user: {}", targetId);
    }
}

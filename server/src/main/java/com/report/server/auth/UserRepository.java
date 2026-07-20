package com.report.server.auth;

import com.report.server.JsonBlobRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.scalar.db.api.DistributedTransactionManager;
import com.scalar.db.service.TransactionFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import at.favre.lib.crypto.bcrypt.BCrypt;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * ScalarDB-backed user repository for authentication.
 * Stores users as JSON blobs in report_studio.users table.
 */
public final class UserRepository {

    private static final Logger log = LoggerFactory.getLogger(UserRepository.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String NAMESPACE = "report_studio";
    private static final String TABLE = "users";

    private final JsonBlobRepository blob;

    public UserRepository(TransactionFactory factory, DistributedTransactionManager manager) {
        this.blob = new JsonBlobRepository(factory, manager, NAMESPACE, TABLE);
    }

    /** Package-private for tests — inject a prepared blob repository. */
    UserRepository(JsonBlobRepository blob) {
        this.blob = blob;
    }

    public void ensureTable() {
        blob.ensureTable();
    }

    /** Find a user by userId. */
    public Optional<UserRecord> findById(String userId) {
        return blob.get(userId).flatMap(json -> {
            try {
                return Optional.of(MAPPER.readValue(json, UserRecord.class));
            } catch (Exception e) {
                log.warn("Failed to parse user {}: {}", userId, e.getMessage());
                return Optional.empty();
            }
        });
    }

    /** List all users (passwords excluded by callers — return full record for internal use). */
    public List<UserRecord> list() {
        List<String> blobs = blob.list();
        List<UserRecord> users = new ArrayList<>();
        for (String json : blobs) {
            try {
                users.add(MAPPER.readValue(json, UserRecord.class));
            } catch (Exception e) {
                log.warn("Failed to parse user record: {}", e.getMessage());
            }
        }
        return users;
    }

    /** Delete a user by userId. */
    public void delete(String userId) {
        try {
            blob.delete(userId);
        } catch (Exception e) {
            log.error("Failed to delete user {}", userId, e);
        }
    }

    /** Save or update a user. */
    public void save(UserRecord user) {
        try {
            blob.put(user.userId(), MAPPER.writeValueAsString(user));
        } catch (Exception e) {
            log.error("Failed to save user {}", user.userId(), e);
        }
    }

    private static final String DEFAULT_PASSWORD = "changeme";

    /**
     * Ensure a default admin user exists.
     *
     * <ul>
     *   <li>admin が存在しない場合: ADMIN_PASSWORD 環境変数（未設定時は既定値
     *       "changeme"）で作成する</li>
     *   <li>admin が既に存在する場合: ADMIN_PASSWORD が明示的に設定されている
     *       ときだけパスワードをその値へリセットする（ロックアウト復旧用）。
     *       未設定なら一切変更しない — UI からのパスワード変更が再起動で
     *       巻き戻らないようにするため</li>
     * </ul>
     */
    public void ensureDefaultUser() {
        ensureDefaultUser(System.getenv("ADMIN_PASSWORD"));
    }

    /** Package-private for tests — env value injected as a parameter. */
    void ensureDefaultUser(String envPassword) {
        boolean envSet = envPassword != null && !envPassword.isBlank();
        boolean adminExists = findById("admin").isPresent();

        if (adminExists && !envSet) {
            log.info("Admin user exists — leaving credentials untouched");
            return;
        }

        String password = envSet ? envPassword : DEFAULT_PASSWORD;
        String hashedPassword = BCrypt.withDefaults().hashToString(12, password.toCharArray());
        UserRecord admin = new UserRecord("admin", "管理者", hashedPassword, Set.of("admin", "user"));
        save(admin);

        if (envSet) {
            log.info(adminExists
                    ? "Admin password reset from ADMIN_PASSWORD env var"
                    : "Admin user created (password from ADMIN_PASSWORD env var)");
        } else {
            log.warn("SECURITY: admin user created with the default password '{}'. "
                    + "Set the ADMIN_PASSWORD environment variable (or change the password "
                    + "from the admin UI) before exposing this server.", DEFAULT_PASSWORD);
        }
    }
}

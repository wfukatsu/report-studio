package com.report.server.auth;

import com.report.server.JsonBlobRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
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

    public UserRepository(TransactionFactory factory) {
        this.blob = new JsonBlobRepository(factory, NAMESPACE, TABLE);
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
     * Ensure a default admin user exists with a known password.
     * Password is read from ADMIN_PASSWORD env var, defaulting to "changeme".
     * If the admin user already exists, the password is reset to match.
     */
    public void ensureDefaultUser() {
        String envPassword = System.getenv("ADMIN_PASSWORD");
        String password = (envPassword != null && !envPassword.isBlank())
                ? envPassword
                : DEFAULT_PASSWORD;

        String hashedPassword = BCrypt.withDefaults().hashToString(12, password.toCharArray());
        UserRecord admin = new UserRecord("admin", "管理者", hashedPassword, Set.of("admin", "user"));
        save(admin);

        if (DEFAULT_PASSWORD.equals(password)) {
            log.info("Admin user ready (password: {})", DEFAULT_PASSWORD);
        } else {
            log.info("Admin user ready (password from ADMIN_PASSWORD env var)");
        }
    }
}

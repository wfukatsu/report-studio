package com.report.server;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * AES-256-GCM encryption for secrets at rest (webhook signing secrets).
 *
 * <p>The master key comes from the {@code WEBHOOK_SECRET_KEY} environment variable (Base64-encoded
 * 32 bytes). When the key is not configured the instance operates in passthrough mode: {@link
 * #encrypt(String)} returns the plaintext unchanged so local development keeps working, and a WARN
 * is logged at startup.
 *
 * <p>Storage format: {@code enc:v1:<base64(iv)>:<base64(ciphertext+tag)>}. Values without the
 * {@code enc:v1:} prefix are treated as legacy plaintext by {@link #decrypt(String)} (lazy
 * migration — they are encrypted on the next save).
 */
public final class SecretCrypto {

    private static final Logger log = LoggerFactory.getLogger(SecretCrypto.class);

    public static final String ENV_KEY = "WEBHOOK_SECRET_KEY";

    private static final String PREFIX = "enc:v1:";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int KEY_LENGTH_BYTES = 32;
    private static final int IV_LENGTH_BYTES = 12;
    private static final int GCM_TAG_BITS = 128;

    private final SecretKeySpec key; // null = passthrough mode (key not configured)
    private final SecureRandom random = new SecureRandom();

    /**
     * @param base64Key Base64-encoded 32-byte AES key, or null/blank for passthrough mode.
     * @throws IllegalArgumentException if the key is present but not valid Base64 or does not
     *     decode to exactly 32 bytes.
     */
    public SecretCrypto(String base64Key) {
        if (base64Key == null || base64Key.isBlank()) {
            this.key = null;
            return;
        }
        byte[] raw;
        try {
            raw = Base64.getDecoder().decode(base64Key.trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException(ENV_KEY + " is not valid Base64", e);
        }
        if (raw.length != KEY_LENGTH_BYTES) {
            throw new IllegalArgumentException(
                    ENV_KEY
                            + " must decode to "
                            + KEY_LENGTH_BYTES
                            + " bytes (got "
                            + raw.length
                            + ")");
        }
        this.key = new SecretKeySpec(raw, "AES");
    }

    /**
     * Build from the {@code WEBHOOK_SECRET_KEY} environment variable. Logs a WARN when the key is
     * not set (plaintext fallback for development).
     */
    public static SecretCrypto fromEnv() {
        SecretCrypto crypto = new SecretCrypto(System.getenv(ENV_KEY));
        if (!crypto.isEnabled()) {
            log.warn(
                    "{} is not set — webhook secrets will be stored in PLAINTEXT. "
                            + "Set a Base64-encoded 32-byte key before running in production "
                            + "(e.g. `openssl rand -base64 32`).",
                    ENV_KEY);
        }
        return crypto;
    }

    /** True when a master key is configured and values will actually be encrypted. */
    public boolean isEnabled() {
        return key != null;
    }

    /** True when the stored value carries the {@code enc:v1:} prefix. */
    public static boolean isEncrypted(String value) {
        return value != null && value.startsWith(PREFIX);
    }

    /**
     * Encrypt a plaintext secret. Returns the input unchanged when null or when no key is
     * configured (passthrough mode).
     */
    public String encrypt(String plaintext) {
        if (plaintext == null || key == null) {
            return plaintext;
        }
        try {
            byte[] iv = new byte[IV_LENGTH_BYTES];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            return PREFIX
                    + Base64.getEncoder().encodeToString(iv)
                    + ":"
                    + Base64.getEncoder().encodeToString(ciphertext);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Failed to encrypt secret", e);
        }
    }

    /**
     * Decrypt a stored value. Values without the {@code enc:v1:} prefix are returned as-is (legacy
     * plaintext passthrough). Null returns null.
     *
     * @throws IllegalStateException if the value is encrypted but no key is configured, or if
     *     decryption fails (wrong key / tampered ciphertext).
     */
    public String decrypt(String stored) {
        if (!isEncrypted(stored)) {
            return stored;
        }
        if (key == null) {
            throw new IllegalStateException(
                    "Encrypted secret found but " + ENV_KEY + " is not configured");
        }
        String body = stored.substring(PREFIX.length());
        int sep = body.indexOf(':');
        if (sep <= 0 || sep == body.length() - 1) {
            throw new IllegalStateException("Malformed encrypted secret");
        }
        try {
            byte[] iv = Base64.getDecoder().decode(body.substring(0, sep));
            byte[] ciphertext = Base64.getDecoder().decode(body.substring(sep + 1));
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, iv));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw new IllegalStateException("Failed to decrypt secret", e);
        }
    }
}

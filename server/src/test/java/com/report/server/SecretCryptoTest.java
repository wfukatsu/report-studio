package com.report.server;

import org.junit.jupiter.api.Test;

import java.util.Base64;

import static org.junit.jupiter.api.Assertions.*;

class SecretCryptoTest {

    private static String base64Key(int length) {
        byte[] raw = new byte[length];
        for (int i = 0; i < length; i++) raw[i] = (byte) i;
        return Base64.getEncoder().encodeToString(raw);
    }

    private static final String VALID_KEY = base64Key(32);

    // ── Round trip ────────────────────────────────────────────────────────────

    @Test
    void encryptThenDecrypt_returnsOriginalPlaintext() {
        SecretCrypto crypto = new SecretCrypto(VALID_KEY);
        String secret = "whsec_ほげ-1234!@#";

        String encrypted = crypto.encrypt(secret);

        assertNotEquals(secret, encrypted);
        assertEquals(secret, crypto.decrypt(encrypted));
    }

    @Test
    void encrypt_producesPrefixedFormat_withRandomIv() {
        SecretCrypto crypto = new SecretCrypto(VALID_KEY);

        String first = crypto.encrypt("same-secret");
        String second = crypto.encrypt("same-secret");

        assertTrue(first.startsWith("enc:v1:"));
        // enc:v1:<base64(iv)>:<base64(ciphertext+tag)> — 4 colon-separated parts
        assertEquals(4, first.split(":").length);
        // Random IV: same plaintext never encrypts to the same value
        assertNotEquals(first, second);
        // 12-byte GCM IV
        assertEquals(12, Base64.getDecoder().decode(first.split(":")[2]).length);
    }

    @Test
    void encrypt_null_returnsNull() {
        SecretCrypto crypto = new SecretCrypto(VALID_KEY);
        assertNull(crypto.encrypt(null));
    }

    // ── Prefix detection ──────────────────────────────────────────────────────

    @Test
    void isEncrypted_detectsPrefix() {
        assertTrue(SecretCrypto.isEncrypted("enc:v1:aXY=:Y3Q="));
        assertFalse(SecretCrypto.isEncrypted("plain-secret"));
        assertFalse(SecretCrypto.isEncrypted(""));
        assertFalse(SecretCrypto.isEncrypted(null));
    }

    // ── Plaintext passthrough (lazy migration read path) ──────────────────────

    @Test
    void decrypt_plaintextWithoutPrefix_isReturnedAsIs() {
        SecretCrypto enabled = new SecretCrypto(VALID_KEY);
        SecretCrypto disabled = new SecretCrypto(null);

        assertEquals("legacy-plain", enabled.decrypt("legacy-plain"));
        assertEquals("legacy-plain", disabled.decrypt("legacy-plain"));
        assertNull(enabled.decrypt(null));
    }

    // ── Invalid key ───────────────────────────────────────────────────────────

    @Test
    void constructor_rejectsWrongKeyLength() {
        IllegalArgumentException e =
                assertThrows(IllegalArgumentException.class, () -> new SecretCrypto(base64Key(16)));
        assertTrue(e.getMessage().contains("32 bytes"));
    }

    @Test
    void constructor_rejectsInvalidBase64() {
        assertThrows(IllegalArgumentException.class, () -> new SecretCrypto("not-base64!!!"));
    }

    // ── Key not configured (passthrough mode) ─────────────────────────────────

    @Test
    void whenKeyMissing_encryptPassesThroughPlaintext() {
        SecretCrypto crypto = new SecretCrypto(null);

        assertFalse(crypto.isEnabled());
        assertEquals("my-secret", crypto.encrypt("my-secret"));

        SecretCrypto blank = new SecretCrypto("  ");
        assertFalse(blank.isEnabled());
        assertEquals("my-secret", blank.encrypt("my-secret"));
    }

    @Test
    void whenKeyMissing_decryptOfEncryptedValueThrows() {
        String encrypted = new SecretCrypto(VALID_KEY).encrypt("my-secret");
        SecretCrypto disabled = new SecretCrypto(null);

        IllegalStateException e =
                assertThrows(IllegalStateException.class, () -> disabled.decrypt(encrypted));
        assertTrue(e.getMessage().contains(SecretCrypto.ENV_KEY));
    }

    // ── Tampering / wrong key ─────────────────────────────────────────────────

    @Test
    void decrypt_withWrongKey_throws() {
        String encrypted = new SecretCrypto(VALID_KEY).encrypt("my-secret");
        byte[] otherRaw = new byte[32];
        java.util.Arrays.fill(otherRaw, (byte) 0x7f);
        SecretCrypto other = new SecretCrypto(Base64.getEncoder().encodeToString(otherRaw));

        assertThrows(IllegalStateException.class, () -> other.decrypt(encrypted));
    }

    @Test
    void decrypt_malformedValue_throws() {
        SecretCrypto crypto = new SecretCrypto(VALID_KEY);
        assertThrows(IllegalStateException.class, () -> crypto.decrypt("enc:v1:garbage"));
        assertThrows(IllegalStateException.class, () -> crypto.decrypt("enc:v1:aXY=:%%%"));
    }
}

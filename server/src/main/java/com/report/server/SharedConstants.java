package com.report.server;

import java.util.regex.Pattern;

/**
 * Cross-language shared constants (#425). The single source of truth is {@code
 * schemas/shared-constants.json} (imported directly by the frontend); this class mirrors the values
 * for Java and {@code SharedConstantsTest} pins the parity, so drift fails the build instead of
 * surfacing as a runtime mismatch. Replaces the previous per-class copies with "must match frontend
 * constant" comments.
 */
public final class SharedConstants {

    private SharedConstants() {}

    /** ID of the product master system group ({@code __productMaster__}). */
    public static final String SYSTEM_GROUP_PRODUCT_MASTER = "__productMaster__";

    /** ScalarDB identifier grammar (namespace / table / column / binding keys). */
    public static final String DB_IDENTIFIER_PATTERN = "^[a-zA-Z_][a-zA-Z0-9_]*$";

    /** Compiled form of {@link #DB_IDENTIFIER_PATTERN}. */
    public static final Pattern DB_IDENTIFIER = Pattern.compile(DB_IDENTIFIER_PATTERN);
}

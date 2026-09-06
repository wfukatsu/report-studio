package com.report.server.logging;

import ch.qos.logback.core.PropertyDefinerBase;

/**
 * {@code <define name="LOG_APPENDER" class="…LogFormatAppenderDefiner"/>} for {@code logback.xml}
 * (#502): resolves {@code LOG_FORMAT} to the console appender name the root logger should use —
 * {@code JSON} for {@code LOG_FORMAT=json}, {@code CONSOLE} (human-readable pattern) otherwise.
 *
 * <p>Why a property definer and not {@code <if>}: logback 1.6 dropped the janino-scripted {@code
 * <if condition="…">} attribute, and its replacement ({@code <condition class="…">}) neither
 * accepts a wrapped {@code <root>} nor may be nested inside one — either way the root logger ended
 * up with <em>no</em> appender and the server logged nothing. A plain {@code ${LOG_APPENDER}}
 * substitution in {@code <appender-ref>} has no such phase-ordering caveat.
 */
public final class LogFormatAppenderDefiner extends PropertyDefinerBase {

    public static final String ENV = "LOG_FORMAT";
    public static final String JSON_APPENDER = "JSON";
    public static final String TEXT_APPENDER = "CONSOLE";

    @Override
    public String getPropertyValue() {
        return appenderFor(System.getProperty(ENV), System.getenv(ENV));
    }

    /** Pure decision: system property first (tests / ad-hoc runs), then the environment. */
    static String appenderFor(String systemProperty, String env) {
        String value = systemProperty != null && !systemProperty.isBlank() ? systemProperty : env;
        return value != null && "json".equalsIgnoreCase(value.trim())
                ? JSON_APPENDER
                : TEXT_APPENDER;
    }
}

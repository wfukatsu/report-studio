package com.report.server;

/** Thrown when an e-Tax XML document fails XSD validation. */
public final class XmlValidationException extends Exception {

    private final String schemaVersion;

    public XmlValidationException(String schemaVersion, String message, Throwable cause) {
        super(message, cause);
        this.schemaVersion = schemaVersion;
    }

    public String getSchemaVersion() {
        return schemaVersion;
    }
}

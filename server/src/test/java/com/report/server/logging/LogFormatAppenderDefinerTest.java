package com.report.server.logging;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class LogFormatAppenderDefinerTest {

    @Test
    void jsonOnlyWhenRequested() {
        assertEquals("CONSOLE", LogFormatAppenderDefiner.appenderFor(null, null));
        assertEquals("CONSOLE", LogFormatAppenderDefiner.appenderFor("", "text"));
        assertEquals("JSON", LogFormatAppenderDefiner.appenderFor(null, "json"));
        assertEquals("JSON", LogFormatAppenderDefiner.appenderFor(null, " JSON "));
        assertEquals("JSON", LogFormatAppenderDefiner.appenderFor("json", "text")); // property wins
        assertEquals("CONSOLE", LogFormatAppenderDefiner.appenderFor("text", "json"));
    }
}

package com.report.server;

import static org.junit.jupiter.api.Assertions.assertTrue;

import ch.qos.logback.classic.Logger;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

/**
 * Guards against a silent logging outage (#502): logback 1.6 stopped honouring the deprecated
 * {@code <if condition="…">} attribute form, which left the root logger without any appender — the
 * server started fine but wrote no application log at all.
 */
class LoggingConfigTest {

    @Test
    void rootLoggerHasAConsoleAppender() {
        Logger root = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
        assertTrue(
                root.iteratorForAppenders().hasNext(),
                "logback.xml must attach an appender to <root> (see #502)");
        // default (no LOG_FORMAT) = human-readable console pattern
        assertTrue(root.getAppender("CONSOLE") != null, "CONSOLE appender expected by default");
    }
}

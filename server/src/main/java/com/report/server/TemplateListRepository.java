package com.report.server;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Simple file-based template metadata store. Stores template list as JSON in data/templates.json.
 *
 * <p>ScalarDB's partition-key-only table doesn't support full scans efficiently, so we use a simple
 * JSON file for the template index (lightweight for local dev).
 */
public final class TemplateListRepository {

    private static final Logger log = LoggerFactory.getLogger(TemplateListRepository.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Path INDEX_FILE = Path.of("data", "templates.json");

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record FormSettings(
            boolean published,
            @JsonProperty("passwordHash") String passwordHash,
            String defaultMode) {
        public static final FormSettings DEFAULT = new FormSettings(false, null, "standard");
    }

    public record TemplateMeta(
            String id,
            String name,
            long updatedAt,
            @JsonInclude(JsonInclude.Include.NON_NULL) FormSettings formSettings) {
        /** Backwards-compatible constructor for existing code. */
        public TemplateMeta(String id, String name, long updatedAt) {
            this(id, name, updatedAt, null);
        }
    }

    public synchronized List<TemplateMeta> list() {
        return readIndex();
    }

    public synchronized TemplateMeta create(String name) {
        List<TemplateMeta> index = readIndex();
        String id = "tmpl-" + UUID.randomUUID();
        TemplateMeta meta = new TemplateMeta(id, name, System.currentTimeMillis());
        index.add(meta);
        writeIndex(index);
        log.info("Created template: {} ({})", id, name);
        return meta;
    }

    public synchronized boolean delete(String id) {
        List<TemplateMeta> index = readIndex();
        boolean removed = index.removeIf(t -> t.id().equals(id));
        if (removed) {
            writeIndex(index);
            log.info("Deleted template: {}", id);
        }
        return removed;
    }

    public synchronized Optional<TemplateMeta> findById(String id) {
        return readIndex().stream().filter(t -> t.id().equals(id)).findFirst();
    }

    public synchronized void updateFormSettings(String id, FormSettings settings) {
        List<TemplateMeta> index = readIndex();
        Optional<TemplateMeta> existing = index.stream().filter(t -> t.id().equals(id)).findFirst();
        if (existing.isPresent()) {
            TemplateMeta old = existing.get();
            index.remove(old);
            index.add(new TemplateMeta(old.id(), old.name(), System.currentTimeMillis(), settings));
            writeIndex(index);
            log.info("Updated form settings for template: {}", id);
        }
    }

    public synchronized void touch(String id, String name) {
        List<TemplateMeta> index = readIndex();
        Optional<TemplateMeta> existing = index.stream().filter(t -> t.id().equals(id)).findFirst();
        FormSettings preservedSettings = existing.map(TemplateMeta::formSettings).orElse(null);
        existing.ifPresent(index::remove);
        index.add(new TemplateMeta(id, name, System.currentTimeMillis(), preservedSettings));
        writeIndex(index);
    }

    private List<TemplateMeta> readIndex() {
        if (!Files.exists(INDEX_FILE)) {
            return new ArrayList<>();
        }
        try {
            return MAPPER.readValue(INDEX_FILE.toFile(), new TypeReference<>() {});
        } catch (IOException e) {
            // Back up the corrupt file before returning empty list so data is not silently lost
            Path backup = INDEX_FILE.resolveSibling("templates.json.bak");
            try {
                Files.copy(INDEX_FILE, backup, StandardCopyOption.REPLACE_EXISTING);
                log.error("Corrupt template index — backed up to {}: {}", backup, e.getMessage());
            } catch (IOException be) {
                log.error("Failed to back up corrupt template index: {}", e.getMessage());
            }
            return new ArrayList<>();
        }
    }

    private void writeIndex(List<TemplateMeta> index) {
        try {
            Files.createDirectories(INDEX_FILE.getParent());
            // Atomic write: write to temp file then rename to prevent corrupt index on crash
            Path tmp = INDEX_FILE.resolveSibling("templates.json.tmp");
            MAPPER.writerWithDefaultPrettyPrinter().writeValue(tmp.toFile(), index);
            Files.move(
                    tmp,
                    INDEX_FILE,
                    StandardCopyOption.REPLACE_EXISTING,
                    StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            log.error("Failed to write template index", e);
        }
    }
}

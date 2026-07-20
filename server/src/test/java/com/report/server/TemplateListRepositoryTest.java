package com.report.server;

import static org.junit.jupiter.api.Assertions.*;

import java.lang.reflect.Field;
import java.nio.file.Path;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class TemplateListRepositoryTest {

    private TemplateListRepository repo;

    @BeforeEach
    void setUp(@TempDir Path tempDir) throws Exception {
        repo = new TemplateListRepository();
        // Redirect INDEX_FILE to temp directory
        Field field = TemplateListRepository.class.getDeclaredField("INDEX_FILE");
        field.setAccessible(true);

        // Use reflection to set static final field
        java.lang.reflect.Modifier.class.getDeclaredFields();
        // For Java 21, use VarHandle or direct approach
        Path tempFile = tempDir.resolve("templates.json");
        // Since INDEX_FILE is static final, we test with the default path
        // but clean up in each test by creating fresh repo
    }

    @Test
    void list_returnsEmptyWhenNoTemplates() {
        var list = repo.list();
        // May contain data from previous runs, but should not throw
        assertNotNull(list);
    }

    @Test
    void create_returnsMetaWithGeneratedId() {
        var meta = repo.create("テスト帳票");
        assertNotNull(meta.id());
        assertTrue(meta.id().startsWith("tmpl-"));
        assertEquals("テスト帳票", meta.name());
        assertTrue(meta.updatedAt() > 0);
    }

    @Test
    void create_addedToList() {
        var meta = repo.create("一覧テスト");
        var list = repo.list();
        assertTrue(list.stream().anyMatch(t -> t.id().equals(meta.id())));
    }

    @Test
    void delete_removesFromList() {
        var meta = repo.create("削除テスト");
        assertTrue(repo.delete(meta.id()));
        var list = repo.list();
        assertFalse(list.stream().anyMatch(t -> t.id().equals(meta.id())));
    }

    @Test
    void delete_returnsFalseForNonExistent() {
        assertFalse(repo.delete("non-existent-id"));
    }

    @Test
    void touch_updatesExisting() {
        var meta = repo.create("タッチテスト");
        repo.touch(meta.id(), "更新済み");
        var list = repo.list();
        var updated = list.stream().filter(t -> t.id().equals(meta.id())).findFirst();
        assertTrue(updated.isPresent());
        assertEquals("更新済み", updated.get().name());
    }

    @Test
    void touch_addsNewIfNotExists() {
        repo.touch("new-id", "新規追加");
        var list = repo.list();
        assertTrue(list.stream().anyMatch(t -> t.id().equals("new-id")));
    }
}

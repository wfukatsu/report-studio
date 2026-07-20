package com.report.server;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.scalar.db.api.Delete;
import com.scalar.db.api.DistributedTransaction;
import com.scalar.db.api.DistributedTransactionManager;
import com.scalar.db.api.Get;
import com.scalar.db.api.Put;
import com.scalar.db.api.Result;
import com.scalar.db.api.Scan;
import com.scalar.db.service.TransactionFactory;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * Unit tests for {@link VersionRepository} core methods (create / list / get / label / delete)
 * against a mocked ScalarDB transaction manager — mirrors the mock-based wiring used by the
 * controller tests (no live storage).
 */
class VersionRepositoryTest {

    private DistributedTransactionManager manager;
    private DistributedTransaction tx;
    private VersionRepository repo;

    @BeforeEach
    void setUp() throws Exception {
        manager = mock(DistributedTransactionManager.class);
        tx = mock(DistributedTransaction.class);
        when(manager.start()).thenReturn(tx);
        repo = new VersionRepository(mock(TransactionFactory.class), manager);
    }

    /** Builds a mocked scan Result row for the template_versions table. */
    private Result row(String versionId, String templateId, String label, long at, boolean auto) {
        Result r = mock(Result.class);
        when(r.getText("version_id")).thenReturn(versionId);
        when(r.getText("template_id")).thenReturn(templateId);
        when(r.getText("label")).thenReturn(label);
        when(r.getBigInt("created_at")).thenReturn(at);
        when(r.getBoolean("is_auto")).thenReturn(auto);
        return r;
    }

    // ── createVersion ────────────────────────────────────────────────────────

    @Test
    void createVersion_putsRowAndCommits() throws Exception {
        String versionId = repo.createVersion("tmpl-1", "{\"pages\":[]}", "手動保存", false);

        assertTrue(versionId.startsWith("ver-"), "version id should be ver-prefixed");
        ArgumentCaptor<Put> putCaptor = ArgumentCaptor.forClass(Put.class);
        verify(tx).put(putCaptor.capture());
        verify(tx).commit();
        Put put = putCaptor.getValue();
        assertEquals("report_studio", put.forNamespace().orElse(""));
        assertEquals("template_versions", put.forTable().orElse(""));
    }

    @Test
    void createVersion_nullLabelStoredAsEmpty() throws Exception {
        repo.createVersion("tmpl-1", "{}", null, true);
        verify(tx).put(any(Put.class));
        verify(tx).commit();
    }

    @Test
    void createVersion_wrapsFailureAndAborts() throws Exception {
        doThrow(new RuntimeException("write failed")).when(tx).put(any(Put.class));

        assertThrows(
                JsonBlobRepository.RepositoryException.class,
                () -> repo.createVersion("tmpl-1", "{}", "x", false));
        verify(tx).abort();
        verify(tx, never()).commit();
    }

    // ── listVersions ─────────────────────────────────────────────────────────

    @Test
    void listVersions_returnsRowsSortedNewestFirst() throws Exception {
        Result old = row("ver-old", "tmpl-1", "旧", 1000L, false);
        Result newest = row("ver-new", "tmpl-1", "新", 3000L, true);
        Result mid = row("ver-mid", "tmpl-1", "中", 2000L, false);
        when(tx.scan(any(Scan.class))).thenReturn(List.of(old, newest, mid));

        List<VersionRepository.VersionMeta> versions = repo.listVersions("tmpl-1");

        verify(tx).commit();
        assertEquals(3, versions.size());
        assertEquals("ver-new", versions.get(0).versionId());
        assertEquals("ver-mid", versions.get(1).versionId());
        assertEquals("ver-old", versions.get(2).versionId());
        assertTrue(versions.get(0).isAuto());
        assertEquals("新", versions.get(0).label());
        assertEquals("tmpl-1", versions.get(0).templateId());
    }

    @Test
    void listVersions_emptyForUnknownTemplate() throws Exception {
        when(tx.scan(any(Scan.class))).thenReturn(List.of());

        assertTrue(repo.listVersions("tmpl-none").isEmpty());
    }

    @Test
    void listVersions_wrapsScanFailure() throws Exception {
        when(tx.scan(any(Scan.class))).thenThrow(new RuntimeException("scan failed"));

        assertThrows(
                JsonBlobRepository.RepositoryException.class, () -> repo.listVersions("tmpl-1"));
        verify(tx).abort();
    }

    // ── getVersion ───────────────────────────────────────────────────────────

    @Test
    void getVersion_returnsStoredJson() throws Exception {
        Result r = mock(Result.class);
        when(r.getText("json_data")).thenReturn("{\"pages\":[1]}");
        when(tx.get(any(Get.class))).thenReturn(Optional.of(r));

        Optional<String> json = repo.getVersion("ver-1");

        assertEquals("{\"pages\":[1]}", json.orElseThrow());
        verify(tx).commit();
    }

    @Test
    void getVersion_emptyForUnknownId() throws Exception {
        when(tx.get(any(Get.class))).thenReturn(Optional.empty());

        assertTrue(repo.getVersion("ver-missing").isEmpty());
    }

    // ── updateLabel / deleteVersion ──────────────────────────────────────────

    @Test
    void updateLabel_putsAndCommits() throws Exception {
        repo.updateLabel("ver-1", "リリース版");

        verify(tx).put(any(Put.class));
        verify(tx).commit();
    }

    @Test
    void deleteVersion_deletesAndCommits() throws Exception {
        repo.deleteVersion("ver-1");

        verify(tx).delete(any(Delete.class));
        verify(tx).commit();
    }

    @Test
    void deleteVersion_swallowsFailure() throws Exception {
        doThrow(new RuntimeException("delete failed")).when(tx).delete(any(Delete.class));

        assertDoesNotThrow(() -> repo.deleteVersion("ver-1"));
        verify(tx).abort();
    }

    // ── createAutoVersionIfNeeded ────────────────────────────────────────────

    @Test
    void createAutoVersionIfNeeded_skipsWithinInterval() throws Exception {
        long justNow = System.currentTimeMillis() - 1000; // 1s ago — inside the 5min gate
        Result recent = row("ver-auto", "tmpl-1", "", justNow, true);
        when(tx.scan(any(Scan.class))).thenReturn(List.of(recent));

        assertFalse(repo.createAutoVersionIfNeeded("tmpl-1", "{}"));
        verify(tx, never()).put(any(Put.class));
    }

    @Test
    void createAutoVersionIfNeeded_createsAfterInterval() throws Exception {
        long old = System.currentTimeMillis() - 10 * 60 * 1000; // 10min ago
        Result stale = row("ver-auto", "tmpl-1", "", old, true);
        when(tx.scan(any(Scan.class))).thenReturn(List.of(stale));

        assertTrue(repo.createAutoVersionIfNeeded("tmpl-1", "{}"));
        verify(tx).put(any(Put.class));
    }
}

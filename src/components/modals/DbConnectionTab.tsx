/**
 * DbConnectionTab — Phase 1 ScalarDB schema binding UI.
 *
 * A tab inside `DataBindingModal` that lets a user bind each SchemaGroup in
 * the current report's schema to an existing ScalarDB table, and map each
 * SchemaField to a column on that table. The resulting bindings are
 * persisted via the existing template auto-save (no new endpoint).
 *
 * Design notes (see docs/plans/2026-04-10-feat-scalardb-schema-binding-phase1-plan.md):
 *  - Inline catalog fetch via useEffect + AbortController (no separate hook).
 *  - `<select>` dropdowns rather than drag-and-drop.
 *  - Stale `dbColumnName` values preserved via synthetic disabled <option>.
 *  - 再取得 button re-runs the fetch after external schema changes.
 *
 * Phase 1.5: Each unbound group shows an inline "このスキーマからテーブルを作成"
 * button that expands a CreateTableForm. After creation + binding the form
 * collapses and the catalog is re-fetched automatically.
 */
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useReportStore } from '@/store'
import { fetchScalarDbCatalogCached, invalidateScalarDbCatalogCache } from '@/api/reportApi'
import type { ScalarDbCatalog } from '@/api/reportApi'
import { GroupBindingSection } from './dbConnection/GroupBindingSection'

const CreateTableForm = lazy(() =>
  import('./dbConnection/CreateTableForm').then((m) => ({ default: m.CreateTableForm })),
)

const EMPTY_GROUPS = Object.freeze([]) as readonly never[]

export const DbConnectionTab = memo(function DbConnectionTab() {
  // Select the stable schema reference first — returning a fresh `[]` inline
  // creates a new snapshot on every call and triggers an infinite loop in
  // React's useSyncExternalStore.
  const schema = useReportStore((s) => s.definition.schema)
  const groups = schema?.groups ?? EMPTY_GROUPS
  const [catalog, setCatalog] = useState<ScalarDbCatalog | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [fetchTick, setFetchTick] = useState(0)
  const firstSelectRef = useRef<HTMLSelectElement | null>(null)

  // Track which group has the create-table form open (at most one at a time).
  const [createFormGroupId, setCreateFormGroupId] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    setIsLoading(true)
    setFetchError(null)
    // Use cached fetch; force=true when user explicitly clicks 再取得
    fetchScalarDbCatalogCached(controller.signal, fetchTick > 0)
      .then((result) => {
        if (cancelled) return
        setCatalog(result)
        setIsLoading(false)
      })
      .catch((err) => {
        if (cancelled || controller.signal.aborted) return
        setCatalog(null)
        setIsLoading(false)
        setFetchError(formatFetchError(err))
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [fetchTick])

  useEffect(() => {
    if (!isLoading && catalog && groups.length > 0) {
      firstSelectRef.current?.focus()
    }
  }, [isLoading, catalog, groups.length])

  const handleRefetch = useCallback(() => {
    invalidateScalarDbCatalogCache()
    setFetchTick((n) => n + 1)
  }, [])

  // Stable callbacks for the create form so GroupBindingSection memo isn't broken
  const handleCreateSuccess = useCallback(() => {
    setCreateFormGroupId(null)
    handleRefetch()
  }, [handleRefetch])
  const handleCreateCancel = useCallback(() => setCreateFormGroupId(null), [])

  // Memoize namespace name list — avoids allocating a new array per group per render
  const namespaceNames = useMemo(
    () => catalog?.namespaces.map((n) => n.name) ?? [],
    [catalog],
  )

  // Empty: no schema groups at all — nothing to bind.
  if (groups.length === 0) {
    return (
      <div className="p-6">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          DB 接続
        </h3>
        <p className="text-xs text-muted-foreground">
          スキーマグループがありません。まずはスキーマタブでグループを追加してください。
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Header with 再取得 button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            DB 接続
          </h3>
          <p className="text-[10px] text-muted-foreground mt-1">
            既存の ScalarDB テーブルにスキーマグループを紐付けます。
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefetch}
          className="text-[11px] px-2 py-1 rounded border border-border hover:bg-accent transition-colors"
          disabled={isLoading}
        >
          再取得
        </button>
      </div>

      {isLoading && (
        <p className="text-xs text-muted-foreground">
          ScalarDB カタログを取得中...
        </p>
      )}

      {fetchError !== null && !isLoading && (
        <div className="border border-destructive/40 bg-destructive/5 rounded p-3 text-xs" role="alert" aria-live="assertive" aria-atomic="true">
          <p className="text-destructive font-medium">{fetchError}</p>
          <p className="text-muted-foreground mt-1">
            既存のバインド情報は保持されています。再試行するには「再取得」を押してください。
          </p>
        </div>
      )}

      {!isLoading && !fetchError && catalog && catalog.namespaces.length === 0 && (
        <div className="text-xs text-muted-foreground border border-border rounded p-3 space-y-1">
          <p className="font-medium">テーブルが見つかりません。</p>
          <p>以下のいずれかの方法でテーブルを作成してください：</p>
          <ul className="list-disc list-inside space-y-0.5 mt-1">
            <li>グループごとの「このスキーマからテーブルを作成」ボタンを使用する</li>
            <li>ScalarDB 管理ツールでテーブルを作成して「再取得」を押す</li>
          </ul>
        </div>
      )}

      {!isLoading && !fetchError && catalog && catalog.namespaces.length > 0 && (
        <div className="flex flex-col gap-5">
          {groups.map((group, idx) => {
            const isActive = createFormGroupId === group.id
            return (
              <GroupBindingSection
                key={group.id}
                group={group}
                catalog={catalog}
                autoFocusRef={idx === 0 ? firstSelectRef : undefined}
                onShowCreate={() => setCreateFormGroupId(group.id)}
                showCreateForm={isActive}
                createFormSlot={
                  // Only instantiate Suspense + CreateTableForm for the active group.
                  // Gating behind isActive restores the React.lazy benefit — the chunk
                  // is not fetched until the user first clicks "このスキーマからテーブルを作成".
                  isActive ? (
                    <Suspense fallback={<p className="text-[11px] text-muted-foreground">読み込み中...</p>}>
                      <CreateTableForm
                        group={group}
                        namespaces={namespaceNames}
                        onSuccess={handleCreateSuccess}
                        onCancel={handleCreateCancel}
                      />
                    </Suspense>
                  ) : null
                }
              />
            )
          })}
        </div>
      )}
    </div>
  )
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFetchError(err: unknown): string {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status: number }).status
    if (status === 503) return 'ScalarDB に接続できません (503)'
  }
  if (err instanceof Error) return `ScalarDB カタログの取得に失敗しました: ${err.message}`
  return 'ScalarDB カタログの取得に失敗しました'
}

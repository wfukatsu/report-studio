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
 *    Per-mount re-fetch is acceptable in Phase 1; tab-switch unmount = refetch.
 *  - `<select>` dropdowns rather than drag-and-drop (keyboard accessible,
 *    testable, less surprising than v1's DropZone).
 *  - Stale `dbColumnName` values are preserved via a synthetic disabled
 *    <option> labelled "(列が存在しません)" — controlled select round-trips
 *    without data loss.
 *  - No type-compatibility warnings, no "already mapped" dot, no Unlink/Reset
 *    split. All deferred to Phase 2 per the technical review.
 *  - 解除 button clears tableMeta AND every field's dbColumnName atomically
 *    via the dedicated `bindGroupToTable(id, undefined)` store action.
 *  - 再取得 button re-runs the fetch, giving users a visible affordance after
 *    external schema changes.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useReportStore } from '@/store'
import { fetchScalarDbCatalog } from '@/api/reportApi'
import type {
  ScalarDbCatalog,
  ScalarDbCatalogNamespace,
  ScalarDbCatalogTable,
} from '@/api/reportApi'
import type { SchemaField, SchemaGroup, ScalarDbTableMeta } from '@/types'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const EMPTY_GROUPS: readonly SchemaGroup[] = Object.freeze([])

export const DbConnectionTab = memo(function DbConnectionTab() {
  // Select the stable schema reference first — returning a fresh `[]` inline
  // creates a new snapshot on every call and triggers an infinite loop in
  // React's useSyncExternalStore.
  const schema = useReportStore((s) => s.definition.schema)
  const groups = schema?.groups ?? EMPTY_GROUPS
  const [catalog, setCatalog] = useState<ScalarDbCatalog | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fetchTick, setFetchTick] = useState(0)
  const firstSelectRef = useRef<HTMLSelectElement | null>(null)

  // Inline catalog fetch. Each mount (and each 再取得 click via fetchTick)
  // opens a fresh AbortController; the effect cleanup aborts it on unmount
  // or before the next run.
  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    setIsLoading(true)
    setError(null)
    fetchScalarDbCatalog(controller.signal)
      .then((result) => {
        if (cancelled) return
        setCatalog(result)
        setIsLoading(false)
      })
      .catch((err) => {
        if (cancelled || controller.signal.aborted) return
        setCatalog(null)
        setIsLoading(false)
        setError(formatFetchError(err))
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [fetchTick])

  // Auto-focus the first namespace select once groups + catalog are ready.
  useEffect(() => {
    if (!isLoading && catalog && groups.length > 0) {
      firstSelectRef.current?.focus()
    }
  }, [isLoading, catalog, groups.length])

  const handleRefetch = useCallback(() => {
    setFetchTick((n) => n + 1)
  }, [])

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

      {error !== null && !isLoading && (
        <div className="border border-destructive/40 bg-destructive/5 rounded p-3 text-xs">
          <p className="text-destructive font-medium">{error}</p>
          <p className="text-muted-foreground mt-1">
            既存のバインド情報は保持されています。再試行するには「再取得」を押してください。
          </p>
        </div>
      )}

      {!isLoading && !error && catalog && catalog.namespaces.length === 0 && (
        <p className="text-xs text-muted-foreground border border-border rounded p-3">
          テーブルを含むネームスペースが見つかりません。ScalarDB にテーブルを作成してから再取得してください。
        </p>
      )}

      {!isLoading && !error && catalog && catalog.namespaces.length > 0 && (
        <div className="flex flex-col gap-5">
          {groups.map((group, idx) => (
            <GroupBindingSection
              key={group.id}
              group={group}
              catalog={catalog}
              autoFocusRef={idx === 0 ? firstSelectRef : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
})

// ---------------------------------------------------------------------------
// Per-group binding section
// ---------------------------------------------------------------------------

interface GroupBindingSectionProps {
  group: SchemaGroup
  catalog: ScalarDbCatalog
  autoFocusRef?: React.MutableRefObject<HTMLSelectElement | null>
}

function GroupBindingSection({ group, catalog, autoFocusRef }: GroupBindingSectionProps) {
  const bindGroupToTable = useReportStore((s) => s.bindGroupToTable)
  const updateSchemaField = useReportStore((s) => s.updateSchemaField)

  const boundNamespace = group.tableMeta?.namespace ?? ''
  const boundTableName = group.tableMeta?.tableName ?? ''

  // Local UI state for the namespace dropdown. This is the single source of
  // truth for the namespace `<select>`; the store is only written when the
  // user actually picks a table. This deliberately lets users *browse* the
  // namespace list without clearing their existing binding — a namespace
  // change on its own is non-destructive.
  const [pendingNamespace, setPendingNamespace] = useState<string>(boundNamespace)

  // Re-sync when the store's binding changes externally (e.g. 解除 pressed,
  // or another edit dispatched a bindGroupToTable via a different code path).
  useEffect(() => {
    setPendingNamespace(boundNamespace)
  }, [boundNamespace])

  // The table-select is populated from the *pending* namespace. If the user
  // is browsing a different namespace than the current binding, the table
  // list reflects the new namespace — but we don't write anything yet.
  const pendingNamespaceEntry: ScalarDbCatalogNamespace | undefined =
    pendingNamespace
      ? catalog.namespaces.find((n) => n.name === pendingNamespace)
      : undefined

  // The table-select's controlled value: only show the bound table name when
  // the user is looking at the namespace that table lives in. Otherwise the
  // select falls back to the empty placeholder, preventing a React
  // "value not in options" warning without destroying the store state.
  const effectiveTableValue =
    pendingNamespace === boundNamespace ? boundTableName : ''

  // The currently-showing table metadata (for populating the field column
  // list). Only defined when what the user is looking at matches a real
  // binding in the fetched catalog.
  const currentTable: ScalarDbCatalogTable | undefined =
    effectiveTableValue
      ? pendingNamespaceEntry?.tables.find((t) => t.name === effectiveTableValue)
      : undefined

  // Stale detection — the bound namespace/table no longer exists in the
  // fetched catalog. We surface this symmetrically to the field-column
  // case via a synthetic disabled <option>, so the controlled select never
  // silently resets and the bound state is visible to the user.
  const staleNamespace =
    boundNamespace !== '' &&
    !catalog.namespaces.some((n) => n.name === boundNamespace)
  const staleTableName =
    boundNamespace !== '' &&
    boundTableName !== '' &&
    !staleNamespace &&
    pendingNamespace === boundNamespace &&
    pendingNamespaceEntry !== undefined &&
    !pendingNamespaceEntry.tables.some((t) => t.name === boundTableName)

  const handleNamespaceChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      // Namespace change is UI-only — it does NOT write to the store.
      // The store is updated once the user picks a table, at which point
      // bindGroupToTable handles the "rebind to different table" semantics
      // (clearing per-field dbColumnName hints as needed).
      setPendingNamespace(e.target.value)
    },
    [],
  )

  const handleTableChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const nextTableName = e.target.value
      if (nextTableName === '' || pendingNamespace === '') {
        // Explicit "(未選択)" on the table select unbinds the group.
        bindGroupToTable(group.id, undefined)
        return
      }
      const meta: ScalarDbTableMeta = {
        namespace: pendingNamespace,
        tableName: nextTableName,
      }
      bindGroupToTable(group.id, meta)
    },
    [bindGroupToTable, group.id, pendingNamespace],
  )

  const handleUnbind = useCallback(() => {
    bindGroupToTable(group.id, undefined)
    setPendingNamespace('')
  }, [bindGroupToTable, group.id])

  const handleColumnChange = useCallback(
    (fieldId: string, nextColumnName: string) => {
      updateSchemaField(group.id, fieldId, {
        dbColumnName: nextColumnName === '' ? undefined : nextColumnName,
      })
    },
    [group.id, updateSchemaField],
  )

  const nsSelectId = `dbconn-ns-${group.id}`
  const tableSelectId = `dbconn-tbl-${group.id}`

  return (
    <section className="border border-border rounded-md p-3 flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <h4 className="text-xs font-semibold">
          {group.label}
          <span
            className={cn(
              'ml-2 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide',
              group.role === 'master'
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {group.role}
          </span>
        </h4>
        {group.tableMeta && (
          <button
            type="button"
            onClick={handleUnbind}
            className="text-[11px] px-2 py-1 rounded border border-border hover:bg-accent transition-colors"
          >
            解除
          </button>
        )}
      </header>

      {/* Namespace + table selects */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={nsSelectId} className="text-[10px] text-muted-foreground">
            ネームスペース
          </label>
          <select
            id={nsSelectId}
            ref={autoFocusRef}
            value={pendingNamespace}
            onChange={handleNamespaceChange}
            className="text-xs border border-border rounded px-2 py-1.5 bg-background"
          >
            <option value="">(未選択)</option>
            {catalog.namespaces.map((ns) => (
              <option key={ns.name} value={ns.name}>
                {ns.name}
              </option>
            ))}
            {/* Synthetic disabled option for a stale bound namespace —
                preserves the controlled value without a React warning. */}
            {staleNamespace && (
              <option value={boundNamespace} disabled>
                {boundNamespace} (ネームスペースが存在しません)
              </option>
            )}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={tableSelectId} className="text-[10px] text-muted-foreground">
            テーブル
          </label>
          <select
            id={tableSelectId}
            value={effectiveTableValue}
            onChange={handleTableChange}
            disabled={!pendingNamespace}
            className="text-xs border border-border rounded px-2 py-1.5 bg-background disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">(未選択)</option>
            {pendingNamespaceEntry?.tables.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
            {staleTableName && (
              <option value={boundTableName} disabled>
                {boundTableName} (テーブルが存在しません)
              </option>
            )}
          </select>
        </div>
      </div>

      {/* Field → column mapping table */}
      {currentTable && (
        <FieldColumnMap
          groupId={group.id}
          fields={group.fields}
          table={currentTable}
          onColumnChange={handleColumnChange}
        />
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Per-field column select rows
// ---------------------------------------------------------------------------

interface FieldColumnMapProps {
  groupId: string
  fields: SchemaField[]
  table: ScalarDbCatalogTable
  onColumnChange: (fieldId: string, columnName: string) => void
}

function FieldColumnMap({ groupId, fields, table, onColumnChange }: FieldColumnMapProps) {
  if (fields.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground pl-1">
        このグループにはフィールドがありません。
      </p>
    )
  }

  return (
    <div className="border-t border-border pt-2">
      <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">
        フィールド ↔ DB カラム
      </div>
      <ul className="flex flex-col gap-1.5">
        {fields.map((field) => (
          <FieldColumnRow
            key={field.id}
            groupId={groupId}
            field={field}
            table={table}
            onColumnChange={onColumnChange}
          />
        ))}
      </ul>
    </div>
  )
}

interface FieldColumnRowProps {
  groupId: string
  field: SchemaField
  table: ScalarDbCatalogTable
  onColumnChange: (fieldId: string, columnName: string) => void
}

function FieldColumnRow({ groupId, field, table, onColumnChange }: FieldColumnRowProps) {
  const current = field.dbColumnName ?? ''
  const columnExists = current === '' || table.columns.some((c) => c.name === current)
  const selectId = `dbconn-col-${groupId}-${field.id}`
  const displayLabel = field.label || field.key

  return (
    <li className="grid grid-cols-[1fr_1fr] gap-2 items-center">
      <label htmlFor={selectId} className="text-[11px] truncate">
        {displayLabel}
        <span className="ml-1 text-[9px] text-muted-foreground">DB カラム</span>
      </label>
      <select
        id={selectId}
        value={current}
        onChange={(e) => onColumnChange(field.id, e.target.value)}
        className="text-xs border border-border rounded px-2 py-1 bg-background"
      >
        <option value="">(未選択)</option>
        {table.columns.map((c) => (
          <option key={c.name} value={c.name}>
            {c.name}
            {c.keyType ? ` [${c.keyType}]` : ''}
          </option>
        ))}
        {/* Synthetic disabled option preserves a stale dbColumnName so the
            controlled select round-trips without data loss if the column
            was renamed/removed externally. */}
        {!columnExists && (
          <option value={current} disabled>
            {current} (列が存在しません)
          </option>
        )}
      </select>
    </li>
  )
}

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

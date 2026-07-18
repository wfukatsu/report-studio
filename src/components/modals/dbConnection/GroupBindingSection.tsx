/**
 * GroupBindingSection — per-group binding UI inside DbConnectionTab.
 *
 * Renders the namespace / table dropdowns and the field ↔ column map for
 * a single SchemaGroup. Phase 1.5 also mounts an inline CreateTableForm
 * for unbound groups (wired via the onShowCreate / showCreateForm props).
 */
import { memo, useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useReportStore } from '@/store'
import type {
  ScalarDbCatalog,
  ScalarDbCatalogNamespace,
  ScalarDbCatalogTable,
} from '@/api/reportApi'
import type { SchemaGroup, ScalarDbTableMeta } from '@/types'
import { cn } from '@/lib/utils'
import { FieldColumnMap } from './FieldColumnMap'

export interface GroupBindingSectionProps {
  group: SchemaGroup
  catalog: ScalarDbCatalog
  autoFocusRef?: React.MutableRefObject<HTMLSelectElement | null>
  /** Called when the "このスキーマからテーブルを作成" button is clicked. */
  onShowCreate: () => void
  /** Whether the inline creation form is currently open. */
  showCreateForm?: boolean
  /** Slot for rendering the creation form inline. */
  createFormSlot?: React.ReactNode
}

export const GroupBindingSection = memo(function GroupBindingSection({
  group,
  catalog,
  autoFocusRef,
  onShowCreate,
  showCreateForm = false,
  createFormSlot,
}: GroupBindingSectionProps) {
  const bindGroupToTable = useReportStore((s) => s.bindGroupToTable)
  const bindGroupToTableWithColumns = useReportStore((s) => s.bindGroupToTableWithColumns)
  const updateSchemaField = useReportStore((s) => s.updateSchemaField)

  const boundNamespace = group.tableMeta?.namespace ?? ''
  const boundTableName = group.tableMeta?.tableName ?? ''

  // Local UI state for the namespace dropdown. This is the single source of
  // truth for the namespace <select>; the store is only written when the
  // user actually picks a table. This deliberately lets users *browse* the
  // namespace list without clearing their existing binding.
  const [pendingNamespace, setPendingNamespace] = useState<string>(boundNamespace)

  // Re-sync when the store's binding changes externally (e.g. 解除 pressed).
  useEffect(() => {
    setPendingNamespace(boundNamespace)
  }, [boundNamespace])

  const pendingNamespaceEntry: ScalarDbCatalogNamespace | undefined =
    pendingNamespace
      ? catalog.namespaces.find((n) => n.name === pendingNamespace)
      : undefined

  const effectiveTableValue =
    pendingNamespace === boundNamespace ? boundTableName : ''

  const currentTable: ScalarDbCatalogTable | undefined =
    effectiveTableValue
      ? pendingNamespaceEntry?.tables.find((t) => t.name === effectiveTableValue)
      : undefined

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
      setPendingNamespace(e.target.value)
    },
    [],
  )

  const handleTableChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const nextTableName = e.target.value
      if (nextTableName === '' || pendingNamespace === '') {
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

  // Non-destructive unbind: snapshot the current binding, clear it, and offer a
  // one-click "元に戻す" that fully restores the table + column mappings. This
  // replaces the old blocking confirm dialog — the undo toast is the safety net.
  const handleUnbind = useCallback(() => {
    const prevTableMeta = group.tableMeta
    if (!prevTableMeta) return
    const prevColumns = group.fields
      .filter((f) => f.dbColumnName)
      .map((f) => ({ fieldId: f.id, dbColumnName: f.dbColumnName as string }))

    bindGroupToTable(group.id, undefined)
    setPendingNamespace('')

    toast.success(`「${group.label}」のテーブル連携を解除しました`, {
      action: {
        label: '元に戻す',
        onClick: () => bindGroupToTableWithColumns(group.id, prevTableMeta, prevColumns),
      },
    })
  }, [bindGroupToTable, bindGroupToTableWithColumns, group.id, group.label, group.tableMeta, group.fields])

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
            title="テーブル連携を解除（解除後に「元に戻す」で復元できます）"
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

      {/* Phase 1.5: inline table creation for unbound groups */}
      {!group.tableMeta && (
        <div className="border-t border-border pt-2">
          {!showCreateForm ? (
            <button
              type="button"
              onClick={onShowCreate}
              className="text-[11px] px-2 py-1 rounded border border-border hover:bg-accent transition-colors"
            >
              このスキーマからテーブルを作成
            </button>
          ) : (
            createFormSlot
          )}
        </div>
      )}
    </section>
  )
})

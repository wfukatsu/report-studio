/**
 * CreateTableForm — Phase 1.5 inline table creation form.
 *
 * Renders inside GroupBindingSection for unbound groups. Pre-populates
 * column definitions from the group's SchemaFields, lets the user tweak
 * names / types / key roles, then POSTs to /api/v2/scalardb/tables.
 *
 * On success:
 *  1. Calls bindGroupToTableWithColumns (atomic tableMeta + field dbColumnNames)
 *  2. Calls onSuccess() → parent refreshes catalog + collapses form
 *
 * Status machine is local component state (not persisted to SchemaGroup).
 * See Technical Considerations in the Phase 1.5 plan.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useReportStore } from '@/store'
import { createScalarDbTable } from '@/api/reportApi'
import type { SchemaGroup, SchemaFieldType } from '@/types'
import type { ScalarDbColumnType } from '@/types/scalardb'
import { SCHEMA_FIELD_TYPE_TO_SCALARDB_COLUMN_TYPE } from '@/types/scalardb'
import { validateScalarDbIdentifier } from '@/lib/scalardbIdentifier'
import { MAX_COLUMNS_PER_TABLE, MAX_PARTITION_KEYS, MAX_CLUSTERING_KEYS, MAX_SECONDARY_INDEXES } from '@/lib/scalardbLimits'
import { classifyCreateTableError } from './classifyCreateTableError'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateTableFormProps {
  group: SchemaGroup
  namespaces: string[]
  onSuccess: () => void
  onCancel: () => void
}

type KeyRole = 'none' | 'partition' | 'clustering' | 'index'

interface ColumnRow {
  fieldId: string
  name: string
  type: ScalarDbColumnType
  keyRole: KeyRole
}

const ALL_COLUMN_TYPES: ScalarDbColumnType[] = [
  'BOOLEAN', 'INT', 'BIGINT', 'FLOAT', 'DOUBLE', 'TEXT', 'BLOB',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultColumnType(fieldType: Exclude<SchemaFieldType, 'array'>): ScalarDbColumnType {
  return SCHEMA_FIELD_TYPE_TO_SCALARDB_COLUMN_TYPE[fieldType]
}

function buildColumns(group: SchemaGroup): ColumnRow[] {
  const nonArrayFields = group.fields.filter((f) => f.type !== 'array')

  return nonArrayFields.map((field, idx) => {
    // Default key roles: master → first field is PK; detail → first=PK, second=CK
    let keyRole: KeyRole = 'none'
    if (idx === 0) keyRole = 'partition'
    else if (group.role === 'detail' && idx === 1) keyRole = 'clustering'

    return {
      fieldId: field.id,
      name: field.key,
      type: defaultColumnType(field.type as Exclude<SchemaFieldType, 'array'>),
      keyRole,
    }
  })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateTableForm({ group, namespaces, onSuccess, onCancel }: CreateTableFormProps) {
  const bindGroupToTableWithColumns = useReportStore((s) => s.bindGroupToTableWithColumns)

  const hasArrayFields = group.fields.some((f) => f.type === 'array')

  const [namespace, setNamespace] = useState('')
  const [isNewNamespace, setIsNewNamespace] = useState(false)
  const [newNamespaceName, setNewNamespaceName] = useState('')
  const [tableName, setTableName] = useState('')
  const [columns, setColumns] = useState<ColumnRow[]>(() => buildColumns(group))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [correlationId, setCorrelationId] = useState<string | null>(null)
  const [showRecovery, setShowRecovery] = useState(false)
  const [showRetry, setShowRetry] = useState(false)

  const effectiveNamespace = isNewNamespace ? newNamespaceName : namespace

  // AbortController for the in-flight POST — aborted on cancel or unmount
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => { abortRef.current?.abort() }, [])

  const updateColumn = useCallback(
    (idx: number, patch: Partial<ColumnRow>) => {
      setColumns((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)))
    },
    [],
  )

  const handleSubmit = useCallback(async () => {
    // Client-side validation
    if (!effectiveNamespace) {
      setErrorMessage('ネームスペースを選択または入力してください')
      return
    }
    if (!tableName) {
      setErrorMessage('テーブル名を入力してください')
      return
    }
    const nsValidation = validateScalarDbIdentifier(effectiveNamespace)
    if (!nsValidation.valid) {
      setErrorMessage(nsValidation.error)
      return
    }
    const tableValidation = validateScalarDbIdentifier(tableName)
    if (!tableValidation.valid) {
      setErrorMessage(tableValidation.error)
      return
    }

    // Validate column count
    if (columns.length > MAX_COLUMNS_PER_TABLE) {
      setErrorMessage(`列が多すぎます (最大 ${MAX_COLUMNS_PER_TABLE})`)
      return
    }

    // Validate partition/clustering key counts
    const partitionKeys = columns.filter((c) => c.keyRole === 'partition').map((c) => c.name)
    const clusteringKeys = columns.filter((c) => c.keyRole === 'clustering').map((c) => c.name)
    const secondaryIndexes = columns.filter((c) => c.keyRole === 'index').map((c) => c.name)

    if (partitionKeys.length === 0) {
      setErrorMessage('パーティションキーを 1 つ以上選択してください')
      return
    }
    if (partitionKeys.length > MAX_PARTITION_KEYS) {
      setErrorMessage(`パーティションキーが多すぎます (最大 ${MAX_PARTITION_KEYS})`)
      return
    }
    if (clusteringKeys.length > MAX_CLUSTERING_KEYS) {
      setErrorMessage(`クラスタリングキーが多すぎます (最大 ${MAX_CLUSTERING_KEYS})`)
      return
    }
    if (secondaryIndexes.length > MAX_SECONDARY_INDEXES) {
      setErrorMessage(`セカンダリインデックスが多すぎます (最大 ${MAX_SECONDARY_INDEXES})`)
      return
    }

    // Validate column name identifiers
    for (const col of columns) {
      const colValidation = validateScalarDbIdentifier(col.name)
      if (!colValidation.valid) {
        setErrorMessage(colValidation.error)
        return
      }
    }

    setIsSubmitting(true)
    setErrorMessage(null)
    setCorrelationId(null)
    setShowRecovery(false)
    setShowRetry(false)

    // Abort any previous in-flight request and create a fresh controller
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const result = await createScalarDbTable({
        namespace: effectiveNamespace,
        tableName,
        columns: columns.map((c) => ({ name: c.name, type: c.type })),
        partitionKeys,
        clusteringKeys,
        secondaryIndexes,
      }, controller.signal)

      // Atomic bind: tableMeta + all field→column mappings in one store action.
      // Match by column name (not by index) — ScalarDB does not guarantee that
      // getColumnNames() returns columns in insertion order, so positional
      // alignment would silently produce wrong field→column bindings.
      const localByName = new Map(columns.map((c) => [c.name, c.fieldId]))
      bindGroupToTableWithColumns(
        group.id,
        { namespace: effectiveNamespace, tableName },
        result.columns
          .map((col) => ({ fieldId: localByName.get(col.name) ?? '', dbColumnName: col.name }))
          .filter((fc) => fc.fieldId !== ''),
      )

      onSuccess()
    } catch (err) {
      const info = classifyCreateTableError(err)
      setShowRetry(info.showRetry)
      setShowRecovery(info.showRecovery)
      if (info.correlationId) setCorrelationId(info.correlationId)
      setErrorMessage(errorCodeToMessage(info.code))
    } finally {
      setIsSubmitting(false)
    }
  }, [
    effectiveNamespace,
    tableName,
    columns,
    group.id,
    bindGroupToTableWithColumns,
    onSuccess,
  ])

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); handleSubmit() }}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
      className="flex flex-col gap-3 p-2 bg-muted/30 rounded border border-border"
    >
      <h5 className="text-[11px] font-semibold">テーブルを新規作成</h5>

      {/* Namespace */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-muted-foreground" id="ctf-ns-label">
          ネームスペース
        </label>
        <select
          aria-labelledby="ctf-ns-label"
          value={isNewNamespace ? '__new__' : namespace}
          onChange={(e) => {
            if (e.target.value === '__new__') {
              setIsNewNamespace(true)
              setNamespace('')
            } else {
              setIsNewNamespace(false)
              setNamespace(e.target.value)
            }
          }}
          className="text-xs border border-border rounded px-2 py-1.5 bg-background"
        >
          <option value="">(未選択)</option>
          {namespaces.map((ns) => (
            <option key={ns} value={ns}>{ns}</option>
          ))}
          <option value="__new__">(新規作成...)</option>
        </select>
        {isNewNamespace && (
          <input
            type="text"
            aria-label="新しいネームスペース名"
            value={newNamespaceName}
            onChange={(e) => setNewNamespaceName(e.target.value)}
            placeholder="新しいネームスペース名"
            className="text-xs border border-border rounded px-2 py-1.5 bg-background mt-1"
          />
        )}
      </div>

      {/* Table name */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-muted-foreground" htmlFor="ctf-table-name">
          テーブル名
        </label>
        <input
          id="ctf-table-name"
          type="text"
          value={tableName}
          onChange={(e) => setTableName(e.target.value)}
          placeholder="table_name"
          className="text-xs border border-border rounded px-2 py-1.5 bg-background"
        />
      </div>

      {/* Array field notice */}
      {hasArrayFields && (
        <p className="text-[10px] text-muted-foreground border border-border rounded p-2">
          ※ array 型フィールドは ScalarDB の単一カラムにマッピングできないため除外されています。
        </p>
      )}

      {/* Column rows */}
      <div className="flex flex-col gap-2">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
          カラム定義
        </div>
        <div className="grid grid-cols-[1fr_auto_auto] gap-1 text-[10px] text-muted-foreground px-1">
          <span>カラム名</span>
          <span>型</span>
          <span aria-label="キーロール">キーロール</span>
        </div>
        {columns.map((col, idx) => (
          <div key={col.fieldId} className="grid grid-cols-[1fr_auto_auto] gap-1 items-center">
            <input
              type="text"
              aria-label={`column-name-${idx}`}
              value={col.name}
              onChange={(e) => updateColumn(idx, { name: e.target.value })}
              className="text-xs border border-border rounded px-2 py-1 bg-background"
            />
            <select
              aria-label={`type-${idx}`}
              value={col.type}
              onChange={(e) => updateColumn(idx, { type: e.target.value as ScalarDbColumnType })}
              className="text-xs border border-border rounded px-2 py-1 bg-background"
            >
              {ALL_COLUMN_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              aria-label={`キーロール-${idx}`}
              value={col.keyRole}
              onChange={(e) => updateColumn(idx, { keyRole: e.target.value as KeyRole })}
              className="text-xs border border-border rounded px-2 py-1 bg-background"
            >
              <option value="none">-</option>
              <option value="partition">partition</option>
              <option value="clustering">clustering</option>
              <option value="index">index</option>
            </select>
          </div>
        ))}
      </div>

      {/* Error display */}
      {errorMessage && (
        <div className="border border-destructive/40 bg-destructive/5 rounded p-2 text-xs flex flex-col gap-1">
          <p className="text-destructive">{errorMessage}</p>
          {correlationId && (
            <p className="text-muted-foreground text-[10px]">相関 ID: {correlationId}</p>
          )}
          {showRecovery && (
            <button
              type="button"
              onClick={() => {
                // Recovery: close form so user can bind to the existing table via dropdowns
                onCancel()
              }}
              className="text-[11px] px-2 py-1 rounded border border-border hover:bg-accent transition-colors self-start"
            >
              代わりに既存テーブルにバインドする
            </button>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] px-2 py-1 rounded border border-border hover:bg-accent transition-colors"
        >
          キャンセル
        </button>
        {showRetry && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="text-[11px] px-2 py-1 rounded border border-border hover:bg-accent transition-colors disabled:opacity-50"
          >
            再試行
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="text-[11px] px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isSubmitting ? '作成中...' : 'テーブルを作成'}
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Error code → Japanese message mapping
// ---------------------------------------------------------------------------

function errorCodeToMessage(code: string): string {
  switch (code) {
    case 'invalid_request':
      return 'リクエストが不正です。入力内容を確認してください。'
    case 'conflict':
      return 'テーブルは既に存在します。'
    case 'unauth':
      return 'ScalarDB 認証に失敗しました。'
    case 'forbidden':
      return 'ScalarDB 権限が足りません。'
    case 'unreachable':
      return 'ScalarDB に接続できません。しばらく待ってから再試行してください。'
    case 'network':
      return 'ネットワークエラーが発生しました。接続を確認してから再試行してください。'
    default:
      return 'テーブル作成に失敗しました。'
  }
}

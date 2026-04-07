/**
 * SchemaPanel — left sidebar tab for managing the data schema.
 * Groups: master (single record) / detail (array rows).
 * Fields: key, label, type — edited inline, committed on blur.
 */

import { memo, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useReportStore } from '@/store'
import type { SchemaField, SchemaFieldType, SchemaGroup } from '@/types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIELD_TYPE_OPTIONS: { value: SchemaFieldType; label: string }[] = [
  { value: 'string',  label: 'テキスト' },
  { value: 'number',  label: '数値' },
  { value: 'date',    label: '日付' },
  { value: 'boolean', label: '真偽値' },
  { value: 'array',   label: '配列' },
  { value: 'image',   label: '画像' },
]

// ---------------------------------------------------------------------------
// Field row — inline editable
// ---------------------------------------------------------------------------

const FieldRow = memo(function FieldRow({
  field,
  onUpdate,
  onRemove,
}: {
  field: SchemaField
  onUpdate: (patch: Partial<Omit<SchemaField, 'id'>>) => void
  onRemove: () => void
}) {
  // Local state for in-progress edits — committed to store on blur
  const [localKey, setLocalKey] = useState(field.key)
  const [localLabel, setLocalLabel] = useState(field.label)

  return (
    <div className="flex items-center gap-1 py-0.5">
      <input
        className="border rounded px-1 py-0.5 text-xs bg-background w-20 font-mono"
        value={localKey}
        onChange={(e) => setLocalKey(e.target.value)}
        onBlur={() => {
          const trimmed = localKey.trim()
          if (trimmed && trimmed !== field.key) onUpdate({ key: trimmed })
          else setLocalKey(field.key) // reset if empty or unchanged
        }}
        placeholder="key"
        aria-label="フィールドキー"
      />
      <input
        className="border rounded px-1 py-0.5 text-xs bg-background flex-1 min-w-0"
        value={localLabel}
        onChange={(e) => setLocalLabel(e.target.value)}
        onBlur={() => {
          if (localLabel !== field.label) onUpdate({ label: localLabel })
        }}
        placeholder="ラベル"
        aria-label="フィールドラベル"
      />
      <select
        className="border rounded px-1 py-0.5 text-xs bg-background shrink-0"
        value={field.type}
        onChange={(e) => onUpdate({ type: e.target.value as SchemaFieldType })}
        aria-label="フィールド型"
      >
        {FIELD_TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
        aria-label="フィールドを削除"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Group section — collapsible
// ---------------------------------------------------------------------------

const GroupSection = memo(function GroupSection({
  group,
  onUpdateGroup,
  onRemoveGroup,
  onAddField,
  onUpdateField,
  onRemoveField,
}: {
  group: SchemaGroup
  onUpdateGroup: (patch: Partial<Pick<SchemaGroup, 'label' | 'role' | 'dataKey'>>) => void
  onRemoveGroup: () => void
  onAddField: () => void
  onUpdateField: (fieldId: string, patch: Partial<Omit<SchemaField, 'id'>>) => void
  onRemoveField: (fieldId: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [localLabel, setLocalLabel] = useState(group.label)
  const [localDataKey, setLocalDataKey] = useState(group.dataKey)

  return (
    <div className="border rounded mb-2">
      {/* Group header */}
      <div className="flex items-center gap-1 px-2 py-1 bg-muted/40">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="text-muted-foreground hover:text-foreground shrink-0"
          aria-label={collapsed ? 'グループを展開' : 'グループを折り畳む'}
        >
          {collapsed
            ? <ChevronRight className="w-3 h-3" />
            : <ChevronDown className="w-3 h-3" />}
        </button>

        {/* Group label */}
        <input
          className="border rounded px-1 py-0.5 text-xs bg-background flex-1 min-w-0"
          value={localLabel}
          onChange={(e) => setLocalLabel(e.target.value)}
          onBlur={() => {
            if (localLabel !== group.label) onUpdateGroup({ label: localLabel })
          }}
          placeholder="グループ名"
          aria-label="グループ名"
        />

        {/* Role badge */}
        <span className={`text-[9px] px-1 rounded font-mono shrink-0 ${
          group.role === 'master'
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
            : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
        }`}>
          {group.role}
        </span>

        <button
          type="button"
          onClick={onRemoveGroup}
          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
          aria-label="グループを削除"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Group body */}
      {!collapsed && (
        <div className="px-2 py-1.5 space-y-1">
          {/* dataKey input (for detail groups — used in binding paths) */}
          {group.role === 'detail' && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground shrink-0">データキー:</span>
              <input
                className="border rounded px-1 py-0.5 text-xs bg-background flex-1 min-w-0 font-mono"
                value={localDataKey}
                onChange={(e) => setLocalDataKey(e.target.value)}
                onBlur={() => {
                  if (localDataKey !== group.dataKey) onUpdateGroup({ dataKey: localDataKey })
                }}
                placeholder="例: items"
                aria-label="データキー（バインディングパスで使用）"
              />
            </div>
          )}

          {/* Fields */}
          {group.fields.map((f) => (
            <FieldRow
              key={f.id}
              field={f}
              onUpdate={(patch) => onUpdateField(f.id, patch)}
              onRemove={() => onRemoveField(f.id)}
            />
          ))}

          {/* Add field button */}
          <button
            type="button"
            onClick={onAddField}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors mt-1"
          >
            <Plus className="w-3 h-3" />
            フィールド追加
          </button>
        </div>
      )}
    </div>
  )
})

// ---------------------------------------------------------------------------
// SchemaPanel — main component
// ---------------------------------------------------------------------------

export const SchemaPanel = memo(function SchemaPanel() {
  const schema = useReportStore((s) => s.definition.schema)
  const groups = useReportStore(useShallow((s) => s.definition.schema?.groups ?? []))

  const {
    addSchemaGroup,
    removeSchemaGroup,
    updateSchemaGroup,
    addSchemaField,
    removeSchemaField,
    updateSchemaField,
  } = useReportStore()

  return (
    <div className="p-3 space-y-2">
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => addSchemaGroup('master')}
          className="flex items-center gap-1 text-xs border rounded px-2 py-1 bg-background hover:bg-accent transition-colors"
        >
          <Plus className="w-3 h-3" />
          master グループ
        </button>
        <button
          type="button"
          onClick={() => addSchemaGroup('detail')}
          className="flex items-center gap-1 text-xs border rounded px-2 py-1 bg-background hover:bg-accent transition-colors"
        >
          <Plus className="w-3 h-3" />
          detail グループ
        </button>
      </div>

      {groups.length === 0 && (
        <p className="text-[10px] text-muted-foreground italic">
          スキーマ未定義（フラットキー入力で動作します）
        </p>
      )}

      {groups.map((g) => (
        <GroupSection
          key={g.id}
          group={g}
          onUpdateGroup={(patch) => updateSchemaGroup(g.id, patch)}
          onRemoveGroup={() => removeSchemaGroup(g.id)}
          onAddField={() => addSchemaField(g.id, { key: '', label: '', type: 'string' })}
          onUpdateField={(fieldId, patch) => updateSchemaField(g.id, fieldId, patch)}
          onRemoveField={(fieldId) => removeSchemaField(g.id, fieldId)}
        />
      ))}

      {schema && groups.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {groups.reduce((n, g) => n + g.fields.length, 0)} フィールド定義
        </p>
      )}
    </div>
  )
})

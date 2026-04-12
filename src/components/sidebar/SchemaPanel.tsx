/**
 * SchemaPanel — left sidebar tab for managing the data schema.
 * Groups: master (single record) / detail (array rows).
 * Fields: key, label, type — edited inline, committed on blur.
 * "JSONから推測" — infers schema groups/fields from a pasted JSON sample.
 */

import { memo, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { ChevronDown, ChevronRight, Plus, Trash2, Wand2 } from 'lucide-react'
import { useReportStore } from '@/store'
import type { SchemaField, SchemaFieldType, SchemaGroup, SchemaDefinition } from '@/types'
import { v4 as uuidv4 } from 'uuid'

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
  const [localExpression, setLocalExpression] = useState(field.expression ?? '')

  return (
    <div className="py-0.5">
      <div className="flex items-center gap-1">
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
          disabled={!!field.computed}
        >
          {FIELD_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {/* Phase 3: computed field toggle */}
        <button
          type="button"
          title={field.computed ? 'DB カラムに戻す' : '計算フィールドに変更'}
          onClick={() => {
            if (field.computed) {
              onUpdate({ computed: undefined, expression: undefined })
            } else {
              onUpdate({ computed: true, expression: '' })
            }
          }}
          className={`shrink-0 text-[10px] px-1 rounded border transition-colors ${
            field.computed
              ? 'bg-amber-100 border-amber-400 text-amber-700 hover:bg-amber-200'
              : 'text-muted-foreground border-transparent hover:border-muted hover:bg-muted/50'
          }`}
          aria-label={field.computed ? 'DB フィールドに変更' : '計算フィールドに変更'}
        >
          {field.computed ? 'fx' : '≡'}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
          aria-label="フィールドを削除"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      {/* Phase 3: expression input for computed fields */}
      {field.computed && (
        <div className="mt-0.5 flex items-center gap-1 pl-1">
          <span className="text-[10px] text-amber-600 font-mono shrink-0">fx =</span>
          <input
            className="border border-amber-300 rounded px-1 py-0.5 text-xs bg-background flex-1 font-mono"
            value={localExpression}
            onChange={(e) => setLocalExpression(e.target.value)}
            onBlur={() => {
              if (localExpression !== (field.expression ?? '')) {
                onUpdate({ expression: localExpression || undefined })
              }
            }}
            placeholder="例: price * qty * 1.1"
            aria-label="計算式（JEXL）"
          />
        </div>
      )}
    </div>
  )
})

// ---------------------------------------------------------------------------
// Group section — collapsible
// ---------------------------------------------------------------------------

const GroupSection = memo(function GroupSection({
  group,
  masterGroups,
  onUpdateGroup,
  onRemoveGroup,
  onAddField,
  onUpdateField,
  onRemoveField,
}: {
  group: SchemaGroup
  masterGroups: SchemaGroup[]
  onUpdateGroup: (patch: Partial<Pick<SchemaGroup, 'label' | 'role' | 'dataKey' | 'linkedMasterGroupId'>>) => void
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

          {/* Phase 3.5: parent master group linker (for detail groups) */}
          {group.role === 'detail' && masterGroups.length > 0 && (
            <div className="flex items-center gap-1 mb-1">
              <span className="text-[10px] text-muted-foreground shrink-0">親グループ:</span>
              <select
                className="border rounded px-1 py-0.5 text-[10px] bg-background flex-1"
                value={group.linkedMasterGroupId ?? ''}
                onChange={(e) => onUpdateGroup({ linkedMasterGroupId: e.target.value || undefined })}
                aria-label="親グループ"
              >
                <option value="">（手動入力）</option>
                {masterGroups.map((mg) => (
                  <option key={mg.id} value={mg.id}>{mg.label || mg.id}</option>
                ))}
              </select>
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
// Schema inference — pure client-side, mirrors V2SchemaInferController logic
// ---------------------------------------------------------------------------

function inferFieldType(value: unknown): SchemaFieldType {
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (Array.isArray(value)) return 'array'
  return 'string'
}

function inferSchemaFromSample(sample: Record<string, unknown>): SchemaDefinition {
  const masterFields: SchemaField[] = []
  const detailGroups: SchemaGroup[] = []

  for (const [key, value] of Object.entries(sample)) {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
      // Detail group — array of objects
      const seenKeys: Map<string, unknown> = new Map()
      for (const row of (value as Record<string, unknown>[]).slice(0, 5)) {
        for (const [k, v] of Object.entries(row)) {
          if (!seenKeys.has(k)) seenKeys.set(k, v)
        }
      }
      const fields: SchemaField[] = Array.from(seenKeys.entries()).map(([k, v]) => ({
        id: uuidv4(), key: k, label: k, type: inferFieldType(v),
      }))
      detailGroups.push({ id: uuidv4(), label: key, role: 'detail', dataKey: key, fields })
    } else {
      masterFields.push({ id: uuidv4(), key, label: key, type: inferFieldType(value) })
    }
  }

  const groups: SchemaGroup[] = []
  if (masterFields.length > 0) {
    groups.push({ id: uuidv4(), label: 'マスター', role: 'master', dataKey: '', fields: masterFields })
  }
  groups.push(...detailGroups)
  return { groups }
}

// ---------------------------------------------------------------------------
// InferPanel — collapsible JSON input for schema inference
// ---------------------------------------------------------------------------

const InferPanel = memo(function InferPanel({
  onInferred,
}: {
  onInferred: (schema: SchemaDefinition) => void
}) {
  const [open, setOpen] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleInfer = () => {
    setError(null)
    try {
      const parsed = JSON.parse(jsonText)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setError('JSONオブジェクトを入力してください')
        return
      }
      onInferred(inferSchemaFromSample(parsed as Record<string, unknown>))
      setOpen(false)
      setJsonText('')
    } catch {
      setError('JSONの解析に失敗しました')
    }
  }

  return (
    <div className="border rounded mb-2 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 w-full px-2 py-1.5 text-muted-foreground hover:text-foreground transition-colors text-left"
        aria-expanded={open}
      >
        <Wand2 className="w-3 h-3 shrink-0" />
        <span>JSON から推測</span>
        {open ? <ChevronDown className="w-3 h-3 ml-auto" /> : <ChevronRight className="w-3 h-3 ml-auto" />}
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-1">
          <p className="text-[10px] text-muted-foreground">サンプルJSONを貼り付けてください。配列フィールドは detail グループになります。</p>
          <textarea
            className="w-full border rounded px-1.5 py-1 text-xs font-mono bg-background resize-none h-24"
            placeholder='{"name": "Alice", "items": [{"qty": 1}]}'
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            aria-label="スキーマ推測用JSONサンプル"
          />
          {error && (
            <p role="alert" className="text-[10px] text-destructive">{error}</p>
          )}
          <button
            type="button"
            onClick={handleInfer}
            disabled={!jsonText.trim()}
            className="px-2 py-1 rounded bg-primary text-primary-foreground text-[10px] hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            推測して適用
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
  const masterGroups = groups.filter((g) => g.role === 'master')

  const {
    addSchemaGroup,
    removeSchemaGroup,
    updateSchemaGroup,
    addSchemaField,
    removeSchemaField,
    updateSchemaField,
    setSchema,
  } = useReportStore()

  return (
    <div className="p-3 space-y-2">
      <InferPanel onInferred={setSchema} />
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
        <div className="text-[10px] text-muted-foreground space-y-1">
          <p className="font-medium">スキーマ未設定</p>
          <p>グループとフィールドを追加すると、ScalarDB から実データを取得してプレビューできます。</p>
          <p>設定しなくても <span className="font-mono bg-muted px-0.5 rounded">{'{{fieldName}}'}</span> 形式でサンプルデータを参照できます。</p>
        </div>
      )}

      {groups.map((g) => (
        <GroupSection
          key={g.id}
          group={g}
          masterGroups={masterGroups}
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

/**
 * SchemaGroupBlock — Collapsible group of schema fields for the center panel.
 *
 * Shows fields with binding status, type, and computed indicator.
 * Supports inline field addition and computed field dialog trigger.
 */

import { memo, useCallback, useState } from 'react'
import {
  ChevronDown, ChevronRight, Plus, Trash2, FunctionSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SchemaGroup, SchemaField } from '@/types'

interface SchemaGroupBlockProps {
  readonly group: SchemaGroup
  readonly expanded: boolean
  readonly boundFieldIds: ReadonlySet<string>
  readonly addingField: boolean
  readonly onToggle: (groupId: string) => void
  readonly onAddField: (groupId: string, field: Omit<SchemaField, 'id'>) => void
  readonly onRemoveField: (groupId: string, fieldId: string) => void
  readonly onSetAddingField: (groupId: string | null) => void
  readonly onBulkGenerate?: (groupId: string) => void
  readonly onOpenComputedDialog?: (groupId: string) => void
  readonly onConnect?: (fieldId: string) => void
  readonly fieldRef: (fieldId: string, el: HTMLElement | null) => void
  readonly onPointerDown: (e: React.PointerEvent, fieldId: string) => void
  readonly onPointerMove: (e: React.PointerEvent, fieldId: string) => void
  readonly selectedFieldId: string | null
  readonly fieldBoundCount: ReadonlyMap<string, number>
}

export const SchemaGroupBlock = memo(function SchemaGroupBlock({
  group,
  expanded,
  boundFieldIds,
  addingField,
  onToggle,
  onAddField,
  onRemoveField,
  onSetAddingField,
  onBulkGenerate,
  onOpenComputedDialog,
  onConnect,
  fieldRef,
  onPointerDown,
  onPointerMove,
  selectedFieldId,
  fieldBoundCount,
}: SchemaGroupBlockProps) {
  const handleToggle = useCallback(() => onToggle(group.id), [onToggle, group.id])
  const boundCount = group.fields.filter((f) => boundFieldIds.has(f.id)).length

  return (
    <div className="border-b last:border-b-0">
      {/* Group header */}
      <button
        className="w-full flex items-center gap-1 px-3 py-1.5 bg-muted/20 text-[10px] font-medium text-muted-foreground hover:bg-muted/40 transition-colors"
        onClick={handleToggle}
        data-schemagroup-id={group.id}
      >
        {expanded
          ? <ChevronDown className="w-3 h-3 shrink-0" />
          : <ChevronRight className="w-3 h-3 shrink-0" />}
        <span className="truncate">{group.label || group.id}</span>
        <span className={cn(
          'text-[9px] px-1 rounded shrink-0',
          group.role === 'master' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700',
        )}>
          {group.role}
        </span>
        <span className="ml-auto text-[9px] opacity-60">
          {boundCount}/{group.fields.length}
        </span>
      </button>

      {/* Field list */}
      {expanded && (
        <>
          {group.fields.length === 0 ? (
            <div className="px-3 py-1.5 text-[10px] text-muted-foreground italic border-b">
              フィールドなし
            </div>
          ) : (
            group.fields.map((field) => (
              <FieldCard
                key={field.id}
                field={field}
                groupId={group.id}
                isSelected={selectedFieldId === field.id}
                boundCount={fieldBoundCount.get(field.id) ?? 0}
                onConnect={onConnect}
                onRemove={onRemoveField}
                fieldRef={fieldRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
              />
            ))
          )}

          {/* Footer: add field / computed field */}
          <div className="flex items-center gap-1 px-2 py-1 border-b">
            {addingField ? (
              <InlineAddField
                groupId={group.id}
                onAdd={onAddField}
                onCancel={() => onSetAddingField(null)}
              />
            ) : (
              <>
                <button
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-1 py-0.5"
                  onClick={() => onSetAddingField(group.id)}
                >
                  <Plus className="w-3 h-3" /> フィールド
                </button>
                {onOpenComputedDialog && (
                  <button
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-1 py-0.5"
                    onClick={() => onOpenComputedDialog(group.id)}
                  >
                    <FunctionSquare className="w-3 h-3" /> 計算式
                  </button>
                )}
                {onBulkGenerate && (
                  <button
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-1 py-0.5 ml-auto"
                    onClick={() => onBulkGenerate(group.id)}
                  >
                    一括生成
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
})

// ---------------------------------------------------------------------------
// FieldCard
// ---------------------------------------------------------------------------

interface FieldCardProps {
  readonly field: SchemaField
  readonly groupId: string
  readonly isSelected: boolean
  readonly boundCount: number
  readonly onConnect?: (fieldId: string) => void
  readonly onRemove: (groupId: string, fieldId: string) => void
  readonly fieldRef: (fieldId: string, el: HTMLElement | null) => void
  readonly onPointerDown: (e: React.PointerEvent, fieldId: string) => void
  readonly onPointerMove: (e: React.PointerEvent, fieldId: string) => void
}

const FieldCard = memo(function FieldCard({
  field,
  groupId,
  isSelected,
  boundCount,
  onConnect,
  onRemove,
  fieldRef,
  onPointerDown,
  onPointerMove,
}: FieldCardProps) {
  return (
    <button
      ref={(el) => fieldRef(field.id, el)}
      data-field-id={field.id}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left border-b last:border-b-0 transition-colors select-none',
        isSelected
          ? 'bg-primary/10 border-l-2 border-l-primary'
          : 'hover:bg-accent',
      )}
      onClick={() => onConnect?.(field.id)}
      onPointerDown={(e) => onPointerDown(e, field.id)}
      onPointerMove={(e) => onPointerMove(e, field.id)}
      title={field.dbColumnName ? `DB: ${field.dbColumnName}` : undefined}
    >
      {field.computed && (
        <FunctionSquare className="w-3 h-3 text-orange-500 shrink-0" />
      )}
      <span className="flex-1 truncate font-medium">{field.label || field.key}</span>
      <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[30%]">
        {field.key}
      </span>
      {boundCount > 0 && (
        <span className="text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 shrink-0">
          {boundCount}
        </span>
      )}
      <button
        className="text-muted-foreground hover:text-destructive p-0.5 shrink-0 opacity-0 group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(groupId, field.id)
        }}
        title="フィールドを削除"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </button>
  )
})

// ---------------------------------------------------------------------------
// InlineAddField
// ---------------------------------------------------------------------------

interface InlineAddFieldProps {
  readonly groupId: string
  readonly onAdd: (groupId: string, field: Omit<SchemaField, 'id'>) => void
  readonly onCancel: () => void
}

function InlineAddField({ groupId, onAdd, onCancel }: InlineAddFieldProps) {
  const [name, setName] = useState('')

  const handleSubmit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const key = trimmed.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
    onAdd(groupId, { key, label: trimmed, type: 'string' } as Omit<SchemaField, 'id'>)
    setName('')
  }

  return (
    <div className="flex items-center gap-1 w-full">
      <input
        autoFocus
        className="flex-1 text-[10px] border rounded px-1.5 py-0.5 bg-background"
        placeholder="フィールド名"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit()
          if (e.key === 'Escape') onCancel()
        }}
      />
      <button
        className="text-[10px] text-primary hover:underline"
        onClick={handleSubmit}
      >
        追加
      </button>
      <button
        className="text-[10px] text-muted-foreground hover:text-foreground"
        onClick={onCancel}
      >
        ✕
      </button>
    </div>
  )
}

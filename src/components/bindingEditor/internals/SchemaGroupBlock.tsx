/**
 * SchemaGroupBlock — Collapsible schema group with group-colored header.
 *
 * Improved: larger click targets, group color stripe, better role badges,
 * hover state for connection highlighting.
 */

import { memo, useCallback, useState } from 'react'
import {
  ChevronDown, ChevronRight, Plus, Trash2, FunctionSquare, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getGroupColor } from '../types'
import type { SchemaGroup, SchemaField } from '@/types'

interface SchemaGroupBlockProps {
  readonly group: SchemaGroup
  readonly groupIndex: number
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
  readonly hoveredFieldId: string | null
  readonly onHoverField: (fieldId: string | null) => void
}

export const SchemaGroupBlock = memo(function SchemaGroupBlock({
  group,
  groupIndex,
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
  hoveredFieldId,
  onHoverField,
}: SchemaGroupBlockProps) {
  const handleToggle = useCallback(() => onToggle(group.id), [onToggle, group.id])
  const boundCount = group.fields.filter((f) => boundFieldIds.has(f.id)).length
  const color = getGroupColor(groupIndex)

  return (
    <div className="border-b last:border-b-0">
      {/* Group header with color stripe */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/30 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
        onClick={handleToggle}
        data-schemagroup-id={group.id}
        style={{ borderLeft: `3px solid ${color}` }}
      >
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
        <span className="truncate font-medium">{group.label || group.id}</span>
        <span className={cn(
          'text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0',
          group.role === 'master'
            ? 'bg-blue-100 text-blue-700 border border-blue-200'
            : 'bg-amber-100 text-amber-700 border border-amber-200',
        )}>
          {group.role === 'master' ? 'マスター' : '明細'}
        </span>
        <span className={cn(
          'ml-auto text-[10px] px-1.5 py-0.5 rounded-full',
          boundCount === group.fields.length && group.fields.length > 0
            ? 'bg-green-100 text-green-700'
            : 'bg-muted text-muted-foreground',
        )}>
          {boundCount}/{group.fields.length}
        </span>
      </button>

      {/* Field list */}
      {expanded && (
        <>
          {group.fields.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground italic">
              フィールドがありません
            </div>
          ) : (
            group.fields.map((field) => (
              <FieldCard
                key={field.id}
                field={field}
                groupId={group.id}
                groupIndex={groupIndex}
                isSelected={selectedFieldId === field.id}
                isHovered={hoveredFieldId === field.id}
                boundCount={fieldBoundCount.get(field.id) ?? 0}
                onConnect={onConnect}
                onRemove={onRemoveField}
                fieldRef={fieldRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onHoverField={onHoverField}
              />
            ))
          )}

          {/* Footer: add field / computed field */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-t border-dashed">
            {addingField ? (
              <InlineAddField
                groupId={group.id}
                onAdd={onAddField}
                onCancel={() => onSetAddingField(null)}
              />
            ) : (
              <>
                <button
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-1.5 py-1"
                  onClick={() => onSetAddingField(group.id)}
                >
                  <Plus className="w-3.5 h-3.5" /> フィールド追加
                </button>
                {onOpenComputedDialog && (
                  <button
                    className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600 px-1.5 py-1"
                    onClick={() => onOpenComputedDialog(group.id)}
                  >
                    <FunctionSquare className="w-3.5 h-3.5" /> 計算式
                  </button>
                )}
                {onBulkGenerate && (
                  <button
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-1.5 py-1 ml-auto"
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
  readonly groupIndex: number
  readonly isSelected: boolean
  readonly isHovered: boolean
  readonly boundCount: number
  readonly onConnect?: (fieldId: string) => void
  readonly onRemove: (groupId: string, fieldId: string) => void
  readonly fieldRef: (fieldId: string, el: HTMLElement | null) => void
  readonly onPointerDown: (e: React.PointerEvent, fieldId: string) => void
  readonly onPointerMove: (e: React.PointerEvent, fieldId: string) => void
  readonly onHoverField: (fieldId: string | null) => void
}

const FieldCard = memo(function FieldCard({
  field,
  groupId,
  groupIndex,
  isSelected,
  isHovered,
  boundCount,
  onConnect,
  onRemove,
  fieldRef,
  onPointerDown,
  onPointerMove,
  onHoverField,
}: FieldCardProps) {
  const color = getGroupColor(groupIndex)

  return (
    <button
      ref={(el) => fieldRef(field.id, el)}
      data-field-id={field.id}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors select-none group',
        isSelected && 'bg-primary/10 ring-1 ring-primary/30',
        isHovered && !isSelected && 'bg-primary/5',
        !isSelected && !isHovered && 'hover:bg-accent',
      )}
      onClick={() => onConnect?.(field.id)}
      onPointerDown={(e) => onPointerDown(e, field.id)}
      onPointerMove={(e) => onPointerMove(e, field.id)}
      onMouseEnter={() => onHoverField(field.id)}
      onMouseLeave={() => onHoverField(null)}
      title={`${field.key}${field.dbColumnName ? ` (DB: ${field.dbColumnName})` : ''} — クリックで選択、ドラッグで接続`}
    >
      {field.computed && (
        <FunctionSquare className="w-3.5 h-3.5 text-orange-500 shrink-0" />
      )}
      <span className="flex-1 truncate font-medium">{field.label || field.key}</span>
      <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[25%]">
        {field.key}
      </span>
      {boundCount > 0 && (
        <span
          className="text-[10px] rounded-full px-1.5 py-0.5 font-medium shrink-0"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {boundCount}
        </span>
      )}
      <button
        className="text-muted-foreground/30 hover:text-destructive p-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(groupId, field.id)
        }}
        title="フィールドを削除"
      >
        <Trash2 className="w-3.5 h-3.5" />
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
    <div className="flex items-center gap-1.5 w-full">
      <input
        autoFocus
        className="flex-1 text-xs border rounded px-2 py-1 bg-background"
        placeholder="フィールド名"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit()
          if (e.key === 'Escape') onCancel()
        }}
      />
      <button
        className="text-xs text-primary hover:underline px-1"
        onClick={handleSubmit}
      >
        追加
      </button>
      <button
        className="text-muted-foreground hover:text-foreground p-0.5"
        onClick={onCancel}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

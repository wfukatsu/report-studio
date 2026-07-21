/**
 * SchemaGroupBlock — legacy-editor-style schema field group.
 *
 * Visual style matches the legacy binding editor
 * (the pre-Zustand generation — unrelated to the HTTP API v1/v2):
 * - Field cards with ring shadow, monospace font
 * - Hover: translateX(-2px) + elevated shadow
 * - Bound fields: indigo ring + indigo dot
 * - Computed fields: indigo left border + light indigo bg
 * - Group header with role badge
 */

import { memo, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ParseKeys } from 'i18next'
import {
  ChevronDown, ChevronRight, Plus, Trash2, X, RefreshCw, Wand2, AlertTriangle, Link2, Pencil, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getGroupColor } from '../types'
import type { SchemaGroup, SchemaField, SchemaFieldType } from '@/types'

/** Minimal shape of a master-group candidate offered in the 親マスター picker. */
export interface MasterGroupOption {
  readonly id: string
  readonly label: string
}

/** #139: editable group-header fields. */
export type GroupMetaPatch = Partial<
  Pick<SchemaGroup, 'label' | 'dataKey' | 'role' | 'linkedMasterGroupId'>
>

interface SchemaGroupBlockProps {
  readonly group: SchemaGroup
  readonly groupIndex: number
  readonly expanded: boolean
  readonly boundFieldIds: ReadonlySet<string>
  /** #138: master groups this detail group may link to (excludes system groups). */
  readonly masterGroups: readonly MasterGroupOption[]
  /** #138: set/clear this detail group's parent-master relationship (linkedMasterGroupId). */
  readonly onSetLinkedMaster: (groupId: string, masterGroupId: string | undefined) => void
  /** #139: inline-edit the group's label / dataKey / role. */
  readonly onUpdateGroup: (groupId: string, patch: GroupMetaPatch) => void
  readonly addingField: boolean
  readonly onToggle: (groupId: string) => void
  readonly onAddField: (groupId: string, field: Omit<SchemaField, 'id'>) => void
  readonly onRemoveField: (groupId: string, fieldId: string) => void
  readonly onSetAddingField: (groupId: string | null) => void
  readonly onBulkGenerate?: (groupId: string) => void
  readonly onOpenComputedDialog?: (groupId: string) => void
  readonly onConnect?: (fieldId: string) => void
  readonly fieldRef: (fieldId: string, el: HTMLElement | null) => void
  readonly onFieldDragStart: (e: React.PointerEvent, fieldId: string) => void
  readonly onDragMove: (e: React.PointerEvent) => void
  readonly onDropOnField: (fieldId: string) => void
  readonly selectedFieldId: string | null
  readonly isDraggingElement: boolean
  readonly fieldBoundCount: ReadonlyMap<string, number>
  readonly hoveredFieldId: string | null
  readonly onHoverField: (fieldId: string | null) => void
}

export const SchemaGroupBlock = memo(function SchemaGroupBlock({
  group,
  groupIndex,
  expanded,
  boundFieldIds,
  masterGroups,
  onSetLinkedMaster,
  onUpdateGroup,
  addingField,
  onToggle,
  onAddField,
  onRemoveField,
  onSetAddingField,
  onBulkGenerate,
  onOpenComputedDialog,
  onConnect,
  fieldRef,
  onFieldDragStart,
  onDragMove,
  onDropOnField,
  selectedFieldId,
  isDraggingElement,
  fieldBoundCount,
  hoveredFieldId,
  onHoverField,
}: SchemaGroupBlockProps) {
  const { t } = useTranslation('components')
  const [editing, setEditing] = useState(false)
  const handleToggle = useCallback(() => onToggle(group.id), [onToggle, group.id])
  const boundCount = group.fields.filter((f) => boundFieldIds.has(f.id)).length
  const color = getGroupColor(groupIndex)

  return (
    <div className="mb-1">
      {/* Group header — toggle button + edit/bulk-generate triggers as siblings
          (a button cannot nest inside a button). #139: pencil toggles inline edit. */}
      <div
        className="flex items-center rounded-md hover:bg-muted/50 transition-colors"
        style={{ borderLeft: `3px solid ${color}` }}
      >
        {editing ? (
          <InlineGroupEdit
            group={group}
            onSave={onUpdateGroup}
            onClose={() => setEditing(false)}
          />
        ) : (
        <>
        <button
          className="flex-1 min-w-0 flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-foreground"
          onClick={handleToggle}
          data-schemagroup-id={group.id}
        >
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
          <span className="truncate font-medium">{group.label || group.id}</span>
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 flex items-center gap-0.5',
            group.role === 'master'
              ? 'bg-blue-50 text-blue-600 border border-blue-200'
              : 'bg-amber-50 text-amber-600 border border-amber-200',
          )}>
            {group.role === 'detail' && <RefreshCw className="w-2.5 h-2.5" />}
            {group.role === 'master' ? t('bindingEditor.schemaGroupBlock.roleMaster') : t('bindingEditor.schemaGroupBlock.roleDetailBadge')}
          </span>
          {group.role === 'detail' && group.dataKey && (
            <span className="font-mono text-[9px] bg-amber-50 text-amber-500 px-1 rounded">
              {group.dataKey}
            </span>
          )}
          <span className="ml-auto font-mono text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-px rounded-full">
            {boundCount}/{group.fields.length}
          </span>
        </button>
        {onBulkGenerate && group.fields.length > 0 && (
          <button
            className="shrink-0 px-2 py-1.5 text-muted-foreground hover:text-[#6366f1] transition-colors"
            onClick={() => onBulkGenerate(group.id)}
            title={t('bindingEditor.schemaGroupBlock.bulkGenerateTitle')}
            aria-label={t('bindingEditor.schemaGroupBlock.bulkGenerateAria')}
          >
            <Wand2 className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          className="shrink-0 px-2 py-1.5 text-muted-foreground hover:text-[#6366f1] transition-colors"
          onClick={() => setEditing(true)}
          title={t('bindingEditor.schemaGroupBlock.editGroupTitle')}
          aria-label={t('bindingEditor.schemaGroupBlock.editGroupAria')}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        </>
        )}
      </div>

      {/* #138: parent-master relationship picker + unset-relationship error.
          Always visible for detail groups so the error is discoverable even
          when the group is collapsed (avoids the silent cartesian-product trap). */}
      {group.role === 'detail' && (
        <DetailRelationBand
          group={group}
          masterGroups={masterGroups}
          onSetLinkedMaster={onSetLinkedMaster}
        />
      )}

      {/* Field cards */}
      {expanded && (
        <>
          <div className={cn(
            'flex flex-col gap-1 px-1 pb-1 pt-0.5',
            group.role === 'detail' && 'ml-2 border-l-2 border-amber-300/50 pl-1.5',
          )}>
            {group.fields.length === 0 ? (
              <div className="px-3 py-3 text-xs text-muted-foreground italic text-center">
                {t('bindingEditor.schemaGroupBlock.noFields')}
              </div>
            ) : (
              group.fields.map((field) => (
                <FieldCard
                  key={field.id}
                  field={field}
                  groupId={group.id}
                  groupIndex={groupIndex}
                  // #130: group is DB-connected but this field has no column → won't
                  // resolve from live data. Surface it instead of failing silently.
                  warnUnmapped={!!group.tableMeta && !field.dbColumnName && !field.computed}
                  isBound={boundFieldIds.has(field.id)}
                  isSelected={selectedFieldId === field.id}
                  isHovered={hoveredFieldId === field.id}
                  isDraggingElement={isDraggingElement}
                  boundCount={fieldBoundCount.get(field.id) ?? 0}
                  onConnect={onConnect}
                  onRemove={onRemoveField}
                  fieldRef={fieldRef}
                  onFieldDragStart={onFieldDragStart}
                  onDragMove={onDragMove}
                  onDropOnField={onDropOnField}
                  onHoverField={onHoverField}
                />
              ))
            )}
          </div>

          {/* Footer: add field / computed field */}
          <div className="flex items-center gap-2 px-2 pb-1.5">
            {addingField ? (
              <InlineAddField
                groupId={group.id}
                onAdd={onAddField}
                onCancel={() => onSetAddingField(null)}
              />
            ) : (
              <>
                {/* legacy-editor-style dashed add button */}
                <button
                  className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-[#00C853] hover:border-[#00C853]/50 hover:bg-[#00C853]/5 w-full ml-4 py-1.5 border-2 border-dashed border-border/30 rounded-md transition-colors"
                  onClick={() => onSetAddingField(group.id)}
                >
                  <Plus className="w-3.5 h-3.5" /> {t('bindingEditor.schemaGroupBlock.addField')}
                </button>
                {onOpenComputedDialog && (
                  <button
                    className="flex items-center gap-1 text-xs text-[#6366f1] hover:text-[#6366f1]/80 px-2 py-1.5 shrink-0 font-medium"
                    onClick={() => onOpenComputedDialog(group.id)}
                    title={t('bindingEditor.schemaGroupBlock.addComputedTitle')}
                  >
                    <span className="text-[9px] font-bold italic bg-[#6366f1] text-white rounded px-1 py-px">fx</span>
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
// DetailRelationBand — #138: 親マスター picker + unset-relationship error
// ---------------------------------------------------------------------------

interface DetailRelationBandProps {
  readonly group: SchemaGroup
  readonly masterGroups: readonly MasterGroupOption[]
  readonly onSetLinkedMaster: (groupId: string, masterGroupId: string | undefined) => void
}

const DetailRelationBand = memo(function DetailRelationBand({
  group,
  masterGroups,
  onSetLinkedMaster,
}: DetailRelationBandProps) {
  const { t } = useTranslation('components')
  // A detail group is never itself a master, but guard against self-links anyway.
  const candidates = masterGroups.filter((m) => m.id !== group.id)
  const linkedId = group.linkedMasterGroupId
  const linkedExists = !!linkedId && candidates.some((m) => m.id === linkedId)
  // Relationship required only when there IS a master to link to. Set but dangling
  // (points to a removed group) is treated as unset — surface it, don't hide it.
  const isError = candidates.length > 0 && !linkedExists

  if (candidates.length === 0) {
    return (
      <div className="ml-2 mt-0.5 flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground/80">
        <Link2 className="w-3 h-3 shrink-0 opacity-60" />
        {t('bindingEditor.schemaGroupBlock.noLinkableMaster')}
      </div>
    )
  }

  return (
    <div className="ml-2 mt-0.5">
      <div
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-md',
          isError ? 'bg-red-50 border border-red-200' : 'bg-muted/40',
        )}
      >
        {isError
          ? <AlertTriangle className="w-3 h-3 shrink-0 text-red-500" />
          : <Link2 className="w-3 h-3 shrink-0 text-muted-foreground" />}
        <span
          className={cn(
            'text-[10px] shrink-0',
            isError ? 'text-red-600 font-medium' : 'text-muted-foreground',
          )}
        >
          {t('bindingEditor.schemaGroupBlock.parentMaster')}
        </span>
        <select
          className={cn(
            'flex-1 min-w-0 text-[11px] border rounded px-1.5 py-0.5 bg-background',
            isError && 'border-red-300 text-red-600',
          )}
          value={linkedExists ? linkedId : ''}
          onChange={(e) => onSetLinkedMaster(group.id, e.target.value || undefined)}
          aria-label={t('bindingEditor.schemaGroupBlock.parentMasterAria', { group: group.label || group.id })}
        >
          <option value="">{t('bindingEditor.schemaGroupBlock.unset')}</option>
          {candidates.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>
      {isError && (
        <p className="px-2 pt-0.5 text-[9px] leading-tight text-red-500">
          {t('bindingEditor.schemaGroupBlock.relationRequiredError')}
        </p>
      )}
    </div>
  )
})

// ---------------------------------------------------------------------------
// FieldCard — legacy-editor-style with ring shadow, monospace name, hover lift
// ---------------------------------------------------------------------------

interface FieldCardProps {
  readonly field: SchemaField
  readonly groupId: string
  readonly groupIndex: number
  readonly warnUnmapped: boolean
  readonly isBound: boolean
  readonly isSelected: boolean
  readonly isHovered: boolean
  readonly isDraggingElement: boolean
  readonly boundCount: number
  readonly onConnect?: (fieldId: string) => void
  readonly onRemove: (groupId: string, fieldId: string) => void
  readonly fieldRef: (fieldId: string, el: HTMLElement | null) => void
  readonly onFieldDragStart: (e: React.PointerEvent, fieldId: string) => void
  readonly onDragMove: (e: React.PointerEvent) => void
  readonly onDropOnField: (fieldId: string) => void
  readonly onHoverField: (fieldId: string | null) => void
}

const FieldCard = memo(function FieldCard({
  field,
  groupId,
  groupIndex,
  warnUnmapped,
  isBound,
  isSelected,
  isHovered,
  isDraggingElement,
  boundCount,
  onConnect,
  onRemove,
  fieldRef,
  onFieldDragStart,
  onDragMove,
  onDropOnField,
  onHoverField,
}: FieldCardProps) {
  const { t } = useTranslation('components')
  const color = getGroupColor(groupIndex)

  return (
    <div
      role="button"
      tabIndex={0}
      ref={(el) => fieldRef(field.id, el)}
      data-field-id={field.id}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs text-left select-none cursor-grab group transition-all',
        // legacy-editor style: ring shadow + computed border
        field.computed
          ? 'bg-[#6366f1]/5 border-l-[3px] border-l-[#6366f1]/40'
          : 'bg-background',
        // Bound: indigo ring
        isBound && !field.computed && 'shadow-[0_0_0_1px_rgba(99,102,241,0.3),0_1px_3px_rgba(99,102,241,0.08)]',
        // Unbound: subtle ring
        !isBound && !field.computed && 'shadow-[0_0_0_1px_rgba(0,0,0,0.08)]',
        // Selection
        isSelected && 'ring-2 ring-[#6366f1] shadow-[0_0_0_1px_rgba(99,102,241,0.5),0_2px_8px_rgba(99,102,241,0.15)]',
        // Drop target highlight (when dragging an element)
        isDraggingElement && 'hover:ring-2 hover:ring-[#00C853] hover:bg-[#00C853]/5',
        // Hover lift (legacy: translateX(-2px))
        isHovered && !isSelected && !isDraggingElement && '-translate-x-0.5 shadow-[0_2px_8px_rgba(99,102,241,0.1)]',
        !isSelected && !isHovered && !isDraggingElement && 'hover:-translate-x-0.5 hover:shadow-[0_2px_8px_rgba(99,102,241,0.1)]',
      )}
      onClick={() => onConnect?.(field.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onConnect?.(field.id)
        }
      }}
      onPointerDown={(e) => onFieldDragStart(e, field.id)}
      onPointerMove={onDragMove}
      onPointerUp={() => { if (isDraggingElement) onDropOnField(field.id) }}
      onMouseEnter={() => onHoverField(field.id)}
      onMouseLeave={() => onHoverField(null)}
      title={t('bindingEditor.schemaGroupBlock.fieldCardTitle', { fieldKey: field.key })}
    >
      {/* Binding dot (legacy: 8px circle) */}
      <span
        className="w-2 h-2 rounded-full shrink-0 transition-colors"
        style={{
          backgroundColor: isBound ? '#6366f1' : 'var(--border)',
          boxShadow: isBound ? '0 0 0 2px rgba(99,102,241,0.2)' : undefined,
        }}
      />

      {/* Computed badge */}
      {field.computed && (
        <span className="text-[9px] font-bold italic bg-[#6366f1] text-white rounded px-1 py-px shrink-0 min-w-[20px] text-center">
          fx
        </span>
      )}

      {/* Field name (legacy: monospace, 550 weight) */}
      <span className="flex-1 truncate font-mono font-medium text-foreground">
        {field.label || field.key}
      </span>

      {/* #130: unmapped-in-bound-group warning */}
      {warnUnmapped && (
        <span
          className="shrink-0 text-amber-500"
          title={t('bindingEditor.schemaGroupBlock.unmappedTitle')}
          aria-label={t('bindingEditor.schemaGroupBlock.unmappedAria')}
        >
          <AlertTriangle className="w-3 h-3" />
        </span>
      )}

      {/* Field path */}
      <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[130px] ml-auto">
        {field.key}
      </span>

      {/* Bound count badge */}
      {boundCount > 0 && (
        <span
          className="text-[10px] rounded-full px-1.5 py-0.5 font-mono font-semibold shrink-0"
          style={{ backgroundColor: `${color}15`, color }}
        >
          {boundCount}
        </span>
      )}

      {/* Delete button */}
      <button
        className="text-muted-foreground/20 hover:text-red-500 p-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(groupId, field.id)
        }}
        title={t('bindingEditor.schemaGroupBlock.deleteTitle')}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
})

// ---------------------------------------------------------------------------
// InlineGroupEdit — #139: edit label / dataKey / role in the group header
// ---------------------------------------------------------------------------

interface InlineGroupEditProps {
  readonly group: SchemaGroup
  readonly onSave: (groupId: string, patch: GroupMetaPatch) => void
  readonly onClose: () => void
}

/** Sanitize a dataKey to the schema's 2-level key grammar: ^[a-zA-Z_][a-zA-Z0-9_]*$ */
function sanitizeDataKey(raw: string): string {
  const stripped = raw.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
  return /^[a-zA-Z_]/.test(stripped) ? stripped : ''
}

function InlineGroupEdit({ group, onSave, onClose }: InlineGroupEditProps) {
  const { t } = useTranslation('components')
  const [label, setLabel] = useState(group.label)
  const [dataKey, setDataKey] = useState(group.dataKey)
  const [role, setRole] = useState(group.role)

  const handleSave = () => {
    const nextKey = sanitizeDataKey(dataKey) || group.dataKey
    const patch: GroupMetaPatch = {
      label: label.trim() || group.label,
      dataKey: nextKey,
      role,
    }
    // A master group has no parent-master link — drop a stale relationship on
    // detail→master so it can't resurface if the role is later flipped back.
    if (role === 'master' && group.linkedMasterGroupId) {
      patch.linkedMasterGroupId = undefined
    }
    onSave(group.id, patch)
    onClose()
  }

  return (
    <div className="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1.5">
      <input
        autoFocus
        className="flex-1 min-w-0 text-xs border rounded-md px-2 py-1 bg-background"
        placeholder={t('bindingEditor.schemaGroupBlock.groupName')}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Enter') handleSave()
          if (e.key === 'Escape') onClose()
        }}
        aria-label={t('bindingEditor.schemaGroupBlock.groupName')}
      />
      <input
        className="w-24 shrink-0 text-xs border rounded-md px-2 py-1 bg-background font-mono"
        placeholder="dataKey"
        value={dataKey}
        onChange={(e) => setDataKey(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Enter') handleSave()
          if (e.key === 'Escape') onClose()
        }}
        aria-label={t('bindingEditor.schemaGroupBlock.dataKeyAria')}
      />
      <select
        className="shrink-0 text-xs border rounded-md px-1.5 py-1 bg-background"
        value={role}
        onChange={(e) => setRole(e.target.value as SchemaGroup['role'])}
        aria-label={t('bindingEditor.schemaGroupBlock.roleSelectAria')}
        title={t('bindingEditor.schemaGroupBlock.roleSelectAria')}
      >
        <option value="master">{t('bindingEditor.schemaGroupBlock.roleMaster')}</option>
        <option value="detail">{t('bindingEditor.schemaGroupBlock.roleDetailOption')}</option>
      </select>
      <button
        className="text-[#00C853] hover:text-[#00C853]/80 p-0.5 shrink-0"
        onClick={handleSave}
        title={t('bindingEditor.schemaGroupBlock.saveTitle')}
        aria-label={t('bindingEditor.schemaGroupBlock.saveAria')}
      >
        <Check className="w-3.5 h-3.5" />
      </button>
      <button
        className="text-muted-foreground hover:text-foreground p-0.5 shrink-0"
        onClick={onClose}
        title={t('bindingEditor.schemaGroupBlock.cancelTitle')}
        aria-label={t('bindingEditor.schemaGroupBlock.cancelAria')}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// InlineAddField
// ---------------------------------------------------------------------------

interface InlineAddFieldProps {
  readonly groupId: string
  readonly onAdd: (groupId: string, field: Omit<SchemaField, 'id'>) => void
  readonly onCancel: () => void
}

/**
 * Derive a valid field key (matching the schema grammar ^[a-zA-Z_][a-zA-Z0-9_]*$)
 * from a human label. A Japanese label like "タイトル" sanitizes to an empty
 * string, which previously left the field key blank — breaking data binding and
 * leaving the "create table" column name empty (#161). Fall back to a generated
 * key so every field always has a usable, valid key.
 */
function deriveFieldKey(label: string): string {
  const slug = label.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
  if (slug && /^[a-zA-Z_]/.test(slug)) return slug
  if (slug) return `f_${slug}` // starts with a digit → prefix to satisfy the grammar
  const rand = (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}`).replace(/-/g, '').slice(0, 6)
  return `field_${rand}`
}

/** Field types offerable at inline-add time (計算フィールドは fx ダイアログ経由) */
const ADD_FIELD_TYPES = [
  { value: 'string', labelKey: 'bindingEditor.schemaGroupBlock.fieldTypeString' },
  { value: 'number', labelKey: 'bindingEditor.schemaGroupBlock.fieldTypeNumber' },
  { value: 'date', labelKey: 'bindingEditor.schemaGroupBlock.fieldTypeDate' },
  { value: 'boolean', labelKey: 'bindingEditor.schemaGroupBlock.fieldTypeBoolean' },
] as const satisfies readonly { value: SchemaFieldType; labelKey: ParseKeys<'components'> }[]

function InlineAddField({ groupId, onAdd, onCancel }: InlineAddFieldProps) {
  const { t } = useTranslation('components')
  const [name, setName] = useState('')
  const [type, setType] = useState<SchemaFieldType>('string')

  const handleSubmit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onAdd(groupId, { key: deriveFieldKey(trimmed), label: trimmed, type } as Omit<SchemaField, 'id'>)
    setName('')
  }

  return (
    <div className="flex items-center gap-1.5 w-full">
      <input
        autoFocus
        className="flex-1 min-w-0 text-xs border rounded-md px-2.5 py-1.5 bg-background font-mono"
        placeholder={t('bindingEditor.schemaGroupBlock.fieldNamePlaceholder')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') handleSubmit()
          if (e.key === 'Escape') onCancel()
        }}
      />
      <select
        className="shrink-0 text-xs border rounded-md px-1.5 py-1.5 bg-background"
        value={type}
        onChange={(e) => setType(e.target.value as SchemaFieldType)}
        aria-label={t('bindingEditor.schemaGroupBlock.fieldTypeAria')}
        title={t('bindingEditor.schemaGroupBlock.fieldTypeAria')}
      >
        {ADD_FIELD_TYPES.map((item) => (
          <option key={item.value} value={item.value}>{t(item.labelKey)}</option>
        ))}
      </select>
      <button className="text-xs text-[#6366f1] font-medium px-1.5 shrink-0" onClick={handleSubmit}>
        {t('bindingEditor.schemaGroupBlock.add')}
      </button>
      <button className="text-muted-foreground hover:text-foreground p-0.5 shrink-0" onClick={onCancel}>
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

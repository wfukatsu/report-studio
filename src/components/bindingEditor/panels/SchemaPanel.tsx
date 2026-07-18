/**
 * SchemaPanel — Center panel of the BindingEditor.
 *
 * Shows schema groups with fields. Group headers have color stripes.
 * Includes search filter and operation guidance.
 */

import { memo, useCallback, useMemo, useState } from 'react'
import { Plus, Link, Search, X, MousePointerClick, Hand } from 'lucide-react'
import { SchemaGroupBlock } from '../internals/SchemaGroupBlock'
import { NoSchemaPanel } from '../internals/NoSchemaPanel'
import type { BindingState } from '../hooks/useBindingState'
import type { SchemaField } from '@/types'

interface SchemaPanelProps {
  readonly bs: BindingState
  readonly expandedGroups: ReadonlySet<string>
  readonly onToggleGroup: (groupId: string) => void
  readonly fieldRef: (fieldId: string, el: HTMLElement | null) => void
  readonly onOpenComputedDialog?: (groupId: string) => void
}

export const SchemaPanel = memo(function SchemaPanel({
  bs,
  expandedGroups,
  onToggleGroup,
  fieldRef,
  onOpenComputedDialog,
}: SchemaPanelProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const handleAddField = useCallback(
    (groupId: string, field: Omit<SchemaField, 'id'>) => {
      bs.addSchemaField(groupId, field as never)
      bs.setAddingFieldGroupId(null)
    },
    [bs.addSchemaField, bs.setAddingFieldGroupId],
  )

  const handleBulkGenerate = useCallback(
    (groupId: string) => bs.setBulk({ side: 'schema', groupId }),
    [bs.setBulk],
  )

  // #138: master-group candidates for the detail groups' 親マスター picker.
  // bs.schemaGroups already excludes system groups (e.g. product master).
  const masterGroups = useMemo(
    () =>
      bs.schemaGroups
        .filter((g) => g.role === 'master')
        .map((g) => ({ id: g.id, label: g.label || g.id })),
    [bs.schemaGroups],
  )

  const handleSetLinkedMaster = useCallback(
    (groupId: string, masterGroupId: string | undefined) =>
      bs.updateSchemaGroup(groupId, { linkedMasterGroupId: masterGroupId }),
    [bs.updateSchemaGroup],
  )

  const handleHoverField = useCallback(
    (fieldId: string | null) => {
      bs.setHoveredFieldId(fieldId)
      if (fieldId) {
        const field = bs.fieldMap.get(fieldId)
        if (field) bs.setHoveredGroupId(field.groupId)
      } else {
        bs.setHoveredGroupId(null)
      }
    },
    [bs.setHoveredFieldId, bs.setHoveredGroupId, bs.fieldMap],
  )

  if (!bs.hasSchema && !bs.hasFields) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2.5 border-b bg-muted/30 shrink-0">
          <p className="text-xs font-semibold text-foreground">
            スキーマフィールド
          </p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <NoSchemaPanel onAddGroup={() => bs.addSchemaGroup('master')} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden border-x">
      {/* Header + operation guide — two connection methods, made discoverable (#131) */}
      <div className="px-3 py-2.5 border-b bg-muted/30 shrink-0">
        <p className="text-xs font-semibold text-foreground">
          スキーマフィールド
        </p>
        <div className="mt-1 flex flex-col gap-0.5 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <MousePointerClick className="w-3 h-3 shrink-0 text-blue-500" />
            フィールドをクリック → 左の要素をクリックで接続
          </span>
          <span className="flex items-center gap-1">
            <Hand className="w-3 h-3 shrink-0 text-blue-500" />
            フィールドを要素へドラッグしても接続できます
          </span>
        </div>
      </div>

      {/* Search filter (P4-14) */}
      <div className="px-2 py-1.5 border-b shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input
            className="w-full pl-6 pr-6 py-1 text-xs border rounded bg-background"
            placeholder="フィールドを検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearchQuery('')}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Schema groups */}
      <div className="flex-1 overflow-y-auto">
        {bs.schemaGroups.map((group, index) => {
          // Filter fields by search
          const filteredGroup = searchQuery.trim()
            ? {
                ...group,
                fields: group.fields.filter((f) =>
                  (f.label || f.key).toLowerCase().includes(searchQuery.toLowerCase()) ||
                  f.key.toLowerCase().includes(searchQuery.toLowerCase()),
                ),
              }
            : group
          if (searchQuery.trim() && filteredGroup.fields.length === 0) return null

          return (
            <SchemaGroupBlock
              key={group.id}
              group={filteredGroup}
              groupIndex={index}
              expanded={expandedGroups.has(group.id)}
              boundFieldIds={bs.boundFieldIds}
              masterGroups={masterGroups}
              onSetLinkedMaster={handleSetLinkedMaster}
              onUpdateGroup={bs.updateSchemaGroup}
              addingField={bs.addingFieldGroupId === group.id}
              onToggle={onToggleGroup}
              onAddField={handleAddField}
              onRemoveField={bs.removeSchemaField}
              onSetAddingField={bs.setAddingFieldGroupId}
              onBulkGenerate={handleBulkGenerate}
              onOpenComputedDialog={onOpenComputedDialog}
              onConnect={bs.handleFieldSelect}
              fieldRef={fieldRef}
              onFieldDragStart={bs.handleFieldDragStart}
              onDragMove={bs.handleDragMove}
              onDropOnField={bs.handleDropOnField}
              selectedFieldId={bs.selectedFieldId}
              isDraggingElement={bs.isDraggingElement}
              fieldBoundCount={bs.fieldBoundCount}
              hoveredFieldId={bs.hoveredFieldId}
              onHoverField={handleHoverField}
            />
          )
        })}

        {bs.schemaGroups.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-xs text-muted-foreground gap-2">
            <Link className="w-6 h-6 opacity-40" />
            <span>スキーマフィールドを追加してください</span>
          </div>
        )}
      </div>

      {/* Footer: add group buttons */}
      <div className="flex items-center gap-3 px-3 py-2 border-t bg-muted/10 shrink-0">
        <button
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
          onClick={() => bs.addSchemaGroup('master')}
        >
          <Plus className="w-3.5 h-3.5" /> マスター
        </button>
        <button
          className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium"
          onClick={() => bs.addSchemaGroup('detail')}
        >
          <Plus className="w-3.5 h-3.5" /> 明細
        </button>
      </div>
    </div>
  )
})

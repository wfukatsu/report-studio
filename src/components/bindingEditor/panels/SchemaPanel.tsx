/**
 * SchemaPanel — Center panel of the BindingEditor.
 *
 * Shows schema groups with fields. Group headers have color stripes.
 * Includes search filter and operation guidance.
 */

import { memo, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  /** #392: called with the new group's id after adding, so the parent can expand it. */
  readonly onGroupAdded?: (groupId: string) => void
  /** #396: the group to briefly highlight (focused from the relationship view). */
  readonly focusedGroupId?: string | null
}

export const SchemaPanel = memo(function SchemaPanel({
  bs,
  expandedGroups,
  onToggleGroup,
  fieldRef,
  onOpenComputedDialog,
  onGroupAdded,
  focusedGroupId,
}: SchemaPanelProps) {
  const { t } = useTranslation('components')
  const [searchQuery, setSearchQuery] = useState('')
  // #392: id of the group added by the last "＋マスター/＋明細" click, so it opens
  // in inline-edit mode prompting a rename (instead of a role-word-named group).
  const [justAddedGroupId, setJustAddedGroupId] = useState<string | null>(null)

  // Destructure the members used inside memoized callbacks so the dependency
  // arrays can list them directly (bs itself is a fresh object every render).
  const {
    addSchemaField,
    addSchemaGroup,
    setAddingFieldGroupId,
    setBulk,
    updateSchemaGroup,
    setHoveredFieldId,
    setHoveredGroupId,
    fieldMap,
  } = bs

  const handleAddGroup = useCallback(
    (role: 'master' | 'detail') => {
      const id = addSchemaGroup(role)
      setJustAddedGroupId(id)
      onGroupAdded?.(id)
    },
    [addSchemaGroup, onGroupAdded],
  )

  const handleAddField = useCallback(
    (groupId: string, field: Omit<SchemaField, 'id'>) => {
      addSchemaField(groupId, field as never)
      setAddingFieldGroupId(null)
    },
    [addSchemaField, setAddingFieldGroupId],
  )

  const handleBulkGenerate = useCallback(
    (groupId: string) => setBulk({ side: 'schema', groupId }),
    [setBulk],
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
      updateSchemaGroup(groupId, { linkedMasterGroupId: masterGroupId }),
    [updateSchemaGroup],
  )

  const handleHoverField = useCallback(
    (fieldId: string | null) => {
      setHoveredFieldId(fieldId)
      if (fieldId) {
        const field = fieldMap.get(fieldId)
        if (field) setHoveredGroupId(field.groupId)
      } else {
        setHoveredGroupId(null)
      }
    },
    [setHoveredFieldId, setHoveredGroupId, fieldMap],
  )

  if (!bs.hasSchema && !bs.hasFields) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2.5 border-b bg-muted/30 shrink-0">
          <p className="text-xs font-semibold text-foreground">
            {t('bindingEditor.schemaPanel.title')}
          </p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <NoSchemaPanel onAddGroup={() => handleAddGroup('master')} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden border-x">
      {/* Header + operation guide — two connection methods, made discoverable (#131) */}
      <div className="px-3 py-2.5 border-b bg-muted/30 shrink-0">
        <p className="text-xs font-semibold text-foreground">
          {t('bindingEditor.schemaPanel.title')}
        </p>
        <div className="mt-1 flex flex-col gap-0.5 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <MousePointerClick className="w-3 h-3 shrink-0 text-blue-500" />
            {t('bindingEditor.schemaPanel.guideClick')}
          </span>
          <span className="flex items-center gap-1">
            <Hand className="w-3 h-3 shrink-0 text-blue-500" />
            {t('bindingEditor.schemaPanel.guideDrag')}
          </span>
        </div>
      </div>

      {/* Search filter (P4-14) */}
      <div className="px-2 py-1.5 border-b shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input
            className="w-full pl-6 pr-6 py-1 text-xs border rounded bg-background"
            placeholder={t('bindingEditor.schemaPanel.searchPlaceholder')}
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
              autoEdit={group.id === justAddedGroupId}
              focused={group.id === focusedGroupId}
            />
          )
        })}

        {bs.schemaGroups.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-xs text-muted-foreground gap-2">
            <Link className="w-6 h-6 opacity-40" />
            <span>{t('bindingEditor.schemaPanel.emptyHint')}</span>
          </div>
        )}
      </div>

      {/* Footer: add group buttons */}
      <div className="flex items-center gap-3 px-3 py-2 border-t bg-muted/10 shrink-0">
        <button
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
          onClick={() => handleAddGroup('master')}
        >
          <Plus className="w-3.5 h-3.5" /> {t('bindingEditor.schemaPanel.addMaster')}
        </button>
        <button
          className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium"
          onClick={() => handleAddGroup('detail')}
        >
          <Plus className="w-3.5 h-3.5" /> {t('bindingEditor.schemaPanel.addDetail')}
        </button>
      </div>
    </div>
  )
})

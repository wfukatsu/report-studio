/**
 * SchemaPanel — Center panel of the BindingEditor.
 *
 * Shows schema groups with fields. Supports add/remove groups and fields,
 * computed field dialog trigger, and bulk generation.
 */

import { memo, useCallback } from 'react'
import { Plus, Link } from 'lucide-react'
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

  if (!bs.hasSchema && !bs.hasFields) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2 border-b bg-muted/30 shrink-0">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
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
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b bg-muted/30 shrink-0">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          スキーマフィールド
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          フィールドをクリックまたはドラッグして接続
        </p>
      </div>

      {/* Schema groups */}
      <div className="flex-1 overflow-y-auto">
        {bs.schemaGroups.map((group) => (
          <SchemaGroupBlock
            key={group.id}
            group={group}
            expanded={expandedGroups.has(group.id)}
            boundFieldIds={bs.boundFieldIds}
            addingField={bs.addingFieldGroupId === group.id}
            onToggle={onToggleGroup}
            onAddField={handleAddField}
            onRemoveField={bs.removeSchemaField}
            onSetAddingField={bs.setAddingFieldGroupId}
            onBulkGenerate={handleBulkGenerate}
            onOpenComputedDialog={onOpenComputedDialog}
            onConnect={bs.handleFieldSelect}
            fieldRef={fieldRef}
            onPointerDown={bs.handlePointerDown}
            onPointerMove={bs.handlePointerMove}
            selectedFieldId={bs.selectedFieldId}
            fieldBoundCount={bs.fieldBoundCount}
          />
        ))}

        {bs.schemaGroups.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-[10px] text-muted-foreground gap-2">
            <Link className="w-6 h-6 opacity-40" />
            <span>スキーマフィールドを追加してください</span>
          </div>
        )}
      </div>

      {/* Footer: add group buttons */}
      <div className="flex items-center gap-2 px-3 py-2 border-t bg-muted/10 shrink-0">
        <button
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => bs.addSchemaGroup('master')}
        >
          <Plus className="w-3 h-3" /> マスター
        </button>
        <button
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => bs.addSchemaGroup('detail')}
        >
          <Plus className="w-3 h-3" /> 明細
        </button>
      </div>
    </div>
  )
})

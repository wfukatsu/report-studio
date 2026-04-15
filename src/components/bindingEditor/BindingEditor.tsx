/**
 * BindingEditor — Main 3-panel layout for schema/element binding.
 *
 * Replaces the old DataManagementTab with a v1-style binding editor:
 *   Left:   Template elements (grouped by page)
 *   Center: Schema fields (grouped by schema group)
 *   Right:  DB connection panel (accordion, collapsible)
 *
 * SVG overlay draws connection lines between bound fields and elements.
 * Summary bar at the bottom shows binding statistics.
 */

import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { useBindingState } from './hooks/useBindingState'
import { useConnectionLines } from './hooks/useConnectionLines'
import { ElementPanel } from './panels/ElementPanel'
import { SchemaPanel } from './panels/SchemaPanel'
import { DbPanel } from './panels/DbPanel'
import { ConnectionLines } from './internals/ConnectionLines'
import { SummaryBar } from './internals/SummaryBar'
import { BulkGenerateBar } from './internals/BulkGenerateBar'

const ComputedFieldDialog = lazy(() =>
  import('./internals/ComputedFieldDialog').then((m) => ({
    default: m.ComputedFieldDialog,
  })),
)

export function BindingEditor() {
  const bs = useBindingState()
  const cl = useConnectionLines(bs.connections)

  // DB panel accordion state
  const [dbCollapsed, setDbCollapsed] = useState(false)
  const toggleDb = useCallback(() => {
    setDbCollapsed((prev) => !prev)
    // Trigger line recalc after CSS transition
    setTimeout(() => cl.triggerRecalc(), 320)
  }, [cl.triggerRecalc])

  // Computed field dialog state
  const [computedDialog, setComputedDialog] = useState<
    | { readonly open: false }
    | { readonly open: true; readonly groupId: string; readonly editingFieldId?: string }
  >({ open: false })

  const openComputedDialog = useCallback((groupId: string) => {
    setComputedDialog({ open: true, groupId })
  }, [])

  const closeComputedDialog = useCallback(() => {
    setComputedDialog({ open: false })
  }, [])

  const handleSaveComputed = useCallback(
    (name: string, expression: string) => {
      if (!computedDialog.open) return
      const { groupId, editingFieldId } = computedDialog

      if (editingFieldId) {
        bs.updateSchemaField(groupId, editingFieldId, { expression })
      } else {
        bs.addSchemaField(groupId, {
          key: name,
          label: name,
          type: 'number',
          computed: true,
          expression,
        } as never)
      }
      closeComputedDialog()
    },
    [computedDialog, bs.updateSchemaField, bs.addSchemaField, closeComputedDialog],
  )

  // Auto-expand all groups on mount
  useEffect(() => {
    for (const group of bs.elementGroups) {
      cl.expandElementGroup(group.pageId)
    }
    for (const group of bs.schemaGroups) {
      cl.expandFieldGroup(group.id)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- only on mount

  // Recalc lines when groups change
  useEffect(() => {
    cl.triggerRecalc()
  }, [bs.schemaGroups, bs.elementGroups, cl.triggerRecalc])

  // beforeUnload dirty guard
  useEffect(() => {
    // In v2 the store auto-saves, so beforeUnload is a no-op for now.
    // Placeholder for future dirty detection.
  }, [])

  // Element ref callback for SVG line calculation
  const elementRefCallback = useCallback(
    (elementId: string, el: HTMLElement | null) => {
      if (el) cl.elementRefs.current.set(elementId, el)
      else cl.elementRefs.current.delete(elementId)
    },
    [cl.elementRefs],
  )

  // Field ref callback for SVG line calculation
  const fieldRefCallback = useCallback(
    (fieldId: string, el: HTMLElement | null) => {
      if (el) cl.fieldRefs.current.set(fieldId, el)
      else cl.fieldRefs.current.delete(fieldId)
    },
    [cl.fieldRefs],
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Bulk generate bar (conditional) */}
      {bs.bulk && bs.bulkItems.length > 0 && (
        <BulkGenerateBar
          sourceLabel={bs.bulk.side === 'schema' ? 'テンプレート要素' : 'スキーマフィールド'}
          items={bs.bulkItems}
          onGenerate={bs.runBulk}
          onCancel={() => bs.setBulk(null)}
        />
      )}

      {/* 3-panel canvas */}
      <div
        ref={cl.containerRef}
        className="flex flex-1 overflow-hidden relative"
        onPointerUp={bs.handleContainerPointerUp}
      >
        {/* SVG connection lines overlay */}
        <ConnectionLines
          lines={cl.lines}
          dragState={bs.dragState}
          fieldRefs={cl.fieldRefs}
          containerRef={cl.containerRef}
        />

        {/* Left panel: Template elements */}
        <div className="w-[30%] min-w-[200px] border-r overflow-hidden">
          <ElementPanel
            bs={bs}
            expandedGroups={cl.expandedElementGroups}
            onToggleGroup={cl.toggleElementGroup}
            elementRef={elementRefCallback}
          />
        </div>

        {/* Center panel: Schema fields */}
        <div className="flex-1 min-w-[200px] overflow-hidden">
          <SchemaPanel
            bs={bs}
            expandedGroups={cl.expandedFieldGroups}
            onToggleGroup={cl.toggleFieldGroup}
            fieldRef={fieldRefCallback}
            onOpenComputedDialog={openComputedDialog}
          />
        </div>

        {/* Right panel: DB connection */}
        <div className={dbCollapsed ? 'w-8 shrink-0' : 'w-[25%] min-w-[180px] shrink-0'}>
          <DbPanel
            collapsed={dbCollapsed}
            onToggle={toggleDb}
          />
        </div>
      </div>

      {/* Summary bar */}
      {(bs.hasSchema || bs.hasFields) && (
        <SummaryBar
          bound={bs.boundElements}
          total={bs.totalElements}
          unbound={bs.unboundElements}
        />
      )}

      {/* Computed field dialog */}
      {computedDialog.open && (
        <Suspense fallback={null}>
          <ComputedFieldDialog
            key={computedDialog.editingFieldId ?? 'new'}
            open
            groupId={computedDialog.groupId}
            groups={bs.schemaGroups}
            initialName={
              computedDialog.editingFieldId
                ? bs.fieldMap.get(computedDialog.editingFieldId)?.fieldKey
                : undefined
            }
            initialExpression={
              computedDialog.editingFieldId
                ? bs.fieldMap.get(computedDialog.editingFieldId)?.expression
                : undefined
            }
            editingFieldId={computedDialog.editingFieldId}
            onClose={closeComputedDialog}
            onSave={handleSaveComputed}
          />
        </Suspense>
      )}
    </div>
  )
}

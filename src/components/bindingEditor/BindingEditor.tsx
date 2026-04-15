/**
 * BindingEditor — Main 3-panel layout for schema/element binding.
 *
 * Left:   Template elements (grouped by page) — click/drag targets
 * Center: Schema fields (grouped by schema group) — click/drag sources
 * Right:  DB connection panel (accordion, collapsible)
 *
 * SVG overlay draws color-coded arrow lines between bound fields and elements.
 * Summary bar with group color legend at the bottom.
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Recalc lines when groups change
  useEffect(() => {
    cl.triggerRecalc()
  }, [bs.schemaGroups, bs.elementGroups, cl.triggerRecalc])

  // Element ref callback
  const elementRefCallback = useCallback(
    (elementId: string, el: HTMLElement | null) => {
      if (el) cl.elementRefs.current.set(elementId, el)
      else cl.elementRefs.current.delete(elementId)
    },
    [cl.elementRefs],
  )

  // Field ref callback
  const fieldRefCallback = useCallback(
    (fieldId: string, el: HTMLElement | null) => {
      if (el) cl.fieldRefs.current.set(fieldId, el)
      else cl.fieldRefs.current.delete(fieldId)
    },
    [cl.fieldRefs],
  )

  // Connection line hover handler
  const handleHoverLine = useCallback(
    (groupId: string | null, fieldId: string | null) => {
      bs.setHoveredGroupId(groupId)
      bs.setHoveredFieldId(fieldId)
    },
    [bs.setHoveredGroupId, bs.setHoveredFieldId],
  )

  // Disconnect a binding from the SVG line's ✕ button
  const handleDisconnectLine = useCallback(
    (_fieldId: string, elementId: string) => {
      // Find which page this element is on
      const el = bs.allElements.find((e) => e.elementId === elementId)
      if (el) bs.disconnect(el.pageId, elementId)
    },
    [bs.allElements, bs.disconnect],
  )

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Bulk generate bar (conditional) */}
      {bs.bulk && bs.bulkItems.length > 0 && (
        <BulkGenerateBar
          sourceLabel={bs.bulk.side === 'schema' ? 'テンプレート要素' : 'スキーマフィールド'}
          items={bs.bulkItems}
          onGenerate={bs.runBulk}
          onCancel={() => bs.setBulk(null)}
        />
      )}

      {/* 3-panel canvas with gaps for connection lines */}
      <div
        ref={cl.containerRef}
        className="flex-1 relative overflow-hidden p-3"
        style={{
          display: 'grid',
          gridTemplateColumns: dbCollapsed
            ? 'minmax(280px, 1fr) 80px minmax(280px, 1fr) 80px 40px'
            : 'minmax(280px, 1fr) 80px minmax(280px, 1fr) 80px minmax(240px, 1fr)',
          transition: 'grid-template-columns 300ms ease',
          minHeight: 460,
        }}
        onPointerUp={bs.handleContainerPointerUp}
      >
        {/* SVG connection lines overlay */}
        <ConnectionLines
          lines={cl.lines}
          dragState={bs.dragState}
          fieldRefs={cl.fieldRefs}
          elementRefs={cl.elementRefs}
          containerRef={cl.containerRef}
          groupIndexMap={bs.groupIndexMap}
          hoveredGroupId={bs.hoveredGroupId}
          hoveredFieldId={bs.hoveredFieldId}
          onHoverLine={handleHoverLine}
          onDisconnectLine={handleDisconnectLine}
        />

        {/* Left panel: Template elements */}
        <div className="overflow-hidden rounded-lg border shadow-sm bg-background">
          <ElementPanel
            bs={bs}
            expandedGroups={cl.expandedElementGroups}
            onToggleGroup={cl.toggleElementGroup}
            elementRef={elementRefCallback}
          />
        </div>

        {/* Gap for Element↔Schema connection lines */}
        <div />

        {/* Center panel: Schema fields */}
        <div className="overflow-hidden rounded-lg border shadow-sm bg-background">
          <SchemaPanel
            bs={bs}
            expandedGroups={cl.expandedFieldGroups}
            onToggleGroup={cl.toggleFieldGroup}
            fieldRef={fieldRefCallback}
            onOpenComputedDialog={openComputedDialog}
          />
        </div>

        {/* Gap for Schema↔DB connection lines */}
        <div />

        {/* Right panel: DB connection */}
        <div className="overflow-hidden rounded-lg border shadow-sm bg-background">
          <DbPanel
            collapsed={dbCollapsed}
            onToggle={toggleDb}
          />
        </div>
      </div>

      {/* Summary bar with group color legend */}
      {(bs.hasSchema || bs.hasFields) && (
        <SummaryBar
          bound={bs.boundElements}
          total={bs.totalElements}
          unbound={bs.unboundElements}
          groups={bs.schemaGroups}
          groupIndexMap={bs.groupIndexMap}
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

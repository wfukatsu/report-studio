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
import { BookmarkPlus, FolderOpen } from 'lucide-react'
import { useBindingState } from './hooks/useBindingState'
import { useConnectionLines } from './hooks/useConnectionLines'
import { ElementPanel } from './panels/ElementPanel'
import { SchemaPanel } from './panels/SchemaPanel'
import { DbPanel } from './panels/DbPanel'
import { ConnectionLines } from './internals/ConnectionLines'
import { SummaryBar } from './internals/SummaryBar'
import { BulkGenerateBar } from './internals/BulkGenerateBar'
import { RelationshipView } from './internals/RelationshipView'
import { SchemaLibraryModal } from '@/components/modals/SchemaLibraryModal'
import { saveToSchemaLibrary } from '@/api/reportApi'
import { useReportStore } from '@/store/reportStore'
import { toast } from 'sonner'

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

  // Schema Library modal state
  const [libraryModalOpen, setLibraryModalOpen] = useState(false)
  const [savingToLibrary, setSavingToLibrary] = useState(false)
  const dataSources = useReportStore((s) => s.definition.dataSources)

  const handleSaveToLibrary = useCallback(async () => {
    const name = window.prompt('スキーマの名前を入力してください:', '')
    if (!name?.trim()) return
    setSavingToLibrary(true)
    try {
      await saveToSchemaLibrary(name.trim(), {
        schema: bs.schema ?? { groups: [] },
        dataSources: dataSources ?? [],
      })
      toast.success('スキーマをライブラリに保存しました')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存に失敗しました', { duration: 8000 })
    } finally {
      setSavingToLibrary(false)
    }
  }, [bs.schema, dataSources])

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Role descriptor — states what this surface is for (#129) */}
      <div className="px-3 py-1 border-b bg-muted/5 shrink-0">
        <span className="text-[10px] text-muted-foreground">
          テンプレート要素とデータ項目（スキーマ）を結線し、必要ならDBに接続します。実データの確認はデザイン画面の「データ」パネルで行えます。
        </span>
      </div>

      {/* Schema library action bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/10 shrink-0">
        <span className="text-xs text-muted-foreground">スキーマライブラリ:</span>
        <button
          className="flex items-center gap-1 text-xs text-[#6366f1] hover:text-[#6366f1]/80 font-medium px-2 py-1 rounded hover:bg-[#6366f1]/5"
          onClick={() => setLibraryModalOpen(true)}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          ライブラリから適用
        </button>
        <button
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/50"
          onClick={handleSaveToLibrary}
          disabled={savingToLibrary || !bs.hasSchema}
          title={bs.hasSchema ? 'テンプレートのスキーマをライブラリに保存' : 'スキーマが未定義です'}
        >
          <BookmarkPlus className="w-3.5 h-3.5" />
          {savingToLibrary ? '保存中...' : 'ライブラリに保存'}
        </button>
      </div>

      {/* Schema Library Modal */}
      <SchemaLibraryModal open={libraryModalOpen} onClose={() => setLibraryModalOpen(false)} />

      {/* Relationship view (#141/#142/#143) — model-view of master/detail/product,
          with product master exposed as a lookup source and shared-key inference.
          Uses the full schema (incl. the product master system group). */}
      {bs.hasSchema && (
        <RelationshipView
          groups={bs.schema?.groups ?? []}
          onSetLinkedMaster={(groupId, masterId) =>
            bs.updateSchemaGroup(groupId, { linkedMasterGroupId: masterId })
          }
        />
      )}

      {/* Bulk generate bar — shown while a bulk request is pending. Renders even
          with zero items so the trigger gives feedback instead of a silent no-op. */}
      {bs.bulk && (
        <BulkGenerateBar
          title={bs.bulk.side === 'schema' ? '未配置フィールドから要素を生成' : '要素からスキーマ項目を生成'}
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

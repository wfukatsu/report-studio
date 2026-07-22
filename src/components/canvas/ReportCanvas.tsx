import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { PanelTop } from 'lucide-react'
import { useDragSelect } from '@/hooks/useDragSelect'
import { useShiftKeyTracker } from '@/hooks/useShiftKeyTracker'
import { constrainDelta } from '@/lib/axisConstraint'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core'
import { restrictToParentElement } from '@dnd-kit/modifiers'
import { useShallow } from 'zustand/shallow'
import { useReportStore, selectActivePage, flattenPageElements } from '@/store/reportStore'
import { clearHistoryTimer } from '@/store/historyTimer'
import { useResolvedData } from '@/hooks/useResolvedData'
import { SectionContainer } from './SectionContainer'
import { snapAxis, findSectionAtY, topmostElementAt } from './canvasGeometry'
import { ContextMenu, type ContextMenuState } from './ContextMenu'
import { mmToPx, pxToMm } from '@/lib/paperSizes'
import type { PageDef } from '@/types'
import { PALETTE_ITEM_MAP } from '@/components/sidebar/ElementPalette'
import { SCHEMA_FIELD_MIME, SCHEMA_GROUP_MIME } from '@/components/bindingEditor/types'
import type { SchemaFieldDragPayload, SchemaGroupDragPayload } from '@/components/bindingEditor/types'
import { createDataFieldFromSchema } from '@/lib/elementFactories'
import type { ReportElement } from '@/types'
import { RULER_SIZE, CANVAS_PADDING } from '@/config/constants'

interface Props {
  readonly?: boolean
  pageOverride?: PageDef
  dataOverride?: Record<string, unknown>
  canvasRef?: React.RefObject<HTMLDivElement | null>
}


// Trim mark dimensions (in mm, scaled by zoom at render time)
const TRIM_GAP_MM = 3    // gap between paper edge and mark
const TRIM_LENGTH_MM = 5 // length of each mark line

export function ReportCanvas({
  readonly = false,
  pageOverride,
  dataOverride,
  canvasRef,
}: Props) {
  const { t } = useTranslation('components')
  const activePage = useReportStore(selectActivePage)
  const selectedIds = useReportStore(useShallow((s) => s.selection.selectedElementIds))
  const selectElement = useReportStore((s) => s.selectElement)
  const clearSelection = useReportStore((s) => s.clearSelection)
  const setSelectionIds = useReportStore((s) => s.setSelectionIds)
  const moveElement = useReportStore((s) => s.moveElement)
  const pushHistory = useReportStore((s) => s.pushHistory)
  const resizeElement = useReportStore((s) => s.resizeElement)
  const updateElement = useReportStore((s) => s.updateElement)
  const removeElement = useReportStore((s) => s.removeElement)
  const duplicateElement = useReportStore((s) => s.duplicateElement)
  const copyElements = useReportStore((s) => s.copyElements)
  const cutElements = useReportStore((s) => s.cutElements)
  const pasteElements = useReportStore((s) => s.pasteElements)
  const setZOrder = useReportStore((s) => s.setZOrder)
  const clipboard = useReportStore((s) => s.clipboard)
  const addElement = useReportStore((s) => s.addElement)
  const setElementSchemaBinding = useReportStore((s) => s.setElementSchemaBinding)
  const groupSelectedElements = useReportStore((s) => s.groupSelectedElements)
  const pages = useReportStore(useShallow((s) => s.definition.pages))
  const zoom = useReportStore((s) => readonly ? s.previewZoom : s.editorZoom)
  const showGrid = useReportStore((s) => s.showGrid)
  const showTrimMarks = useReportStore((s) => s.showTrimMarks)
  const showMarginGuide = useReportStore((s) => s.showMarginGuide)
  const margins = useReportStore((s) => s.definition.pageSettings.margins)
  const snapToGrid = useReportStore((s) => s.snapToGrid)
  const gridSize = useReportStore((s) => s.gridSize)
  const headerEditMode = useReportStore((s) => s.headerEditMode)
  const setHeaderEditMode = useReportStore((s) => s.setHeaderEditMode)
  const updateSectionHeight = useReportStore((s) => s.updateSectionHeight)

  // Sample data from the first DataSource (existing flow)
  const page = pageOverride ?? activePage
  // Priority: external dataOverride > live ScalarDB data > sample JSON data
  const data = useResolvedData(dataOverride)
  const totalPages = pages.length
  const pageIndex = page ? pages.findIndex((p) => p.id === page.id) + 1 : 1

  const internalRef = useRef<HTMLDivElement>(null)
  const ref = canvasRef ?? internalRef

  const shiftRef = useShiftKeyTracker()

  // Modifier applied to DndContext to constrain the drag ghost in real time when
  // Shift is held. event.delta in handleDragEnd is the raw (pre-modifier) delta,
  // so constrainDelta is still called there for the final position calculation.
  const axisConstraintModifier = useCallback<Modifier>(
    ({ transform }) => {
      if (!shiftRef.current) return transform
      if (Math.abs(transform.x) >= Math.abs(transform.y)) {
        return { ...transform, y: 0 }
      }
      return { ...transform, x: 0 }
    },
    [shiftRef],
  )

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const {
    marquee,
    onPointerDown: onMarqueePointerDown,
    onPointerMove: onMarqueePointerMove,
    onPointerUp: onMarqueePointerUp,
    consumeClickIfDragSelected,
  } = useDragSelect({
    sections: page?.sections ?? [],
    zoom,
    readonly,
    // setSelectionIds is a stable Zustand reference — no wrapper needed
    onSelectIds: setSelectionIds,
    currentSelectedIds: selectedIds,
  })

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  // ID of the element highlighted as a drop target during schema field/group drag-over
  const [dropHighlightId, setDropHighlightId] = useState<string | null>(null)

  // ⌘G / Ctrl+G — group selected elements (skip when a text input has focus)
  useEffect(() => {
    if (readonly) return
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return
      if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
        e.preventDefault()
        if (activePage) groupSelectedElements(activePage.id)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [readonly, activePage, groupSelectedElements])

  // Read the active page ID directly from the store at call time.
  // This avoids closing over `page` (which changes reference on every immer mutation)
  // and keeps these callbacks stable across drag frames.
  const getActivePage = useCallback(() => {
    const state = useReportStore.getState()
    const id = state.selection.activePageId
    return state.definition.pages.find((p) => p.id === id) ?? null
  }, [])

  // Delete / Backspace is handled centrally in App.tsx (single keyboard authority,
  // with the design-tab + input/contenteditable guards). Handling it here too fired
  // both listeners on one keypress and polluted the undo history (#211).

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const currentPage = getActivePage()
      if (!currentPage || !event.delta) return
      const el = flattenPageElements(currentPage).find((e) => e.id === event.active.id)
      if (!el) return
      // Shift+drag: constrain movement to the dominant axis
      const constrained = constrainDelta(event.delta, shiftRef.current)
      const newX = el.position.x + pxToMm(constrained.x / zoom)
      const newY = el.position.y + pxToMm(constrained.y / zoom)
      const snappedX = snapAxis(newX, el.size.width, margins?.left ?? 0, margins?.right ?? 0, currentPage.width, snapToGrid, gridSize)
      const snappedY = snapAxis(newY, el.size.height, margins?.top ?? 0, margins?.bottom ?? 0, currentPage.height, snapToGrid, gridSize)
      moveElement(currentPage.id, el.id, { x: snappedX, y: snappedY })
      // moveElement itself does not push history (too noisy mid-drag); commit one entry at
      // the end of the drag gesture so the move is undoable as a single step (#215).
      clearHistoryTimer()
      pushHistory()
    },
    // shiftRef is a stable useRef object — listing it is a no-op but satisfies the rule
    [getActivePage, moveElement, pushHistory, zoom, snapToGrid, gridSize, margins, shiftRef],
  )

  const handleResize = useCallback(
    (elementId: string, size: { width: number; height: number }) => {
      const activePageId = useReportStore.getState().selection.activePageId
      if (!activePageId) return
      resizeElement(activePageId, elementId, size)
    },
    [resizeElement],
  )

  const handleMove = useCallback(
    (elementId: string, position: { x: number; y: number }) => {
      const currentPage = getActivePage()
      if (!currentPage) return
      const el = flattenPageElements(currentPage).find((e) => e.id === elementId)
      const snappedX = snapAxis(position.x, el?.size.width, margins?.left ?? 0, margins?.right ?? 0, currentPage.width, snapToGrid, gridSize)
      const snappedY = snapAxis(position.y, el?.size.height, margins?.top ?? 0, margins?.bottom ?? 0, currentPage.height, snapToGrid, gridSize)
      moveElement(currentPage.id, elementId, { x: snappedX, y: snappedY })
    },
    [getActivePage, moveElement, snapToGrid, gridSize, margins],
  )

  const handleResizeSection = useCallback(
    (sectionId: string, newHeightMm: number) => {
      const activePageId = useReportStore.getState().selection.activePageId
      if (!activePageId) return
      updateSectionHeight(activePageId, sectionId, newHeightMm)
    },
    [updateSectionHeight],
  )

  const handlePaletteDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      const isSchema = e.dataTransfer.types.includes(SCHEMA_FIELD_MIME) ||
        e.dataTransfer.types.includes(SCHEMA_GROUP_MIME)
      if (
        e.dataTransfer.types.includes('application/rds-palette') || isSchema
      ) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }

      // Hit-test for repeatingBand/List highlight during schema field/group drag
      if (isSchema && page && ref.current) {
        const rect = ref.current.getBoundingClientRect()
        const xMm = pxToMm((e.clientX - rect.left) / zoom)
        const yMm = pxToMm((e.clientY - rect.top) / zoom)

        const { section: targetSection, relativeY } = findSectionAtY(page.sections, yMm)
        const hit = topmostElementAt(
          targetSection?.elements ?? [],
          xMm,
          relativeY,
          (el) => el.type === 'repeatingBand' || el.type === 'repeatingList',
        )
        setDropHighlightId(hit?.id ?? null)
      }
    },
    [page, zoom, ref],
  )

  const handlePaletteDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      const label = e.dataTransfer.getData('application/rds-palette')
      if (!label || !page) return
      const createElement = PALETTE_ITEM_MAP[label]
      if (!createElement) return
      e.preventDefault()

      // The drop target is the canvas div (ref). Calculate position relative to it.
      const canvasEl = ref.current
      if (!canvasEl) return
      const rect = canvasEl.getBoundingClientRect()

      // rect is already scaled by zoom (CSS transform: scale), so divide by zoom
      // to get the position in unscaled canvas pixel space, then convert px → mm.
      const xMm = pxToMm((e.clientX - rect.left) / zoom)
      const yMm = pxToMm((e.clientY - rect.top) / zoom)

      // Determine which section the drop landed in based on Y coordinate
      const { section: targetSection, relativeY } = findSectionAtY(page.sections, yMm)
      const sectionId = targetSection?.id

      // Clamp within section bounds
      const sectionH = targetSection?.height ?? page.height
      const clampedX = Math.max(0, Math.min(xMm, page.width))
      const clampedY = Math.max(0, Math.min(relativeY, sectionH))

      // Apply snap-to-grid + margin snap (no element size available yet for far-edge snap)
      const finalX = snapAxis(clampedX, undefined, margins?.left ?? 0, margins?.right ?? 0, page.width, snapToGrid, gridSize)
      const finalY = snapAxis(clampedY, undefined, margins?.top ?? 0, margins?.bottom ?? 0, page.height, snapToGrid, gridSize)

      const el = createElement()

      // Offset position if it overlaps existing elements in the same section (#188).
      // Use a for-loop with a hard limit to prevent infinite loops when the section
      // corner is completely occupied.
      const sectionElements = (targetSection?.elements ?? [])
      let posX = finalX
      let posY = finalY
      const OFFSET_STEP = 5 // 5mm per step
      const MAX_OFFSET_ATTEMPTS = Math.ceil(Math.max(page.width, sectionH) / OFFSET_STEP) + 1
      for (let attempt = 0; attempt < MAX_OFFSET_ATTEMPTS; attempt++) {
        const overlaps = sectionElements.some((ex) =>
          ex.position.x < posX + el.size.width &&
          ex.position.x + ex.size.width > posX &&
          ex.position.y < posY + el.size.height &&
          ex.position.y + ex.size.height > posY,
        )
        if (!overlaps) break
        const nextOffset = (attempt + 1) * OFFSET_STEP
        posX = Math.min(finalX + nextOffset, page.width - el.size.width)
        posY = Math.min(finalY + nextOffset, sectionH - el.size.height)
      }

      addElement(page.id, { ...el, position: { x: posX, y: posY } }, sectionId)
    },
    [page, zoom, snapToGrid, gridSize, margins, addElement, ref],
  )

  // -----------------------------------------------------------------------
  // Schema field drop handler — creates dataField, binds existing, or adds repeatingBand column
  // -----------------------------------------------------------------------
  const handleSchemaFieldDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      const raw = e.dataTransfer.getData(SCHEMA_FIELD_MIME)
      if (process.env.NODE_ENV === 'development') {
        console.log('[schema-field-drop] raw payload:', raw?.substring(0, 100), 'types:', Array.from(e.dataTransfer.types))
      }
      if (!raw || !page) return

      let payload: SchemaFieldDragPayload
      try {
        payload = JSON.parse(raw)
      } catch {
        return // malformed payload
      }
      e.preventDefault()

      const canvasEl = ref.current
      if (!canvasEl) return
      const rect = canvasEl.getBoundingClientRect()
      const xMm = pxToMm((e.clientX - rect.left) / zoom)
      const yMm = pxToMm((e.clientY - rect.top) / zoom)

      // Determine section
      let sectionId: string | undefined
      let sectionOffsetY = 0
      for (const sec of page.sections) {
        if (yMm < sectionOffsetY + sec.height) {
          sectionId = sec.id
          break
        }
        sectionOffsetY += sec.height
      }
      const relativeY = yMm - sectionOffsetY
      const targetSection = page.sections.find((s) => s.id === sectionId)
      const sectionH = targetSection?.height ?? page.height
      const sectionElements = targetSection?.elements ?? []

      // Hit-test: find topmost element at drop coordinate (zIndex descending)
      // Both xMm and relativeY are section-relative coordinates
      const sorted = [...sectionElements].sort((a, b) => b.zIndex - a.zIndex)
      let hitElement: ReportElement | null = null
      for (const el of sorted) {
        if (
          xMm >= el.position.x &&
          xMm <= el.position.x + el.size.width &&
          relativeY >= el.position.y &&
          relativeY <= el.position.y + el.size.height
        ) {
          hitElement = el
          break
        }
      }
      if (process.env.NODE_ENV === 'development') {
        console.log('[schema-field-drop] hit-test:', {
          dropX: xMm.toFixed(1), dropY: relativeY.toFixed(1),
          sectionId, sectionElements: sectionElements.length,
          hitElement: hitElement ? { id: hitElement.id, type: hitElement.type, pos: hitElement.position, size: hitElement.size } : null,
        })
      }

      // Branch based on hit element type
      const BINDABLE_TYPES = new Set(['dataField', 'text', 'checkbox', 'eraSelect'])
      const REPEATING_TYPES = new Set(['repeatingBand', 'repeatingList'])

      if (hitElement && BINDABLE_TYPES.has(hitElement.type)) {
        // Case 1: Drop on existing bindable element → set schemaBinding
        setElementSchemaBinding(page.id, hitElement.id, payload.fieldId)
        return
      }

      if (hitElement && REPEATING_TYPES.has(hitElement.type)) {
        // Case 2: Drop on repeatingBand/List → add column + set dataSource
        const bandEl = hitElement as ReportElement & {
          fields?: { key: string; label: string; width: number; align?: string; format?: { type: string } }[]
          dataSource?: string
          totals?: { fieldKey: string; formula: string; label?: string }[]
          showFooter?: boolean
        }
        const existingFields = bandEl.fields ?? []
        if (existingFields.some((f) => f.key === payload.fieldKey)) return

        // Detect if field is numeric → right-align + comma format
        const isNumeric = payload.fieldType === 'number'
        const newField = {
          key: payload.fieldKey,
          label: payload.fieldLabel,
          width: 20,
          align: (isNumeric ? 'right' : 'left') as 'left' | 'right' | 'center',
          ...(isNumeric ? { format: { type: 'comma' as const } } : {}),
        }

        const patch: Record<string, unknown> = {
          fields: [...existingFields, newField],
        }
        // Auto-add total for numeric fields
        if (isNumeric) {
          const existingTotals = bandEl.totals ?? []
          if (!existingTotals.some((t) => t.fieldKey === payload.fieldKey)) {
            // eslint-disable-next-line i18next/no-literal-string -- seed default label persisted to the data model
            patch.totals = [...existingTotals, { fieldKey: payload.fieldKey, formula: 'sum', label: '合計' }]
            patch.showFooter = true
          }
        }
        if (!bandEl.dataSource && payload.groupDataKey) {
          patch.dataSource = payload.groupDataKey
        }
        updateElement(page.id, hitElement.id, patch)
        toast.success(t('canvas.reportCanvas.columnAdded', { label: payload.fieldLabel }))
        return
      }

      // Case 3: Empty area → create new dataField element
      const clampedX = Math.max(0, Math.min(xMm, page.width))
      const clampedY = Math.max(0, Math.min(relativeY, sectionH))
      const finalX = snapAxis(clampedX, undefined, margins?.left ?? 0, margins?.right ?? 0, page.width, snapToGrid, gridSize)
      const finalY = snapAxis(clampedY, undefined, margins?.top ?? 0, margins?.bottom ?? 0, page.height, snapToGrid, gridSize)

      const el = createDataFieldFromSchema({
        fieldId: payload.fieldId,
        fieldKey: payload.fieldKey,
        fieldLabel: payload.fieldLabel,
      })

      // Collision avoidance (same as handlePaletteDrop)
      let posX = finalX
      let posY = finalY
      const OFFSET_STEP = 5
      const MAX_OFFSET_ATTEMPTS = Math.ceil(Math.max(page.width, sectionH) / OFFSET_STEP) + 1
      for (let attempt = 0; attempt < MAX_OFFSET_ATTEMPTS; attempt++) {
        const overlaps = sectionElements.some((ex) =>
          ex.position.x < posX + el.size.width &&
          ex.position.x + ex.size.width > posX &&
          ex.position.y < posY + el.size.height &&
          ex.position.y + ex.size.height > posY,
        )
        if (!overlaps) break
        const nextOffset = (attempt + 1) * OFFSET_STEP
        posX = Math.min(finalX + nextOffset, page.width - el.size.width)
        posY = Math.min(finalY + nextOffset, sectionH - el.size.height)
      }

      addElement(page.id, { ...el, position: { x: posX, y: posY } }, sectionId)
    },
    [page, zoom, snapToGrid, gridSize, margins, addElement, updateElement, setElementSchemaBinding, ref, t],
  )

  // -----------------------------------------------------------------------
  // Schema GROUP drop handler — drops all fields at once onto a repeatingBand
  // -----------------------------------------------------------------------
  const handleSchemaGroupDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      const raw = e.dataTransfer.getData(SCHEMA_GROUP_MIME)
      if (!raw || !page) return

      let payload: SchemaGroupDragPayload
      try {
        payload = JSON.parse(raw)
      } catch {
        return
      }
      e.preventDefault()

      const canvasEl = ref.current
      if (!canvasEl) return
      const rect = canvasEl.getBoundingClientRect()
      const xMm = pxToMm((e.clientX - rect.left) / zoom)
      const yMm = pxToMm((e.clientY - rect.top) / zoom)

      // Determine section
      let sectionId: string | undefined
      let sectionOffsetY = 0
      for (const sec of page.sections) {
        if (yMm < sectionOffsetY + sec.height) {
          sectionId = sec.id
          break
        }
        sectionOffsetY += sec.height
      }
      const relativeY = yMm - sectionOffsetY
      const targetSection = page.sections.find((s) => s.id === sectionId)
      const sectionElements = targetSection?.elements ?? []

      // Hit-test for repeatingBand/List
      const sorted = [...sectionElements].sort((a, b) => b.zIndex - a.zIndex)
      let hitElement: ReportElement | null = null
      for (const el of sorted) {
        if (
          xMm >= el.position.x &&
          xMm <= el.position.x + el.size.width &&
          relativeY >= el.position.y &&
          relativeY <= el.position.y + el.size.height
        ) {
          hitElement = el
          break
        }
      }

      const REPEATING_TYPES = new Set(['repeatingBand', 'repeatingList'])

      if (hitElement && REPEATING_TYPES.has(hitElement.type)) {
        // Drop group onto repeatingBand → add all fields as columns
        const bandEl = hitElement as ReportElement & {
          fields?: { key: string; label: string; width: number; align?: string; format?: { type: string } }[]
          dataSource?: string
          totals?: { fieldKey: string; formula: string; label?: string }[]
          showFooter?: boolean
        }
        const existingKeys = new Set((bandEl.fields ?? []).map((f) => f.key))
        const addedFields = payload.fields.filter((f) => !existingKeys.has(f.fieldKey))
        if (addedFields.length === 0) return

        const newFields = addedFields.map((f) => {
          const isNumeric = f.fieldType === 'number'
          return {
            key: f.fieldKey,
            label: f.fieldLabel,
            width: 20,
            align: (isNumeric ? 'right' : 'left') as 'left' | 'right' | 'center',
            ...(isNumeric ? { format: { type: 'comma' as const } } : {}),
          }
        })

        // Auto-add totals for numeric fields
        const existingTotals = bandEl.totals ?? []
        const existingTotalKeys = new Set(existingTotals.map((t) => t.fieldKey))
        const newTotals = addedFields
          .filter((f) => f.fieldType === 'number' && !existingTotalKeys.has(f.fieldKey))
          // eslint-disable-next-line i18next/no-literal-string -- seed default label persisted to the data model
          .map((f) => ({ fieldKey: f.fieldKey, formula: 'sum' as const, label: '合計' }))

        const patch: Record<string, unknown> = {
          fields: [...(bandEl.fields ?? []), ...newFields],
        }
        if (newTotals.length > 0) {
          patch.totals = [...existingTotals, ...newTotals]
          patch.showFooter = true
        }
        if (!bandEl.dataSource && payload.groupDataKey) {
          patch.dataSource = payload.groupDataKey
        }
        updateElement(page.id, hitElement.id, patch)
        toast.success(t('canvas.reportCanvas.columnsAdded', { n: addedFields.length }))
      }
      // If not dropped on a repeating element, do nothing (group-level drop only makes sense for repeating)
    },
    [page, zoom, updateElement, ref, t],
  )

  const handleContextMenuClose = useCallback(() => setContextMenu(null), [])

  const ctxEl = contextMenu && page
    ? flattenPageElements(page).find((e) => e.id === contextMenu.elementId) ?? null
    : null

  // Ruler ticks (every 10mm) — memoized so they don't rebuild on every drag frame.
  // Runs before the `!page` early return so hook order stays stable across renders.
  const pageWidth = page?.width ?? 0
  const pageHeight = page?.height ?? 0
  const { hTicks, vTicks, gridLinePxH, gridLinePxV } = useMemo(() => {
    const hTicks: number[] = []
    for (let mm = 0; mm <= pageWidth; mm += 10) hTicks.push(mm)
    const vTicks: number[] = []
    for (let mm = 0; mm <= pageHeight; mm += 10) vTicks.push(mm)
    const gridLinePxH: number[] = []
    for (let mm = 0; mm <= pageWidth; mm += gridSize) gridLinePxH.push(mmToPx(mm))
    const gridLinePxV: number[] = []
    for (let mm = 0; mm <= pageHeight; mm += gridSize) gridLinePxV.push(mmToPx(mm))
    return { hTicks, vTicks, gridLinePxH, gridLinePxV }
  }, [pageWidth, pageHeight, gridSize])

  if (!page) return null

  const canvasWidthPx = mmToPx(page.width)
  const canvasHeightPx = mmToPx(page.height)

  const contextMenuEl = (
    <ContextMenu
      menu={contextMenu}
      pageId={page?.id}
      onClose={handleContextMenuClose}
      onCopy={() => page && copyElements(page.id, contextMenu ? [contextMenu.elementId] : [])}
      onCut={() => page && cutElements(page.id, contextMenu ? [contextMenu.elementId] : [])}
      onPaste={() => page && pasteElements(page.id)}
      onDuplicate={() => {
        if (page && contextMenu) duplicateElement(page.id, contextMenu.elementId)
      }}
      onDelete={() => {
        if (page && contextMenu) removeElement(page.id, contextMenu.elementId)
      }}
      onToggleLock={() => {
        if (page && ctxEl) {
          updateElement(page.id, ctxEl.id, { locked: !ctxEl.locked })
        }
      }}
      onToggleVisible={() => {
        if (page && ctxEl) {
          updateElement(page.id, ctxEl.id, { visible: !ctxEl.visible })
        }
      }}
      onZOrder={(order) => {
        if (page && contextMenu) setZOrder(page.id, contextMenu.elementId, order)
      }}
      onGroup={selectedIds.length >= 2 ? () => { if (page) groupSelectedElements(page.id) } : undefined}
      hasPaste={!!clipboard && clipboard.length > 0}
    />
  )

  const paperEl = (
    <DndContext
      sensors={sensors}
      modifiers={readonly ? [] : [restrictToParentElement, axisConstraintModifier]}
      onDragEnd={handleDragEnd}
    >
      <div
        ref={ref}
        className="report-page"
        style={{
          position: 'relative',
          width: canvasWidthPx,
          height: canvasHeightPx,
          background: page.background,
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
          flexShrink: 0,
          overflow: 'hidden',
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
        }}
        onClick={() => { if (!readonly && !consumeClickIfDragSelected()) clearSelection() }}
        onContextMenu={(e) => { if (!readonly) e.preventDefault() }}
        onPointerDown={onMarqueePointerDown}
        onPointerMove={onMarqueePointerMove}
        onPointerUp={onMarqueePointerUp}
        onDragOver={readonly ? undefined : handlePaletteDragOver}
        onDragLeave={readonly ? undefined : () => setDropHighlightId(null)}
        onDrop={readonly ? undefined : (e) => {
          setDropHighlightId(null)
          if (e.dataTransfer.types.includes(SCHEMA_GROUP_MIME)) {
            handleSchemaGroupDrop(e)
          } else if (e.dataTransfer.types.includes(SCHEMA_FIELD_MIME)) {
            handleSchemaFieldDrop(e)
          } else {
            handlePaletteDrop(e)
          }
        }}
      >
        {/* Grid overlay */}
        {showGrid && !readonly && (
          <svg
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
          >
            {gridLinePxH.map((x) => (
              <line key={`h${x}`} x1={x} y1={0} x2={x} y2={canvasHeightPx} stroke="#e5e7eb" strokeWidth={0.5} />
            ))}
            {gridLinePxV.map((y) => (
              <line key={`v${y}`} x1={0} y1={y} x2={canvasWidthPx} y2={y} stroke="#e5e7eb" strokeWidth={0.5} />
            ))}
          </svg>
        )}
        {/* Margin guide overlay */}
        {showMarginGuide && !readonly && margins && (margins.top > 0 || margins.right > 0 || margins.bottom > 0 || margins.left > 0) && (
          <svg
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }}
          >
            <path
              d={`M0,0 H${canvasWidthPx} V${canvasHeightPx} H0 Z M${mmToPx(margins.left)},${mmToPx(margins.top)} V${canvasHeightPx - mmToPx(margins.bottom)} H${canvasWidthPx - mmToPx(margins.right)} V${mmToPx(margins.top)} Z`}
              fill="rgba(0,0,0,0.04)"
              fillRule="evenodd"
            />
            {/* Dashed lines at margin inner boundaries */}
            {margins.top > 0    && <line x1={0} y1={mmToPx(margins.top)}                          x2={canvasWidthPx}  y2={mmToPx(margins.top)}                          stroke="#a0aec0" strokeWidth={0.5} strokeDasharray="4 3" />}
            {margins.bottom > 0 && <line x1={0} y1={canvasHeightPx - mmToPx(margins.bottom)}      x2={canvasWidthPx}  y2={canvasHeightPx - mmToPx(margins.bottom)}      stroke="#a0aec0" strokeWidth={0.5} strokeDasharray="4 3" />}
            {margins.left > 0   && <line x1={mmToPx(margins.left)}                          y1={0} x2={mmToPx(margins.left)}                          y2={canvasHeightPx} stroke="#a0aec0" strokeWidth={0.5} strokeDasharray="4 3" />}
            {margins.right > 0  && <line x1={canvasWidthPx - mmToPx(margins.right)}         y1={0} x2={canvasWidthPx - mmToPx(margins.right)}         y2={canvasHeightPx} stroke="#a0aec0" strokeWidth={0.5} strokeDasharray="4 3" />}
          </svg>
        )}
        {page.sections.map((section) => (
          <SectionContainer
            key={section.id}
            section={section}
            pageId={page.id}
            selectedIds={selectedIdSet}
            dropHighlightId={dropHighlightId}
            onSelectElement={selectElement}
            onMoveElement={handleMove}
            onResizeElement={handleResize}
            onResizeSection={!readonly && headerEditMode && section.sectionType !== 'body' ? handleResizeSection : undefined}
            onContextMenu={setContextMenu}
            data={data}
            readonly={readonly}
            zoom={zoom}
            pageIndex={pageIndex}
            totalPages={totalPages}
          />
        ))}

        {/* Marquee selection rectangle */}
        {marquee && (
          <div
            style={{
              position: 'absolute',
              left: marquee.x,
              top: marquee.y,
              width: marquee.width,
              height: marquee.height,
              border: '1px solid hsl(var(--primary))',
              backgroundColor: 'hsl(var(--primary) / 0.08)',
              pointerEvents: 'none',
              zIndex: 9999,
            }}
          />
        )}
      </div>
    </DndContext>
  )

  // Full layout: sticky rulers + trim marks (used for both editor and readonly/preview)
  const pw = canvasWidthPx * zoom
  const ph = canvasHeightPx * zoom
  // Guide line positions (paper top-left is at RULER_SIZE + CANVAS_PADDING from scroll origin)
  const guideOffset = RULER_SIZE + CANVAS_PADDING
  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto', position: 'relative' }}>
      {/* Page edge guide lines (editor only) */}
      {!readonly && (<>
        <div style={{ position: 'absolute', top: guideOffset, left: 0, right: 0, height: 0, borderTop: '1px dashed #c8ccd0', pointerEvents: 'none', zIndex: 8 }} />
        <div style={{ position: 'absolute', top: guideOffset + ph, left: 0, right: 0, height: 0, borderTop: '1px dashed #c8ccd0', pointerEvents: 'none', zIndex: 8 }} />
        <div style={{ position: 'absolute', left: guideOffset, top: 0, bottom: 0, width: 0, borderLeft: '1px dashed #c8ccd0', pointerEvents: 'none', zIndex: 8 }} />
        <div style={{ position: 'absolute', left: guideOffset + pw, top: 0, bottom: 0, width: 0, borderLeft: '1px dashed #c8ccd0', pointerEvents: 'none', zIndex: 8 }} />
      </>)}
      {/* Sticky header row: corner square + horizontal ruler */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          pointerEvents: 'none',
        }}
      >
        {/* Corner square */}
        <div
          style={{
            width: RULER_SIZE,
            height: RULER_SIZE,
            flexShrink: 0,
            background: '#f8f9fa',
            borderRight: '1px solid #e5e7eb',
            borderBottom: '1px solid #e5e7eb',
          }}
        />
        {/* Horizontal ruler — ticks offset by CANVAS_PADDING to align with paper */}
        <div
          style={{
            height: RULER_SIZE,
            overflow: 'hidden',
            background: '#f8f9fa',
            borderBottom: '1px solid #e5e7eb',
            userSelect: 'none',
            flex: 1,
          }}
        >
          <svg
            width={CANVAS_PADDING + canvasWidthPx * zoom + CANVAS_PADDING}
            height={RULER_SIZE}
            style={{ display: 'block' }}
          >
            {hTicks.map((mm) => {
              const x = CANVAS_PADDING + mmToPx(mm) * zoom
              const isMajor = mm % 50 === 0
              return (
                <g key={mm}>
                  <line x1={x} y1={isMajor ? 4 : 10} x2={x} y2={RULER_SIZE} stroke="#9ca3af" strokeWidth={0.5} />
                  {isMajor && <text x={x + 2} y={10} fontSize={8} fill="#6b7280">{mm}</text>}
                </g>
              )
            })}
          </svg>
        </div>
      </div>

      {/* H/F edit mode banner — sticky below ruler */}
      {!readonly && headerEditMode && (
        <div
          style={{
            position: 'sticky',
            top: RULER_SIZE,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '5px 12px',
            background: '#fffbeb',
            borderBottom: '1px solid #fcd34d',
            color: '#92400e',
            fontSize: '12px',
          }}
          role="status"
          aria-live="polite"
        >
          <PanelTop style={{ width: 14, height: 14, flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{t('canvas.reportCanvas.headerFooterEditMode')}</span>
          <button
            onClick={() => setHeaderEditMode(false)}
            style={{
              padding: '2px 8px',
              fontSize: '11px',
              border: '1px solid #fcd34d',
              borderRadius: '4px',
              background: 'white',
              color: '#92400e',
              cursor: 'pointer',
            }}
            aria-label={t('canvas.reportCanvas.exitHeaderFooterEditMode')}
          >
            {t('canvas.reportCanvas.exitEdit')}
          </button>
        </div>
      )}

      {/* Content row: sticky left ruler + paper */}
      <div style={{ display: 'flex' }}>
        {/* Vertical ruler — sticky left, ticks offset by CANVAS_PADDING */}
        <div
          style={{
            position: 'sticky',
            left: 0,
            zIndex: 9,
            width: RULER_SIZE,
            flexShrink: 0,
            background: '#f8f9fa',
            borderRight: '1px solid #e5e7eb',
            overflow: 'hidden',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        >
          <svg
            width={RULER_SIZE}
            height={CANVAS_PADDING + canvasHeightPx * zoom + CANVAS_PADDING}
            style={{ display: 'block' }}
          >
            {vTicks.map((mm) => {
              const y = CANVAS_PADDING + mmToPx(mm) * zoom
              const isMajor = mm % 50 === 0
              return (
                <g key={mm}>
                  <line x1={isMajor ? 4 : 10} y1={y} x2={RULER_SIZE} y2={y} stroke="#9ca3af" strokeWidth={0.5} />
                  {isMajor && mm > 0 && (
                    <text
                      x={RULER_SIZE / 2}
                      y={y - 2}
                      fontSize={8}
                      fill="#6b7280"
                      textAnchor="middle"
                      transform={`rotate(-90, ${RULER_SIZE / 2}, ${y - 2})`}
                    >{mm}</text>
                  )}
                </g>
              )
            })}
          </svg>
        </div>

        {/* Paper area with padding */}
        <div style={{ padding: CANVAS_PADDING }}>
          {/* Trim marks — rendered outside the paper, inside the padding zone */}
          <div style={{ position: 'relative' }}>
            {showTrimMarks && (() => {
              const gapPx = mmToPx(TRIM_GAP_MM) * zoom
              const markPx = mmToPx(TRIM_LENGTH_MM) * zoom
              const offset = gapPx + markPx
              const pw = canvasWidthPx * zoom
              const ph = canvasHeightPx * zoom
              const stroke = '#333'
              const sw = 0.75
              // Each corner: one horizontal line + one vertical line
              const corners = [
                // top-left
                [{ x1: 0, y1: offset, x2: markPx, y2: offset },          // H
                 { x1: offset, y1: 0, x2: offset, y2: markPx }],          // V
                // top-right
                [{ x1: offset + pw + gapPx, y1: offset, x2: offset + pw + gapPx + markPx, y2: offset },
                 { x1: offset + pw, y1: 0, x2: offset + pw, y2: markPx }],
                // bottom-left
                [{ x1: 0, y1: offset + ph, x2: markPx, y2: offset + ph },
                 { x1: offset, y1: offset + ph + gapPx, x2: offset, y2: offset + ph + gapPx + markPx }],
                // bottom-right
                [{ x1: offset + pw + gapPx, y1: offset + ph, x2: offset + pw + gapPx + markPx, y2: offset + ph },
                 { x1: offset + pw, y1: offset + ph + gapPx, x2: offset + pw, y2: offset + ph + gapPx + markPx }],
              ]
              return (
                <svg
                  style={{
                    position: 'absolute',
                    top: -offset,
                    left: -offset,
                    pointerEvents: 'none',
                    zIndex: 5,
                    overflow: 'visible',
                  }}
                  width={2 * offset + pw}
                  height={2 * offset + ph}
                >
                  {corners.map((lines, ci) =>
                    lines.map((l, li) => (
                      <line key={`${ci}-${li}`} {...l} stroke={stroke} strokeWidth={sw} />
                    ))
                  )}
                </svg>
              )
            })()}
            {paperEl}
          </div>
          {contextMenuEl}
        </div>
      </div>
    </div>
  )
}

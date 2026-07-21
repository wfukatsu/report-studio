/**
 * ElementPalette — sidebar panel listing all available element types.
 * Palette data (categories, icons, factories) lives in paletteData.tsx.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Database } from 'lucide-react'
import { useReportStore, selectActivePageId, selectActivePage } from '@/store/reportStore'
import { PALETTE_CATEGORIES } from './paletteData'
import type { PaletteCategory, PaletteItem } from './paletteData'
import type { ReportElement } from '@/types'
import { Tooltip } from '@/components/common/Tooltip'
import { isSystemGroup } from '@/store/schemaSlice'
import { SCHEMA_FIELD_MIME, SCHEMA_GROUP_MIME } from '@/components/bindingEditor/types'
import type { SchemaFieldDragPayload, SchemaGroupDragPayload } from '@/components/bindingEditor/types'
import { cn } from '@/lib/utils'
import { mmToPx } from '@/lib/paperSizes'

// Re-export for consumers that import from this module
export { PALETTE_CATEGORIES, PALETTE_ITEM_MAP } from './paletteData'

/**
 * Creates a custom drag image element showing the approximate size and label.
 * The element is appended to the body temporarily and removed after the drag starts.
 */
function createDragPreview(label: string, widthMm: number, heightMm: number): HTMLElement {
  const SCALE = 0.3 // scale down for readability as a drag ghost
  const el = document.createElement('div')
  const w = Math.round(mmToPx(widthMm) * SCALE)
  const h = Math.round(mmToPx(heightMm) * SCALE)
  el.style.cssText = `
    position: fixed; top: -9999px; left: -9999px;
    width: ${w}px; height: ${h}px;
    border: 2px dashed #3b82f6;
    border-radius: 4px;
    background: rgba(59,130,246,0.08);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; color: #3b82f6; font-weight: 600;
    pointer-events: none;
  `
  el.textContent = `${label} (${widthMm}×${heightMm}mm)`
  document.body.appendChild(el)
  return el
}

interface CategoryPanelProps {
  category: PaletteCategory
  onAdd: (createElement: () => ReportElement) => void
}

function CategoryPanel({ category, onAdd }: CategoryPanelProps) {
  const { t } = useTranslation('components')
  const [expanded, setExpanded] = useState(true)
  const dragPreviewRef = useRef<HTMLElement | null>(null)

  const handleDragStart = useCallback((e: React.DragEvent, item: PaletteItem) => {
    e.dataTransfer.setData('application/rds-palette', item.label)
    e.dataTransfer.effectAllowed = 'copy'

    // Create a custom drag image showing approximate element size
    const sample = item.createElement()
    const preview = createDragPreview(t(item.labelKey), sample.size.width, sample.size.height)
    dragPreviewRef.current = preview
    e.dataTransfer.setDragImage(preview, 0, 0)

    // Clean up after the browser captures the image
    requestAnimationFrame(() => {
      preview.remove()
      dragPreviewRef.current = null
    })
  }, [t])

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-1.5 px-1 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
      >
        {expanded
          ? <ChevronDown className="w-3 h-3" />
          : <ChevronRight className="w-3 h-3" />
        }
        {t(category.label)}
      </button>
      {expanded && (
        <div className="grid grid-cols-2 gap-1 mb-2">
          {category.items.map((item) => (
            <Tooltip key={item.label} content={item.descriptionKey ? t(item.descriptionKey, { token: '{{fieldKey}}' }) : undefined} placement="bottom">
              <button
                draggable
                onDragStart={(e) => handleDragStart(e, item)}
                onClick={() => onAdd(item.createElement)}
                className="w-full flex flex-col items-center gap-1 p-1.5 rounded-lg border border-border bg-card hover:bg-accent hover:text-accent-foreground transition-colors text-sm cursor-grab active:cursor-grabbing"
              >
                {item.icon}
                <span className="text-xs leading-tight text-center">{t(item.labelKey)}</span>
              </button>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  )
}

let placementOffset = 0

interface Rect { x: number; y: number; width: number; height: number }

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y
}

/**
 * Finds a placement near (startX, startY) that doesn't overlap any existing
 * element, cascading downward (then wrapping to a new column) until a free slot
 * is found. Falls back to the original position if the page is too crowded so a
 * click always adds *something* the user can then drag (#159).
 */
function findFreeSlot(
  startX: number, startY: number, width: number, height: number,
  existing: Array<{ position: { x: number; y: number }; size: { width: number; height: number } }>,
  pageWidth: number, pageHeight: number,
  margins: { top: number; right: number; bottom: number; left: number },
): { x: number; y: number } {
  const occupied: Rect[] = existing.map((e) => ({
    x: e.position.x, y: e.position.y, width: e.size.width, height: e.size.height,
  }))
  const step = Math.max(6, height / 2)
  const bottomLimit = pageHeight - margins.bottom
  let x = startX
  let y = startY
  for (let i = 0; i < 60; i++) {
    const candidate: Rect = { x, y, width, height }
    if (!occupied.some((r) => rectsOverlap(candidate, r))) return { x, y }
    y += step
    if (y + height > bottomLimit) {
      // Column full — restart near the top, shifted right by a column.
      y = Math.max(5, margins.top)
      x = Math.min(x + width * 0.5 + 8, Math.max(5, pageWidth - margins.right - width))
    }
  }
  return { x: startX, y: startY }
}

export function ElementPalette() {
  const activePageId = useReportStore(selectActivePageId)
  const activePage = useReportStore(selectActivePage)
  const addElement = useReportStore((s) => s.addElement)
  const margins = useReportStore((s) => s.definition.pageSettings.margins)

  const handleAdd = (createElement: () => ReportElement) => {
    if (!activePageId) return
    const el = createElement()
    const offset = (placementOffset % 8) * 5 - 17.5 // -17.5 to +17.5 range
    placementOffset++

    const pageWidth = activePage?.width ?? 210
    const pageHeight = activePage?.height ?? 297

    let posX: number
    let posY: number

    // Element-specific size adjustments
    let size = el.size
    if (el.type === 'divider') {
      // Fit divider width to content area (page width minus margins)
      const contentWidth = pageWidth - margins.left - margins.right
      size = { ...size, width: contentWidth }
    }

    if (el.type === 'pageNumber') {
      // Page number: bottom center (footer area)
      posX = (pageWidth - size.width) / 2
      posY = pageHeight - margins.bottom - size.height
    } else if (el.type === 'currentDate') {
      // Current date: top right (header area)
      posX = pageWidth - margins.right - size.width
      posY = margins.top
    } else if (el.type === 'divider') {
      // Divider: left margin, 1/3 down
      posX = margins.left
      posY = Math.max(5, (pageHeight / 3) + offset)
    } else {
      // Default: near center of page, then nudge to a free slot so consecutive
      // adds don't stack on top of each other / existing elements (#159). The
      // small cascade offset alone left elements heavily overlapping.
      posX = Math.max(5, (pageWidth - size.width) / 2 + offset)
      posY = Math.max(5, (pageHeight / 3) + offset) // 1/3 down from top
      const placed = findFreeSlot(
        posX, posY, size.width, size.height,
        (activePage?.sections ?? []).flatMap((s) => s.elements),
        pageWidth, pageHeight, margins,
      )
      posX = placed.x
      posY = placed.y
    }

    const positioned = { ...el, position: { x: posX, y: posY }, size }
    addElement(activePageId, positioned)
  }

  return (
    <div className="p-3 overflow-y-auto">
      {PALETTE_CATEGORIES.map((cat) => (
        <CategoryPanel key={cat.category} category={cat} onAdd={handleAdd} />
      ))}
      <SchemaFieldsSection />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Schema fields section — dynamic, from Zustand store
// ---------------------------------------------------------------------------

function SchemaFieldsSection() {
  const { t } = useTranslation('components')
  const schema = useReportStore((s) => s.definition.schema)
  const [expanded, setExpanded] = useState(true)

  const userGroups = useMemo(
    () => (schema?.groups ?? []).filter((g) => !isSystemGroup(g.id)),
    [schema?.groups],
  )

  if (userGroups.length === 0 || userGroups.every((g) => g.fields.length === 0)) {
    return null // Hide section when no schema fields defined
  }

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-1.5 px-1 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Database className="w-3 h-3" />
        {t('sidebar.elementPalette.schemaFields')}
      </button>
      {expanded && (
        <div className="space-y-1.5 mb-2">
          {userGroups.map((group) => {
            const groupPayload: SchemaGroupDragPayload = {
              groupId: group.id,
              groupLabel: group.label,
              groupRole: group.role,
              groupDataKey: group.dataKey,
              fields: group.fields.map((f) => ({
                fieldId: f.id,
                fieldKey: f.key,
                fieldLabel: f.label || f.key,
                fieldType: f.type,
              })),
            }
            return (
            <div key={group.id}>
              <div
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(SCHEMA_GROUP_MIME, JSON.stringify(groupPayload))
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                className="flex items-center gap-1 px-1 py-0.5 cursor-grab active:cursor-grabbing rounded hover:bg-muted/30"
                title={t('sidebar.elementPalette.groupDragTitle', { label: group.label })}
              >
                <span className={cn(
                  'text-[9px] px-1 py-px rounded font-medium',
                  group.role === 'master'
                    ? 'bg-blue-50 text-blue-600'
                    : 'bg-amber-50 text-amber-600',
                )}>
                  {group.role === 'master' ? 'M' : 'D'}
                </span>
                <span className="text-[10px] text-muted-foreground font-medium truncate">
                  {group.label}
                </span>
                <span className="text-[9px] text-muted-foreground/50 ml-auto">{t('sidebar.elementPalette.fieldCount', { n: group.fields.length })}</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {group.fields.map((field) => {
                  const payload: SchemaFieldDragPayload = {
                    fieldId: field.id,
                    groupId: group.id,
                    fieldKey: field.key,
                    fieldLabel: field.label || field.key,
                    fieldType: field.type,
                    groupRole: group.role,
                    groupDataKey: group.dataKey,
                  }
                  return (
                    <Tooltip key={field.id} content={`${group.label}.${field.key} (${field.type})`} placement="bottom">
                      <button
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(SCHEMA_FIELD_MIME, JSON.stringify(payload))
                          e.dataTransfer.effectAllowed = 'copy'
                        }}
                        className="w-full flex flex-col items-center gap-0.5 p-1.5 rounded-lg border border-dashed border-[#6366f1]/30 bg-[#6366f1]/5 hover:bg-[#6366f1]/10 hover:border-[#6366f1]/50 transition-colors text-xs cursor-grab active:cursor-grabbing"
                      >
                        <span className="text-[10px] font-mono truncate w-full text-center text-[#6366f1]">
                          {field.label || field.key}
                        </span>
                      </button>
                    </Tooltip>
                  )
                })}
              </div>
            </div>
          )})}
        </div>
      )}
    </div>
  )
}

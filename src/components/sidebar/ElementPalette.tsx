/**
 * ElementPalette — sidebar panel listing all available element types.
 * Palette data (categories, icons, factories) lives in paletteData.tsx.
 */

import { useReportStore, selectActivePageId, selectActivePage } from '@/store/reportStore'
import { PALETTE_CATEGORIES } from './paletteData'
import type { PaletteCategory } from './paletteData'
import type { ReportElement } from '@/types'
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Tooltip } from '@/components/common/Tooltip'

// Re-export for consumers that import from this module
export { PALETTE_CATEGORIES, PALETTE_ITEM_MAP } from './paletteData'

interface CategoryPanelProps {
  category: PaletteCategory
  onAdd: (createElement: () => ReportElement) => void
}

function CategoryPanel({ category, onAdd }: CategoryPanelProps) {
  const [expanded, setExpanded] = useState(true)

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
        {category.label}
      </button>
      {expanded && (
        <div className="grid grid-cols-2 gap-1 mb-2">
          {category.items.map((item) => (
            <Tooltip key={item.label} content={item.description} placement="bottom">
              <button
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/rds-palette', item.label)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => onAdd(item.createElement)}
                className="w-full flex flex-col items-center gap-1 p-1.5 rounded-lg border border-border bg-card hover:bg-accent hover:text-accent-foreground transition-colors text-sm cursor-grab active:cursor-grabbing"
              >
                {item.icon}
                <span className="text-xs leading-tight text-center">{item.label}</span>
              </button>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  )
}

let placementOffset = 0

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
      // Default: near center of page
      posX = Math.max(5, (pageWidth - el.size.width) / 2 + offset)
      posY = Math.max(5, (pageHeight / 3) + offset) // 1/3 down from top
    }

    const positioned = { ...el, position: { x: posX, y: posY }, size }
    addElement(activePageId, positioned)
  }

  return (
    <div className="p-3 overflow-y-auto">
      {PALETTE_CATEGORIES.map((cat) => (
        <CategoryPanel key={cat.category} category={cat} onAdd={handleAdd} />
      ))}
    </div>
  )
}

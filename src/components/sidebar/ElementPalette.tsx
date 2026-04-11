import {
  Type,
  Image,
  BarChart2,
  Square,
  Database,
  QrCode,
  PenLine,
  Stamp,
  Rows3,
  Ticket,
  Circle,
  Minus,
  AlignJustify,
  LayoutGrid,
  TableProperties,
  SquareCheck,
  Calendar,
  Hash,
  CalendarDays,
  SeparatorHorizontal,
} from 'lucide-react'
import { useReportStore, selectActivePageId, selectActivePage } from '@/store/reportStore'
import {
  createTextElement,
  createImageElement,
  createChartElement,
  createShapeElement,
  createDataFieldElement,
  createManualEntryField,
  createHankoElement,
  createBarcodeElement,
  createBarcodeCode128Element,
  createApprovalStampRowElement,
  createRevenueStampElement,
  createRepeatingBandElement,
  createRepeatingListElement,
  createFormTableElement,
  createCheckboxElement,
  createEraSelectElement,
  createPageNumberElement,
  createCurrentDateElement,
  createDividerElement,
} from '@/lib/elementFactories'
import type { ReportElement } from '@/types'
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Tooltip } from '@/components/common/Tooltip'

interface PaletteItem {
  label: string
  icon: React.ReactNode
  createElement: () => ReportElement
  description?: string
}

interface PaletteCategory {
  category: string
  label: string
  items: PaletteItem[]
}

export const PALETTE_CATEGORIES: PaletteCategory[] = [
  {
    category: 'common',
    label: '帳票共通',
    items: [
      { label: 'ページ番号', icon: <Hash className="w-4 h-4" />,              createElement: createPageNumberElement, description: 'ページ番号を自動表示（書式選択可能）' },
      { label: '現在日付',   icon: <CalendarDays className="w-4 h-4" />,      createElement: createCurrentDateElement, description: '帳票出力日を自動表示（和暦対応）' },
      { label: '区切り線',   icon: <SeparatorHorizontal className="w-4 h-4" />, createElement: createDividerElement, description: 'セクション区切り用の罫線' },
    ],
  },
  {
    category: 'text',
    label: 'テキスト系',
    items: [
      { label: 'テキスト',         icon: <Type className="w-4 h-4" />,     createElement: createTextElement, description: '固定テキスト。{{fieldKey}}でデータ埋め込み可能。ラベル用途にも' },
      { label: 'データフィールド', icon: <Database className="w-4 h-4" />, createElement: createDataFieldElement, description: 'データソースのフィールドを表示（例：顧客名、金額）' },
    ],
  },
  {
    category: 'shape',
    label: '図形・画像',
    items: [
      { label: '矩形',  icon: <Square className="w-4 h-4" />,  createElement: () => createShapeElement({ shape: 'rectangle' } as Partial<ReportElement>) },
      { label: '円',    icon: <Circle className="w-4 h-4" />,  createElement: () => createShapeElement({ shape: 'circle' } as Partial<ReportElement>) },
      { label: '線',    icon: <Minus className="w-4 h-4" />,   createElement: () => createShapeElement({ shape: 'line', size: { width: 53, height: 0.5 } } as Partial<ReportElement>) },
      { label: '画像',  icon: <Image className="w-4 h-4" />,   createElement: createImageElement },
    ],
  },
  {
    category: 'repeating',
    label: '繰り返し要素',
    items: [
      {
        label: '繰り返しバンド',
        icon: <AlignJustify className="w-4 h-4 text-blue-500" />,
        createElement: createRepeatingBandElement,
        description: 'データ行を表形式で繰り返し表示（例：請求書の明細行）',
      },
      {
        label: '繰り返しリスト',
        icon: <LayoutGrid className="w-4 h-4 text-purple-500" />,
        createElement: createRepeatingListElement,
        description: 'データをカード・グリッド形式で表示（例：商品カタログ）',
      },
      {
        label: '帳票テーブル',
        icon: <TableProperties className="w-4 h-4 text-green-600" />,
        createElement: createFormTableElement,
        description: '行・列定義を持つ帳票専用テーブル。固定レイアウトとデータバインドに両対応',
      },
    ],
  },
  {
    category: 'data',
    label: 'データ表示',
    items: [
      { label: 'グラフ',     icon: <BarChart2 className="w-4 h-4" />, createElement: createChartElement },
      { label: 'QRコード',   icon: <QrCode className="w-4 h-4" />,   createElement: createBarcodeElement },
      { label: 'バーコード', icon: <Rows3 className="w-4 h-4" />,    createElement: createBarcodeCode128Element },
    ],
  },
  {
    category: 'input',
    label: '記入欄',
    items: [
      { label: '記入欄', icon: <PenLine className="w-4 h-4" />, createElement: createManualEntryField },
    ],
  },
  {
    category: 'japanese',
    label: '日本語帳票専用',
    items: [
      { label: '印鑑',       icon: <Stamp className="w-4 h-4" />,  createElement: createHankoElement, description: '押印欄（社印・個人印）' },
      { label: '多段印鑑欄', icon: <Rows3 className="w-4 h-4" />,  createElement: createApprovalStampRowElement, description: '承認フロー用の複数印鑑欄' },
      { label: '収入印紙欄', icon: <Ticket className="w-4 h-4" />, createElement: createRevenueStampElement, description: '収入印紙の貼付欄' },
      { label: 'チェックボックス', icon: <SquareCheck className="w-4 h-4" />, createElement: createCheckboxElement, description: 'チェックボックス（固定／データバインド両対応）' },
      { label: '元号選択', icon: <Calendar className="w-4 h-4" />, createElement: createEraSelectElement, description: '和暦元号選択（明・大・昭・平・令）' },
    ],
  },
]

/** Lookup map: palette label → createElement factory. Used by ReportCanvas for drag-and-drop. */
export const PALETTE_ITEM_MAP: Record<string, () => ReportElement> = Object.fromEntries(
  PALETTE_CATEGORIES.flatMap((cat) => cat.items.map((item) => [item.label, item.createElement])),
)

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
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {category.items.map((item) => (
            <Tooltip key={item.label} content={item.description} placement="bottom">
              <button
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/rds-palette', item.label)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => onAdd(item.createElement)}
                className="w-full flex flex-col items-center gap-1.5 p-2.5 rounded-lg border border-border bg-card hover:bg-accent hover:text-accent-foreground transition-colors text-sm cursor-grab active:cursor-grabbing"
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

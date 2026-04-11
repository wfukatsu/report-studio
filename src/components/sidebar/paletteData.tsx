/* eslint-disable react-refresh/only-export-components -- data-only file; JSX used for icon values, not component exports */
/**
 * Palette category and item data.
 *
 * Extracted from ElementPalette.tsx into its own file so that ElementPalette.tsx
 * only exports React components (required for React Fast Refresh).
 * This file intentionally exports only data constants (no React components).
 * The JSX in icon fields are element values, not exported component functions.
 */

import {
  Type,
  Image,
  BarChart2,
  Square,
  Database,
  QrCode,
  Barcode,
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

export interface PaletteItem {
  label: string
  icon: React.ReactNode
  createElement: () => ReportElement
  description?: string
}

export interface PaletteCategory {
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
      { label: 'バーコード', icon: <Barcode className="w-4 h-4" />,  createElement: createBarcodeCode128Element },
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

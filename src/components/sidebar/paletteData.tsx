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
  Building2,
  MapPin,
  Phone,
  User,
  Tag,
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
  createTenantCompanyNameElement,
  createTenantAddressElement,
  createTenantPhoneElement,
  createTenantRepresentativeElement,
  createTenantLogoElement,
  createTenantCustomElement,
} from '@/lib/elementFactories'
import type { ReportElement } from '@/types'
import type { ParseKeys } from 'i18next'

export interface PaletteItem {
  /** Stable identifier used as the PALETTE_ITEM_MAP key and drag payload (NOT displayed). */
  label: string
  /** i18n key (namespace `components`) for the displayed label. */
  labelKey: ParseKeys<'components'>
  icon: React.ReactNode
  createElement: () => ReportElement
  /** i18n key (namespace `components`) for the tooltip description. */
  descriptionKey?: ParseKeys<'components'>
}

export interface PaletteCategory {
  category: string
  /** i18n key (namespace `components`) for the displayed category label. */
  label: ParseKeys<'components'>
  items: PaletteItem[]
}

export const PALETTE_CATEGORIES: PaletteCategory[] = [
  {
    category: 'common',
    label: 'sidebar.paletteData.cat.common',
    items: [
      { label: 'ページ番号', labelKey: 'sidebar.paletteData.item.pageNumber', icon: <Hash className="w-4 h-4" />,              createElement: createPageNumberElement, descriptionKey: 'sidebar.paletteData.desc.pageNumber' },
      { label: '現在日付',   labelKey: 'sidebar.paletteData.item.currentDate', icon: <CalendarDays className="w-4 h-4" />,      createElement: createCurrentDateElement, descriptionKey: 'sidebar.paletteData.desc.currentDate' },
      { label: '区切り線',   labelKey: 'sidebar.paletteData.item.divider', icon: <SeparatorHorizontal className="w-4 h-4" />, createElement: createDividerElement, descriptionKey: 'sidebar.paletteData.desc.divider' },
    ],
  },
  {
    category: 'text',
    label: 'sidebar.paletteData.cat.text',
    items: [
      { label: 'テキスト',         labelKey: 'sidebar.paletteData.item.text', icon: <Type className="w-4 h-4" />,     createElement: createTextElement, descriptionKey: 'sidebar.paletteData.desc.text' },
      { label: 'データフィールド', labelKey: 'sidebar.paletteData.item.dataField', icon: <Database className="w-4 h-4" />, createElement: createDataFieldElement, descriptionKey: 'sidebar.paletteData.desc.dataField' },
    ],
  },
  {
    category: 'shape',
    label: 'sidebar.paletteData.cat.shape',
    items: [
      { label: '矩形',  labelKey: 'sidebar.paletteData.item.rectangle', icon: <Square className="w-4 h-4" />,  createElement: () => createShapeElement({ shape: 'rectangle' } as Partial<ReportElement>) },
      { label: '円',    labelKey: 'sidebar.paletteData.item.circle', icon: <Circle className="w-4 h-4" />,  createElement: () => createShapeElement({ shape: 'circle' } as Partial<ReportElement>) },
      { label: '線',    labelKey: 'sidebar.paletteData.item.line', icon: <Minus className="w-4 h-4" />,   createElement: () => createShapeElement({ shape: 'line', size: { width: 53, height: 0.5 } } as Partial<ReportElement>) },
      { label: '画像',  labelKey: 'sidebar.paletteData.item.image', icon: <Image className="w-4 h-4" />,   createElement: createImageElement },
    ],
  },
  {
    category: 'repeating',
    label: 'sidebar.paletteData.cat.repeating',
    items: [
      {
        label: '繰り返しバンド',
        labelKey: 'sidebar.paletteData.item.repeatingBand',
        icon: <AlignJustify className="w-4 h-4 text-blue-500" />,
        createElement: createRepeatingBandElement,
        descriptionKey: 'sidebar.paletteData.desc.repeatingBand',
      },
      {
        label: '繰り返しリスト',
        labelKey: 'sidebar.paletteData.item.repeatingList',
        icon: <LayoutGrid className="w-4 h-4 text-purple-500" />,
        createElement: createRepeatingListElement,
        descriptionKey: 'sidebar.paletteData.desc.repeatingList',
      },
      {
        label: '帳票テーブル',
        labelKey: 'sidebar.paletteData.item.formTable',
        icon: <TableProperties className="w-4 h-4 text-green-600" />,
        createElement: createFormTableElement,
        descriptionKey: 'sidebar.paletteData.desc.formTable',
      },
    ],
  },
  {
    category: 'data',
    label: 'sidebar.paletteData.cat.data',
    items: [
      { label: 'グラフ',     labelKey: 'sidebar.paletteData.item.chart', icon: <BarChart2 className="w-4 h-4" />, createElement: createChartElement },
      { label: 'QRコード',   labelKey: 'sidebar.paletteData.item.qrCode', icon: <QrCode className="w-4 h-4" />,   createElement: createBarcodeElement },
      { label: 'バーコード', labelKey: 'sidebar.paletteData.item.barcode', icon: <Barcode className="w-4 h-4" />,  createElement: createBarcodeCode128Element },
    ],
  },
  {
    category: 'input',
    label: 'sidebar.paletteData.cat.input',
    items: [
      { label: '記入欄', labelKey: 'sidebar.paletteData.item.manualEntry', icon: <PenLine className="w-4 h-4" />, createElement: createManualEntryField },
    ],
  },
  {
    category: 'japanese',
    label: 'sidebar.paletteData.cat.japanese',
    items: [
      { label: '印鑑',       labelKey: 'sidebar.paletteData.item.hanko', icon: <Stamp className="w-4 h-4" />,  createElement: createHankoElement, descriptionKey: 'sidebar.paletteData.desc.hanko' },
      { label: '多段印鑑欄', labelKey: 'sidebar.paletteData.item.approvalStampRow', icon: <Rows3 className="w-4 h-4" />,  createElement: createApprovalStampRowElement, descriptionKey: 'sidebar.paletteData.desc.approvalStampRow' },
      { label: '収入印紙欄', labelKey: 'sidebar.paletteData.item.revenueStamp', icon: <Ticket className="w-4 h-4" />, createElement: createRevenueStampElement, descriptionKey: 'sidebar.paletteData.desc.revenueStamp' },
      { label: 'チェックボックス', labelKey: 'sidebar.paletteData.item.checkbox', icon: <SquareCheck className="w-4 h-4" />, createElement: createCheckboxElement, descriptionKey: 'sidebar.paletteData.desc.checkbox' },
      { label: '元号選択', labelKey: 'sidebar.paletteData.item.eraSelect', icon: <Calendar className="w-4 h-4" />, createElement: createEraSelectElement, descriptionKey: 'sidebar.paletteData.desc.eraSelect' },
    ],
  },
  {
    category: 'tenant',
    label: 'sidebar.paletteData.cat.tenant',
    items: [
      { label: '会社名',           labelKey: 'sidebar.paletteData.item.companyName', icon: <Building2 className="w-4 h-4" />, createElement: createTenantCompanyNameElement, descriptionKey: 'sidebar.paletteData.desc.companyName' },
      { label: '住所',             labelKey: 'sidebar.paletteData.item.address', icon: <MapPin className="w-4 h-4" />,    createElement: createTenantAddressElement,     descriptionKey: 'sidebar.paletteData.desc.address' },
      { label: '電話番号',         labelKey: 'sidebar.paletteData.item.phone', icon: <Phone className="w-4 h-4" />,     createElement: createTenantPhoneElement,       descriptionKey: 'sidebar.paletteData.desc.phone' },
      { label: '代表者名',         labelKey: 'sidebar.paletteData.item.representative', icon: <User className="w-4 h-4" />,      createElement: createTenantRepresentativeElement, descriptionKey: 'sidebar.paletteData.desc.representative' },
      { label: 'ロゴ',             labelKey: 'sidebar.paletteData.item.logo', icon: <Image className="w-4 h-4" />,     createElement: createTenantLogoElement,        descriptionKey: 'sidebar.paletteData.desc.logo' },
      { label: 'カスタムフィールド', labelKey: 'sidebar.paletteData.item.custom', icon: <Tag className="w-4 h-4" />,    createElement: createTenantCustomElement,      descriptionKey: 'sidebar.paletteData.desc.custom' },
    ],
  },
]

/** Lookup map: palette label → createElement factory. Used by ReportCanvas for drag-and-drop. */
export const PALETTE_ITEM_MAP: Record<string, () => ReportElement> = Object.fromEntries(
  PALETTE_CATEGORIES.flatMap((cat) => cat.items.map((item) => [item.label, item.createElement])),
)

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
  /** Stable ASCII identifier used as the PALETTE_ITEM_MAP key and drag payload (#411 — NOT displayed, never localized). */
  type: string
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
      { type: 'pageNumber', labelKey: 'sidebar.paletteData.item.pageNumber', icon: <Hash className="w-4 h-4" />,              createElement: createPageNumberElement, descriptionKey: 'sidebar.paletteData.desc.pageNumber' },
      { type: 'currentDate',   labelKey: 'sidebar.paletteData.item.currentDate', icon: <CalendarDays className="w-4 h-4" />,      createElement: createCurrentDateElement, descriptionKey: 'sidebar.paletteData.desc.currentDate' },
      { type: 'divider',   labelKey: 'sidebar.paletteData.item.divider', icon: <SeparatorHorizontal className="w-4 h-4" />, createElement: createDividerElement, descriptionKey: 'sidebar.paletteData.desc.divider' },
    ],
  },
  {
    category: 'text',
    label: 'sidebar.paletteData.cat.text',
    items: [
      { type: 'text',         labelKey: 'sidebar.paletteData.item.text', icon: <Type className="w-4 h-4" />,     createElement: createTextElement, descriptionKey: 'sidebar.paletteData.desc.text' },
      { type: 'dataField', labelKey: 'sidebar.paletteData.item.dataField', icon: <Database className="w-4 h-4" />, createElement: createDataFieldElement, descriptionKey: 'sidebar.paletteData.desc.dataField' },
    ],
  },
  {
    category: 'shape',
    label: 'sidebar.paletteData.cat.shape',
    items: [
      { type: 'rectangle',  labelKey: 'sidebar.paletteData.item.rectangle', icon: <Square className="w-4 h-4" />,  createElement: () => createShapeElement({ shape: 'rectangle' } as Partial<ReportElement>) },
      { type: 'circle',    labelKey: 'sidebar.paletteData.item.circle', icon: <Circle className="w-4 h-4" />,  createElement: () => createShapeElement({ shape: 'circle' } as Partial<ReportElement>) },
      { type: 'line',    labelKey: 'sidebar.paletteData.item.line', icon: <Minus className="w-4 h-4" />,   createElement: () => createShapeElement({ shape: 'line', size: { width: 53, height: 0.5 } } as Partial<ReportElement>) },
      { type: 'image',  labelKey: 'sidebar.paletteData.item.image', icon: <Image className="w-4 h-4" />,   createElement: createImageElement },
    ],
  },
  {
    category: 'repeating',
    label: 'sidebar.paletteData.cat.repeating',
    items: [
      {
        type: 'repeatingBand',
        labelKey: 'sidebar.paletteData.item.repeatingBand',
        icon: <AlignJustify className="w-4 h-4 text-blue-500" />,
        createElement: createRepeatingBandElement,
        descriptionKey: 'sidebar.paletteData.desc.repeatingBand',
      },
      {
        type: 'repeatingList',
        labelKey: 'sidebar.paletteData.item.repeatingList',
        icon: <LayoutGrid className="w-4 h-4 text-purple-500" />,
        createElement: createRepeatingListElement,
        descriptionKey: 'sidebar.paletteData.desc.repeatingList',
      },
      {
        type: 'formTable',
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
      { type: 'chart',     labelKey: 'sidebar.paletteData.item.chart', icon: <BarChart2 className="w-4 h-4" />, createElement: createChartElement },
      { type: 'qrCode',   labelKey: 'sidebar.paletteData.item.qrCode', icon: <QrCode className="w-4 h-4" />,   createElement: createBarcodeElement },
      { type: 'barcode', labelKey: 'sidebar.paletteData.item.barcode', icon: <Barcode className="w-4 h-4" />,  createElement: createBarcodeCode128Element },
    ],
  },
  {
    category: 'input',
    label: 'sidebar.paletteData.cat.input',
    items: [
      { type: 'manualEntry', labelKey: 'sidebar.paletteData.item.manualEntry', icon: <PenLine className="w-4 h-4" />, createElement: createManualEntryField },
    ],
  },
  {
    category: 'japanese',
    label: 'sidebar.paletteData.cat.japanese',
    items: [
      { type: 'hanko',       labelKey: 'sidebar.paletteData.item.hanko', icon: <Stamp className="w-4 h-4" />,  createElement: createHankoElement, descriptionKey: 'sidebar.paletteData.desc.hanko' },
      { type: 'approvalStampRow', labelKey: 'sidebar.paletteData.item.approvalStampRow', icon: <Rows3 className="w-4 h-4" />,  createElement: createApprovalStampRowElement, descriptionKey: 'sidebar.paletteData.desc.approvalStampRow' },
      { type: 'revenueStamp', labelKey: 'sidebar.paletteData.item.revenueStamp', icon: <Ticket className="w-4 h-4" />, createElement: createRevenueStampElement, descriptionKey: 'sidebar.paletteData.desc.revenueStamp' },
      { type: 'checkbox', labelKey: 'sidebar.paletteData.item.checkbox', icon: <SquareCheck className="w-4 h-4" />, createElement: createCheckboxElement, descriptionKey: 'sidebar.paletteData.desc.checkbox' },
      { type: 'eraSelect', labelKey: 'sidebar.paletteData.item.eraSelect', icon: <Calendar className="w-4 h-4" />, createElement: createEraSelectElement, descriptionKey: 'sidebar.paletteData.desc.eraSelect' },
    ],
  },
  {
    category: 'tenant',
    label: 'sidebar.paletteData.cat.tenant',
    items: [
      { type: 'tenantCompanyName',           labelKey: 'sidebar.paletteData.item.companyName', icon: <Building2 className="w-4 h-4" />, createElement: createTenantCompanyNameElement, descriptionKey: 'sidebar.paletteData.desc.companyName' },
      { type: 'tenantAddress',             labelKey: 'sidebar.paletteData.item.address', icon: <MapPin className="w-4 h-4" />,    createElement: createTenantAddressElement,     descriptionKey: 'sidebar.paletteData.desc.address' },
      { type: 'tenantPhone',         labelKey: 'sidebar.paletteData.item.phone', icon: <Phone className="w-4 h-4" />,     createElement: createTenantPhoneElement,       descriptionKey: 'sidebar.paletteData.desc.phone' },
      { type: 'tenantRepresentative',         labelKey: 'sidebar.paletteData.item.representative', icon: <User className="w-4 h-4" />,      createElement: createTenantRepresentativeElement, descriptionKey: 'sidebar.paletteData.desc.representative' },
      { type: 'tenantLogo',             labelKey: 'sidebar.paletteData.item.logo', icon: <Image className="w-4 h-4" />,     createElement: createTenantLogoElement,        descriptionKey: 'sidebar.paletteData.desc.logo' },
      { type: 'tenantCustom', labelKey: 'sidebar.paletteData.item.custom', icon: <Tag className="w-4 h-4" />,    createElement: createTenantCustomElement,      descriptionKey: 'sidebar.paletteData.desc.custom' },
    ],
  },
]

/** Lookup map: palette item type (stable ASCII id) → createElement factory. Used by ReportCanvas for drag-and-drop (#411). */
export const PALETTE_ITEM_MAP: Record<string, () => ReportElement> = Object.fromEntries(
  PALETTE_CATEGORIES.flatMap((cat) => cat.items.map((item) => [item.type, item.createElement])),
)

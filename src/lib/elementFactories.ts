import { v4 as uuidv4 } from 'uuid'
import type { ReportElement, RepeatingBandField, RepeatingListField, FormTableColumn, FormTableRow, CheckmarkStyle, EraSelectElement, PageNumberElement, CurrentDateElement, DividerElement } from '@/types'
import { DEFAULT_ERAS } from '@/elements/eraSelect/constants'

/**
 * Factory functions for creating new elements with sensible defaults.
 * All position and size values are in mm.
 * Used by ElementPalette and available for programmatic/agent use.
 */

export function createTextElement(overrides?: Partial<ReportElement>): ReportElement {
  return {
    id: uuidv4(),
    type: 'text',
    position: { x: 13, y: 13 },
    size: { width: 53, height: 10 },
    zIndex: 1,
    visible: true,
    locked: false,
    content: 'テキスト',
    style: { fontSize: 3.5, fontWeight: 'normal', color: '#000000', textAlign: 'left' },
    ...overrides,
  } as ReportElement
}

export function createLabelElement(overrides?: Partial<ReportElement>): ReportElement {
  return {
    id: uuidv4(),
    type: 'label',
    position: { x: 13, y: 13 },
    size: { width: 40, height: 6 },
    zIndex: 1,
    visible: true,
    locked: false,
    text: 'ラベル',
    style: { fontSize: 3.5, fontWeight: 'normal', color: '#000000', textAlign: 'left' },
    ...overrides,
  } as ReportElement
}

export function createImageElement(overrides?: Partial<ReportElement>): ReportElement {
  return {
    id: uuidv4(),
    type: 'image',
    position: { x: 13, y: 13 },
    size: { width: 40, height: 26 },
    zIndex: 1,
    visible: true,
    locked: false,
    src: '',
    alt: '',
    objectFit: 'contain' as const,
    opacity: 1,
    ...overrides,
  } as ReportElement
}

export function createShapeElement(overrides?: Partial<ReportElement>): ReportElement {
  return {
    id: uuidv4(),
    type: 'shape',
    position: { x: 13, y: 13 },
    size: { width: 26, height: 16 },
    zIndex: 1,
    visible: true,
    locked: false,
    shape: 'rectangle' as const,
    fill: 'transparent',
    stroke: '#000000',
    strokeWidth: 0.3,
    strokeDash: 'solid',
    ...overrides,
  } as ReportElement
}

export function createTableElement(overrides?: Partial<ReportElement>): ReportElement {
  return {
    id: uuidv4(),
    type: 'table',
    position: { x: 13, y: 13 },
    size: { width: 80, height: 40 },
    zIndex: 1,
    visible: true,
    locked: false,
    rows: 3,
    columns: 3,
    data: [
      ['ヘッダー1', 'ヘッダー2', 'ヘッダー3'],
      ['データ1', 'データ2', 'データ3'],
      ['データ4', 'データ5', 'データ6'],
    ],
    headerRow: true,
    ...overrides,
  } as ReportElement
}

export function createChartElement(overrides?: Partial<ReportElement>): ReportElement {
  return {
    id: uuidv4(),
    type: 'chart',
    position: { x: 13, y: 13 },
    size: { width: 80, height: 53 },
    zIndex: 1,
    visible: true,
    locked: false,
    chartType: 'bar' as const,
    title: 'グラフ',
    ...overrides,
  } as ReportElement
}

export function createDataFieldElement(overrides?: Partial<ReportElement>): ReportElement {
  return {
    id: uuidv4(),
    type: 'dataField',
    position: { x: 13, y: 13 },
    size: { width: 40, height: 8 },
    zIndex: 1,
    visible: true,
    locked: false,
    fieldKey: 'field.key',
    label: 'フィールド',
    style: { fontSize: 3.5, fontWeight: 'normal', color: '#000000', textAlign: 'left' },
    fallbackText: '',
    ...overrides,
  } as ReportElement
}

export function createManualEntryField(overrides?: Partial<ReportElement>): ReportElement {
  return {
    id: uuidv4(),
    type: 'manualEntry',
    position: { x: 13, y: 13 },
    size: { width: 60, height: 8 },
    zIndex: 1,
    visible: true,
    locked: false,
    label: '記入欄',
    labelPosition: 'top' as const,
    displayMode: 'line' as const,
    lineColor: '#000000',
    placeholder: '（記入）',
    style: { fontSize: 3.5, color: '#000000' },
    ...overrides,
  } as ReportElement
}

export function createHankoElement(overrides?: Partial<ReportElement>): ReportElement {
  return {
    id: uuidv4(),
    type: 'hanko',
    position: { x: 13, y: 13 },
    size: { width: 20, height: 20 },
    zIndex: 1,
    visible: true,
    locked: false,
    text: '印',
    shape: 'circle' as const,
    borderColor: '#cc0000',
    textColor: '#cc0000',
    fontSize: 4,
    writingMode: 'vertical-rl' as const,
    doubleBorder: true,
    ...overrides,
  } as ReportElement
}

export function createBarcodeElement(overrides?: Partial<ReportElement>): ReportElement {
  return {
    id: uuidv4(),
    type: 'barcode',
    position: { x: 13, y: 13 },
    size: { width: 30, height: 30 },
    zIndex: 1,
    visible: true,
    locked: false,
    kind: 'qr' as const,
    value: 'https://example.com',
    errorCorrection: 'M' as const,
    darkColor: '#000000',
    lightColor: '#ffffff',
    showText: false,
    ...overrides,
  } as ReportElement
}

export function createBarcodeCode128Element(overrides?: Partial<ReportElement>): ReportElement {
  return {
    id: uuidv4(),
    type: 'barcode',
    position: { x: 13, y: 13 },
    size: { width: 60, height: 15 },
    zIndex: 1,
    visible: true,
    locked: false,
    kind: 'code128' as const,
    value: '0000000000',
    darkColor: '#000000',
    lightColor: '#ffffff',
    showText: true,
    ...overrides,
  } as ReportElement
}

export function createApprovalStampRowElement(overrides?: Partial<ReportElement>): ReportElement {
  return {
    id: uuidv4(),
    type: 'approvalStampRow',
    position: { x: 13, y: 13 },
    size: { width: 75, height: 20 },
    zIndex: 1,
    visible: true,
    locked: false,
    cells: [
      { role: '担当', width: 15 },
      { role: '係長', width: 15 },
      { role: '課長', width: 15 },
      { role: '部長', width: 15 },
      { role: '社長', width: 15 },
    ],
    labelPosition: 'bottom' as const,
    borderColor: '#000000',
    borderWidth: 0.3,
    cellHeight: 15,
    ...overrides,
  } as ReportElement
}

export function createRevenueStampElement(overrides?: Partial<ReportElement>): ReportElement {
  return {
    id: uuidv4(),
    type: 'revenueStamp',
    position: { x: 13, y: 13 },
    size: { width: 40, height: 25 },
    zIndex: 1,
    visible: true,
    locked: false,
    borderColor: '#000000',
    borderWidth: 0.3,
    showLabel: true,
    showCancellationGuide: true,
    ...overrides,
  } as ReportElement
}

const DEFAULT_BAND_FIELDS: RepeatingBandField[] = [
  { key: 'no',          label: 'No.',        width: 12, align: 'center' },
  { key: 'name',        label: '品目',        width: 55, align: 'left' },
  { key: 'quantity',    label: '数量',        width: 18, align: 'right' },
  { key: 'unit',        label: '単位',        width: 14, align: 'center' },
  { key: 'unitPrice',   label: '単価',        width: 22, align: 'right', format: { type: 'comma' } },
  { key: 'amount',      label: '金額',        width: 25, align: 'right', format: { type: 'comma' } },
]

export function createRepeatingBandElement(overrides?: Partial<ReportElement>): ReportElement {
  return {
    id: uuidv4(),
    type: 'repeatingBand',
    position: { x: 13, y: 13 },
    size: { width: 175, height: 60 },
    zIndex: 1,
    visible: true,
    locked: false,
    dataSource: 'items',
    itemHeight: 8,
    fields: DEFAULT_BAND_FIELDS,
    showHeader: true,
    showFooter: true,
    totals: [
      { fieldKey: 'amount', formula: 'sum', label: '合計' },
    ],
    pageBreak: 'none',
    maxItems: 0,
    oddRowColor: '#ffffff',
    evenRowColor: '#f9fafb',
    borderColor: '#000000',
    borderWidth: 0.3,
    sortOrder: 'asc',
    showEmptyRowLines: false,
    showGroupSubtotals: false,
    style: { fontSize: 3.5, color: '#000000' },
    headerStyle: { fontSize: 3.5, fontWeight: 'bold', color: '#374151', backgroundColor: '#f3f4f6' },
    ...overrides,
  } as ReportElement
}

const DEFAULT_LIST_FIELDS: RepeatingListField[] = [
  { key: 'name',  label: '名前',  x: 2, y: 2,  width: 36, height: 5, style: { fontSize: 4, fontWeight: 'bold' } },
  { key: 'title', label: '役職',  x: 2, y: 8,  width: 36, height: 4, style: { fontSize: 3, color: '#6b7280' } },
  { key: 'dept',  label: '部署',  x: 2, y: 13, width: 36, height: 4, style: { fontSize: 3, color: '#6b7280' } },
]

const DEFAULT_FORM_TABLE_COLUMNS: FormTableColumn[] = [
  { id: 'col-default-1', width: 40, align: 'left' },
  { id: 'col-default-2', width: 40, align: 'left' },
  { id: 'col-default-3', width: 40, align: 'left' },
]

const DEFAULT_FORM_TABLE_ROWS: FormTableRow[] = [
  {
    id: 'row-default-header',
    role: 'header',
    height: 8,
    cells: [
      { id: 'cell-h1', type: 'label', text: '項目 1' },
      { id: 'cell-h2', type: 'label', text: '項目 2' },
      { id: 'cell-h3', type: 'label', text: '項目 3' },
    ],
  },
  {
    id: 'row-default-body',
    role: 'body',
    height: 8,
    cells: [
      { id: 'cell-b1', type: 'input', placeholder: '' },
      { id: 'cell-b2', type: 'input', placeholder: '' },
      { id: 'cell-b3', type: 'input', placeholder: '' },
    ],
  },
]

export function createFormTableElement(overrides?: Partial<ReportElement>): ReportElement {
  return {
    id: uuidv4(),
    type: 'formTable',
    position: { x: 13, y: 13 },
    size: { width: 120, height: 24 },
    zIndex: 1,
    locked: false,
    visible: true,
    columns: DEFAULT_FORM_TABLE_COLUMNS.map(c => ({ ...c, id: uuidv4() })),
    rows: DEFAULT_FORM_TABLE_ROWS.map(r => ({
      ...r,
      id: uuidv4(),
      cells: r.cells.map(c => ({ ...c, id: uuidv4() })),
    })),
    borderColor: '#000000',
    borderWidth: 0.3,
    ...overrides,
  } as ReportElement
}

export function createRepeatingListElement(overrides?: Partial<ReportElement>): ReportElement {
  return {
    id: uuidv4(),
    type: 'repeatingList',
    position: { x: 13, y: 13 },
    size: { width: 175, height: 60 },
    zIndex: 1,
    visible: true,
    locked: false,
    dataSource: 'items',
    layout: 'grid',
    gridColumns: 3,
    itemWidth: 55,
    itemHeight: 20,
    gap: 2,
    fields: DEFAULT_LIST_FIELDS,
    maxItems: 0,
    borderColor: '#d1d5db',
    borderWidth: 0.3,
    itemBackground: '#ffffff',
    borderRadius: 1,
    pageBreak: 'none',
    ...overrides,
  } as ReportElement
}

export function createCheckboxElement(overrides?: Partial<ReportElement>): ReportElement {
  return {
    id: uuidv4(),
    type: 'checkbox',
    position: { x: 13, y: 13 },
    size: { width: 5, height: 5 },
    zIndex: 1,
    visible: true,
    locked: false,
    checked: false,
    checkmark: '✓' as CheckmarkStyle,
    label: '',
    ...overrides,
  } as ReportElement
}

export function createEraSelectElement(overrides?: Partial<EraSelectElement>): ReportElement {
  return {
    id: uuidv4(),
    type: 'eraSelect',
    position: { x: 13, y: 13 },
    size: { width: 7, height: 12 },
    zIndex: 1,
    visible: true,
    locked: false,
    layout: 'column',
    eras: [...DEFAULT_ERAS],
    ...overrides,
  } as ReportElement
}

export function createPageNumberElement(overrides?: Partial<PageNumberElement>): ReportElement {
  return {
    id: uuidv4(),
    type: 'pageNumber',
    position: { x: 13, y: 13 },
    size: { width: 30, height: 6 },
    zIndex: 1,
    visible: true,
    locked: false,
    format: '{{page}} / {{pages}}',
    style: { fontSize: 3, color: '#666666', textAlign: 'center' },
    ...overrides,
  } as ReportElement
}

export function createCurrentDateElement(overrides?: Partial<CurrentDateElement>): ReportElement {
  return {
    id: uuidv4(),
    type: 'currentDate',
    position: { x: 13, y: 13 },
    size: { width: 40, height: 6 },
    zIndex: 1,
    visible: true,
    locked: false,
    format: 'yyyy年MM月dd日',
    style: { fontSize: 3, color: '#000000', textAlign: 'left' },
    ...overrides,
  } as ReportElement
}

export function createDividerElement(overrides?: Partial<DividerElement>): ReportElement {
  return {
    id: uuidv4(),
    type: 'divider',
    position: { x: 13, y: 13 },
    size: { width: 170, height: 0.5 },
    zIndex: 1,
    visible: true,
    locked: false,
    direction: 'horizontal',
    color: '#000000',
    thickness: 0.3,
    dashStyle: 'solid',
    ...overrides,
  } as ReportElement
}

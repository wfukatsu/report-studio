import { v4 as uuidv4 } from 'uuid'
import i18n from '@/i18n/config'
import type { ReportElement, RepeatingBandField, RepeatingListField, FormTableColumn, FormTableRow, CheckmarkStyle, EraSelectElement, PageNumberElement, CurrentDateElement, DividerElement, TenantCompanyNameElement, TenantAddressElement, TenantPhoneElement, TenantRepresentativeElement, TenantLogoElement, TenantCustomElement } from '@/types'
import { DEFAULT_ERAS } from '@/lib/eras'

/**
 * Factory functions for creating new elements with sensible defaults.
 * All position and size values are in mm.
 * Used by ElementPalette and available for programmatic/agent use.
 *
 * #411: default names/labels persisted into the template (content, labels,
 * approval roles, band columns, …) are resolved with `i18n.t()` at creation
 * time, so they follow the UI language active when the element is created.
 * Already-saved templates are never rewritten.
 */
const tf = () => i18n.getFixedT(null, 'elements')

export function createTextElement(overrides?: Partial<ReportElement>): ReportElement {
  return {
    id: uuidv4(),
    type: 'text',
    position: { x: 13, y: 13 },
    size: { width: 53, height: 10 },
    zIndex: 1,
    visible: true,
    locked: false,
    content: tf()('factories.textContent'),
    style: { fontSize: 10, fontWeight: 'normal', color: '#000000', textAlign: 'left' },
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
    title: tf()('factories.chartTitle'),
    xAxisKey: 'name',
    yAxisKeys: ['value'],
    showLegend: true,
    showGrid: true,
    ...overrides,
  } as ReportElement
}

// Monotonic per-session counter so successive "データフィールド" adds get distinct
// default keys (field.value1, field.value2, …) instead of all sharing field.key,
// which silently bound every field to the same data (#176). Both segments satisfy
// the 2-level key grammar ^[a-zA-Z_][a-zA-Z0-9_]*$.
let dataFieldKeySeq = 0

export function createDataFieldElement(overrides?: Partial<ReportElement>): ReportElement {
  dataFieldKeySeq += 1
  return {
    id: uuidv4(),
    type: 'dataField',
    position: { x: 13, y: 13 },
    size: { width: 40, height: 8 },
    zIndex: 1,
    visible: true,
    locked: false,
    fieldKey: `field.value${dataFieldKeySeq}`,
    label: tf()('factories.dataFieldLabel'),
    style: { fontSize: 10, fontWeight: 'normal', color: '#000000', textAlign: 'left' },
    fallbackText: '',
    ...overrides,
  } as ReportElement
}

/**
 * Create a dataField element pre-bound to a schema field.
 * Used when dragging a schema field from the palette/schema tab onto the canvas.
 */
export function createDataFieldFromSchema(field: {
  fieldId: string
  fieldKey: string
  fieldLabel: string
}): ReportElement {
  return createDataFieldElement({
    fieldKey: field.fieldKey,
    name: field.fieldLabel,
    label: field.fieldLabel,
    schemaBinding: { fieldId: field.fieldId },
  })
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
    label: tf()('factories.manualEntryLabel'),
    labelPosition: 'top' as const,
    displayMode: 'line' as const,
    lineColor: '#000000',
    placeholder: tf()('factories.manualEntryPlaceholder'),
    style: { fontSize: 10, color: '#000000' },
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
    text: tf()('factories.hankoText'),
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
      { role: tf()('factories.approvalRoleStaff'), width: 15 },
      { role: tf()('factories.approvalRoleChief'), width: 15 },
      { role: tf()('factories.approvalRoleManager'), width: 15 },
      { role: tf()('factories.approvalRoleDirector'), width: 15 },
      { role: tf()('factories.approvalRolePresident'), width: 15 },
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

const defaultBandFields = (): RepeatingBandField[] => [
  { key: 'no',          label: 'No.',                              width: 12, align: 'center' },
  { key: 'name',        label: tf()('factories.bandColItem'),      width: 55, align: 'left' },
  { key: 'quantity',    label: tf()('factories.bandColQuantity'),  width: 18, align: 'right' },
  { key: 'unit',        label: tf()('factories.bandColUnit'),      width: 14, align: 'center' },
  { key: 'unitPrice',   label: tf()('factories.bandColUnitPrice'), width: 22, align: 'right', format: { type: 'comma' } },
  { key: 'amount',      label: tf()('factories.bandColAmount'),    width: 25, align: 'right', format: { type: 'comma' } },
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
    dataSource: '',
    itemHeight: 8,
    fields: [],
    showHeader: true,
    showFooter: false,
    totals: [],
    pageBreak: 'none',
    maxItems: 0,
    oddRowColor: '#ffffff',
    evenRowColor: '#f9fafb',
    borderColor: '#000000',
    borderWidth: 0.3,
    sortOrder: 'asc',
    showEmptyRowLines: false,
    showGroupSubtotals: false,
    style: { fontSize: 10, color: '#000000' },
    headerStyle: { fontSize: 10, fontWeight: 'bold', color: '#374151', backgroundColor: '#f3f4f6' },
    ...overrides,
  } as ReportElement
}

/** Pre-configured repeating band with default invoice columns (used by templates) */
export function createRepeatingBandWithDefaults(overrides?: Partial<ReportElement>): ReportElement {
  return createRepeatingBandElement({
    dataSource: 'items',
    fields: defaultBandFields(),
    showFooter: true,
    totals: [{ fieldKey: 'amount', formula: 'sum', label: tf()('factories.bandTotalLabel') }],
    ...overrides,
  } as Partial<ReportElement>)
}

const defaultListFields = (): RepeatingListField[] => [
  { key: 'name',  label: tf()('factories.listFieldName'),  x: 2, y: 2,  width: 36, height: 5, style: { fontSize: 11, fontWeight: 'bold' } },
  { key: 'title', label: tf()('factories.listFieldTitle'), x: 2, y: 8,  width: 36, height: 4, style: { fontSize: 8.5, color: '#6b7280' } },
  { key: 'dept',  label: tf()('factories.listFieldDept'),  x: 2, y: 13, width: 36, height: 4, style: { fontSize: 8.5, color: '#6b7280' } },
]

const DEFAULT_FORM_TABLE_COLUMNS: FormTableColumn[] = [
  { id: 'col-default-1', width: 40, align: 'left' },
  { id: 'col-default-2', width: 40, align: 'left' },
  { id: 'col-default-3', width: 40, align: 'left' },
]

const defaultFormTableRows = (): FormTableRow[] => [
  {
    id: 'row-default-header',
    role: 'header',
    height: 8,
    cells: [
      { id: 'cell-h1', type: 'label', text: tf()('factories.formTableHeaderCell', { n: 1 }) },
      { id: 'cell-h2', type: 'label', text: tf()('factories.formTableHeaderCell', { n: 2 }) },
      { id: 'cell-h3', type: 'label', text: tf()('factories.formTableHeaderCell', { n: 3 }) },
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
    rows: defaultFormTableRows().map(r => ({
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
    fields: defaultListFields(),
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
    style: { fontSize: 8.5, color: '#666666', textAlign: 'center' },
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
    format: tf()('factories.currentDateFormat'),
    style: { fontSize: 8.5, color: '#000000', textAlign: 'left' },
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

// ---------------------------------------------------------------------------
// Tenant elements
// ---------------------------------------------------------------------------

export function createTenantCompanyNameElement(overrides?: Partial<TenantCompanyNameElement>): ReportElement {
  return {
    id: uuidv4(), type: 'tenantCompanyName',
    position: { x: 13, y: 13 }, size: { width: 60, height: 8 },
    zIndex: 1, visible: true, locked: false,
    style: { fontSize: 14, color: '#000000', textAlign: 'left', fontWeight: 'bold' },
    ...overrides,
  } as ReportElement
}

export function createTenantAddressElement(overrides?: Partial<TenantAddressElement>): ReportElement {
  const mode = overrides?.displayMode ?? 'single'
  return {
    id: uuidv4(), type: 'tenantAddress',
    position: { x: 13, y: 13 }, size: { width: 80, height: mode === 'multiLine' ? 15 : 6 },
    zIndex: 1, visible: true, locked: false,
    style: { fontSize: 10, color: '#000000', textAlign: 'left' },
    displayMode: 'single',
    ...overrides,
  } as ReportElement
}

export function createTenantPhoneElement(overrides?: Partial<TenantPhoneElement>): ReportElement {
  return {
    id: uuidv4(), type: 'tenantPhone',
    position: { x: 13, y: 13 }, size: { width: 50, height: 6 },
    zIndex: 1, visible: true, locked: false,
    style: { fontSize: 10, color: '#000000', textAlign: 'left' },
    ...overrides,
  } as ReportElement
}

export function createTenantRepresentativeElement(overrides?: Partial<TenantRepresentativeElement>): ReportElement {
  return {
    id: uuidv4(), type: 'tenantRepresentative',
    position: { x: 13, y: 13 }, size: { width: 50, height: 6 },
    zIndex: 1, visible: true, locked: false,
    style: { fontSize: 10, color: '#000000', textAlign: 'left' },
    ...overrides,
  } as ReportElement
}

export function createTenantLogoElement(overrides?: Partial<TenantLogoElement>): ReportElement {
  return {
    id: uuidv4(), type: 'tenantLogo',
    position: { x: 13, y: 13 }, size: { width: 30, height: 20 },
    zIndex: 1, visible: true, locked: false,
    objectFit: 'contain', opacity: 1,
    ...overrides,
  } as ReportElement
}

export function createTenantCustomElement(overrides?: Partial<TenantCustomElement>): ReportElement {
  return {
    id: uuidv4(), type: 'tenantCustom',
    position: { x: 13, y: 13 }, size: { width: 50, height: 6 },
    zIndex: 1, visible: true, locked: false,
    fieldKey: '',
    style: { fontSize: 10, color: '#000000', textAlign: 'left' },
    ...overrides,
  } as ReportElement
}

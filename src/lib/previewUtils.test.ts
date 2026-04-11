import { describe, it, expect } from 'vitest'
import { isDataEmptyInPreview } from './previewUtils'
import type { ReportElement } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDataField(fieldKey: string): ReportElement {
  return {
    id: 'el-1',
    type: 'dataField',
    position: { x: 0, y: 0 },
    size: { width: 40, height: 10 },
    zIndex: 1,
    visible: true,
    locked: false,
    fieldKey,
    style: {},
  } as unknown as ReportElement
}

function makeText(content: string): ReportElement {
  return {
    id: 'el-2',
    type: 'text',
    position: { x: 0, y: 0 },
    size: { width: 80, height: 10 },
    zIndex: 1,
    visible: true,
    locked: false,
    content,
    style: {},
  } as unknown as ReportElement
}

function makeRepeatingBand(dataSource: string | undefined): ReportElement {
  return {
    id: 'el-3',
    type: 'repeatingBand',
    position: { x: 0, y: 0 },
    size: { width: 100, height: 30 },
    zIndex: 1,
    visible: true,
    locked: false,
    dataSource: dataSource ?? '',
    fields: [],
    showHeader: true,
    showFooter: false,
    totals: [],
    itemHeight: 6,
    oddRowColor: '#ffffff',
    evenRowColor: '#f9f9f9',
    borderColor: '#000000',
    borderWidth: 0.3,
    maxItems: 0,
    pageBreak: 'none',
  } as unknown as ReportElement
}

function makeChart(dataBinding: string | undefined): ReportElement {
  return {
    id: 'el-4',
    type: 'chart',
    position: { x: 0, y: 0 },
    size: { width: 60, height: 40 },
    zIndex: 1,
    visible: true,
    locked: false,
    chartType: 'bar',
    dataBinding,
  } as unknown as ReportElement
}

function makeShape(): ReportElement {
  return {
    id: 'el-5',
    type: 'shape',
    position: { x: 0, y: 0 },
    size: { width: 20, height: 20 },
    zIndex: 1,
    visible: true,
    locked: false,
    shapeType: 'rect',
    fill: '#ff0000',
    stroke: '#000000',
    strokeWidth: 1,
    borderRadius: 0,
    opacity: 1,
  } as unknown as ReportElement
}

// ---------------------------------------------------------------------------
// dataField
// ---------------------------------------------------------------------------

describe('isDataEmptyInPreview — dataField', () => {
  it('returns true when field is not found in data (missing key)', () => {
    const el = makeDataField('customer_name')
    expect(isDataEmptyInPreview(el, {})).toBe(true)
  })

  it('returns true when field resolves to empty string', () => {
    const el = makeDataField('name')
    expect(isDataEmptyInPreview(el, { name: '' })).toBe(true)
  })

  it('returns true when field is null', () => {
    const el = makeDataField('name')
    expect(isDataEmptyInPreview(el, { name: null })).toBe(true)
  })

  it('returns true when field is undefined', () => {
    const el = makeDataField('name')
    expect(isDataEmptyInPreview(el, { name: undefined })).toBe(true)
  })

  it('returns false when field has a non-empty value', () => {
    const el = makeDataField('customer_name')
    expect(isDataEmptyInPreview(el, { customer_name: '田中太郎' })).toBe(false)
  })

  it('returns false when field resolves to a number (non-empty)', () => {
    const el = makeDataField('amount')
    expect(isDataEmptyInPreview(el, { amount: 1000 })).toBe(false)
  })

  it('returns false for nested field that resolves to a value', () => {
    const el = makeDataField('customer.name')
    expect(isDataEmptyInPreview(el, { customer: { name: '山田' } })).toBe(false)
  })

  it('returns true for nested field where parent is missing', () => {
    const el = makeDataField('customer.name')
    expect(isDataEmptyInPreview(el, {})).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// text
// ---------------------------------------------------------------------------

describe('isDataEmptyInPreview — text', () => {
  it('returns false for static text without {{}} tokens (always show)', () => {
    const el = makeText('固定テキスト')
    expect(isDataEmptyInPreview(el, {})).toBe(false)
  })

  it('returns false for empty static text (no data binding)', () => {
    const el = makeText('')
    expect(isDataEmptyInPreview(el, {})).toBe(false)
  })

  it('returns true when {{field}} resolves to empty and result is empty string', () => {
    const el = makeText('{{customer_name}}')
    expect(isDataEmptyInPreview(el, {})).toBe(true)
  })

  it('returns true when {{field}} resolves to empty string from data', () => {
    const el = makeText('{{name}}')
    expect(isDataEmptyInPreview(el, { name: '' })).toBe(true)
  })

  it('returns false when {{field}} resolves to non-empty value', () => {
    const el = makeText('{{customer_name}}')
    expect(isDataEmptyInPreview(el, { customer_name: '田中太郎' })).toBe(false)
  })

  it('returns false when partial template: static text remains even if field is empty', () => {
    // "注文者: " is still non-empty — caller decided to show it (brainstorm §Key Decisions #3)
    const el = makeText('注文者: {{name}}')
    expect(isDataEmptyInPreview(el, {})).toBe(false)
  })

  it('returns false when partial template with data: both static and field value present', () => {
    const el = makeText('注文者: {{name}}')
    expect(isDataEmptyInPreview(el, { name: '田中' })).toBe(false)
  })

  it('returns true when system variable {{$page}} remains unresolved (no pageContext)', () => {
    // TextRenderer calls interpolate(el.content, data) without pageContext,
    // so system variables remain as {{$page}} → detected as unresolved pattern
    const el = makeText('{{$page}}')
    expect(isDataEmptyInPreview(el, {})).toBe(true)
  })

  it('returns false when multiple fields and all have data', () => {
    const el = makeText('{{a}} / {{b}}')
    expect(isDataEmptyInPreview(el, { a: '1', b: '2' })).toBe(false)
  })

  it('returns false for "0" value (number zero should still show)', () => {
    const el = makeText('{{count}}')
    // resolveField returns String(0) = '0', which is non-empty
    expect(isDataEmptyInPreview(el, { count: 0 })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// repeatingBand
// ---------------------------------------------------------------------------

describe('isDataEmptyInPreview — repeatingBand', () => {
  it('returns true when data array has 0 items', () => {
    const el = makeRepeatingBand('items')
    expect(isDataEmptyInPreview(el, { items: [] })).toBe(true)
  })

  it('returns true when dataSource key is missing from data', () => {
    const el = makeRepeatingBand('items')
    expect(isDataEmptyInPreview(el, {})).toBe(true)
  })

  it('returns true when dataSource value is not an array', () => {
    const el = makeRepeatingBand('items')
    expect(isDataEmptyInPreview(el, { items: 'not-an-array' })).toBe(true)
  })

  it('returns true when dataSource value is null', () => {
    const el = makeRepeatingBand('items')
    expect(isDataEmptyInPreview(el, { items: null })).toBe(true)
  })

  it('returns false when data array has items', () => {
    const el = makeRepeatingBand('items')
    expect(isDataEmptyInPreview(el, { items: [{ id: 1 }] })).toBe(false)
  })

  it('returns false when dataSource is not set (empty string → no binding)', () => {
    const el = makeRepeatingBand(undefined)
    expect(isDataEmptyInPreview(el, {})).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// chart
// ---------------------------------------------------------------------------

describe('isDataEmptyInPreview — chart', () => {
  it('returns true when dataBinding array has 0 items', () => {
    const el = makeChart('chartData')
    expect(isDataEmptyInPreview(el, { chartData: [] })).toBe(true)
  })

  it('returns true when dataBinding key is missing from data', () => {
    const el = makeChart('chartData')
    expect(isDataEmptyInPreview(el, {})).toBe(true)
  })

  it('returns true when dataBinding value is not an array', () => {
    const el = makeChart('chartData')
    expect(isDataEmptyInPreview(el, { chartData: 'wrong' })).toBe(true)
  })

  it('returns false when dataBinding array has items', () => {
    const el = makeChart('chartData')
    expect(isDataEmptyInPreview(el, { chartData: [{ name: 'A', value: 1 }] })).toBe(false)
  })

  it('returns false when dataBinding is undefined (no binding = use sample data)', () => {
    const el = makeChart(undefined)
    expect(isDataEmptyInPreview(el, {})).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// static / default elements — always return false
// ---------------------------------------------------------------------------

describe('isDataEmptyInPreview — static elements', () => {
  it('returns false for shape elements', () => {
    const el = makeShape()
    expect(isDataEmptyInPreview(el, {})).toBe(false)
  })

  it('returns false for pageNumber element', () => {
    const el = {
      id: 'el-6', type: 'pageNumber', position: { x: 0, y: 0 },
      size: { width: 20, height: 5 }, zIndex: 1, visible: true, locked: false,
      format: 'page', prefix: '', suffix: '',
    } as unknown as ReportElement
    expect(isDataEmptyInPreview(el, {})).toBe(false)
  })

  it('returns false for divider element', () => {
    const el = {
      id: 'el-7', type: 'divider', position: { x: 0, y: 0 },
      size: { width: 100, height: 2 }, zIndex: 1, visible: true, locked: false,
      color: '#000', strokeWidth: 1, style: 'solid',
    } as unknown as ReportElement
    expect(isDataEmptyInPreview(el, {})).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import {
  createTextElement,
  createImageElement,
  createShapeElement,
  createChartElement,
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
} from './elementFactories'

describe('共通: 各ファクトリはユニーク id を生成する', () => {
  it('createTextElement', () => {
    expect(createTextElement().id).not.toBe(createTextElement().id)
  })
})

describe('createTextElement', () => {
  it('type が text', () => expect(createTextElement().type).toBe('text'))
  it('デフォルトコンテンツが設定されている', () => expect((createTextElement() as { content: string }).content).toBe('テキスト'))
  it('overrides が適用される', () => {
    const el = createTextElement({ id: 'custom-id' })
    expect(el.id).toBe('custom-id')
  })
})

describe('createImageElement', () => {
  it('type が image', () => expect(createImageElement().type).toBe('image'))
  it('objectFit が contain', () => expect((createImageElement() as { objectFit: string }).objectFit).toBe('contain'))
  it('opacity が 1', () => expect((createImageElement() as { opacity: number }).opacity).toBe(1))
})

describe('createShapeElement', () => {
  it('type が shape', () => expect(createShapeElement().type).toBe('shape'))
  it('デフォルト shape が rectangle', () => expect((createShapeElement() as { shape: string }).shape).toBe('rectangle'))
})

describe('createChartElement', () => {
  it('type が chart', () => expect(createChartElement().type).toBe('chart'))
  it('chartType が bar', () => expect((createChartElement() as { chartType: string }).chartType).toBe('bar'))
})

describe('createDataFieldElement', () => {
  it('type が dataField', () => expect(createDataFieldElement().type).toBe('dataField'))
  it('fieldKey が設定されている', () => expect((createDataFieldElement() as { fieldKey: string }).fieldKey).toBe('field.key'))
})

describe('createManualEntryField', () => {
  it('type が manualEntry', () => expect(createManualEntryField().type).toBe('manualEntry'))
  it('displayMode が line', () => expect((createManualEntryField() as { displayMode: string }).displayMode).toBe('line'))
})

describe('createHankoElement', () => {
  it('type が hanko', () => expect(createHankoElement().type).toBe('hanko'))
  it('shape が circle', () => expect((createHankoElement() as { shape: string }).shape).toBe('circle'))
  it('doubleBorder が true', () => expect((createHankoElement() as { doubleBorder: boolean }).doubleBorder).toBe(true))
})

describe('createBarcodeElement (QR)', () => {
  it('type が barcode', () => expect(createBarcodeElement().type).toBe('barcode'))
  it('kind が qr', () => expect((createBarcodeElement() as { kind: string }).kind).toBe('qr'))
  it('showText が false', () => expect((createBarcodeElement() as { showText: boolean }).showText).toBe(false))
})

describe('createBarcodeCode128Element', () => {
  it('type が barcode', () => expect(createBarcodeCode128Element().type).toBe('barcode'))
  it('kind が code128', () => expect((createBarcodeCode128Element() as { kind: string }).kind).toBe('code128'))
  it('showText が true', () => expect((createBarcodeCode128Element() as { showText: boolean }).showText).toBe(true))
})

describe('createApprovalStampRowElement', () => {
  it('type が approvalStampRow', () => expect(createApprovalStampRowElement().type).toBe('approvalStampRow'))
  it('5つのセルが存在する', () => {
    const el = createApprovalStampRowElement() as { cells: unknown[] }
    expect(el.cells).toHaveLength(5)
  })
})

describe('createRevenueStampElement', () => {
  it('type が revenueStamp', () => expect(createRevenueStampElement().type).toBe('revenueStamp'))
  it('showLabel が true', () => expect((createRevenueStampElement() as { showLabel: boolean }).showLabel).toBe(true))
})

describe('createRepeatingBandElement', () => {
  it('type が repeatingBand', () => expect(createRepeatingBandElement().type).toBe('repeatingBand'))
  it('dataSource が空文字列（未設定）', () => expect((createRepeatingBandElement() as { dataSource: string }).dataSource).toBe(''))
  it('フィールドが空（ユーザーが追加する）', () => {
    const el = createRepeatingBandElement() as { fields: unknown[] }
    expect(el.fields).toHaveLength(0)
  })
})

describe('createRepeatingListElement', () => {
  it('type が repeatingList', () => expect(createRepeatingListElement().type).toBe('repeatingList'))
  it('layout が grid', () => expect((createRepeatingListElement() as { layout: string }).layout).toBe('grid'))
  it('3フィールドが存在する', () => {
    const el = createRepeatingListElement() as { fields: unknown[] }
    expect(el.fields).toHaveLength(3)
  })
})

describe('createFormTableElement', () => {
  it('type が formTable', () => expect(createFormTableElement().type).toBe('formTable'))
  it('デフォルト 3列 × 2行（header + body）を返す', () => {
    const el = createFormTableElement() as { columns: unknown[]; rows: { role: string }[] }
    expect(el.columns).toHaveLength(3)
    expect(el.rows).toHaveLength(2)
    expect(el.rows[0].role).toBe('header')
    expect(el.rows[1].role).toBe('body')
  })
  it('overrides が適用される', () => {
    const el = createFormTableElement({ borderColor: '#ff0000' }) as { borderColor: string }
    expect(el.borderColor).toBe('#ff0000')
  })
  it('呼び出しごとに UUID が異なる', () => {
    const a = createFormTableElement()
    const b = createFormTableElement()
    expect(a.id).not.toBe(b.id)
  })
})

describe('createCheckboxElement', () => {
  it('type が checkbox', () => expect(createCheckboxElement().type).toBe('checkbox'))
  it('デフォルト checked が false', () => expect((createCheckboxElement() as { checked: boolean }).checked).toBe(false))
  it('デフォルト checkmark が ✓', () => expect((createCheckboxElement() as { checkmark: string }).checkmark).toBe('✓'))
  it('デフォルト label が空文字', () => expect((createCheckboxElement() as { label: string }).label).toBe(''))
  it('デフォルトサイズが 5×5 mm', () => {
    const el = createCheckboxElement()
    expect(el.size.width).toBe(5)
    expect(el.size.height).toBe(5)
  })
  it('overrides が適用される', () => {
    const el = createCheckboxElement({ id: 'cb-1' })
    expect(el.id).toBe('cb-1')
  })
  it('呼び出しごとに UUID が異なる', () => {
    expect(createCheckboxElement().id).not.toBe(createCheckboxElement().id)
  })
})

describe('createEraSelectElement', () => {
  it('type が eraSelect', () => expect(createEraSelectElement().type).toBe('eraSelect'))
  it('デフォルトサイズが 7×12 mm', () => {
    const el = createEraSelectElement()
    expect(el.size.width).toBe(7)
    expect(el.size.height).toBe(12)
  })
  it('dataSource が未設定', () => {
    const el = createEraSelectElement() as { dataSource?: string }
    expect(el.dataSource).toBeUndefined()
  })
  it('overrides が適用される', () => {
    const el = createEraSelectElement({ dataSource: 'employee.era' }) as { dataSource?: string }
    expect(el.dataSource).toBe('employee.era')
  })
  it('呼び出しごとに UUID が異なる', () => {
    expect(createEraSelectElement().id).not.toBe(createEraSelectElement().id)
  })
})

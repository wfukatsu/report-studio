import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RepeatingBandRenderer } from './Renderer'
import { createRepeatingBandWithDefaults } from '@/lib/elementFactories'
import type { RepeatingBandElement } from '@/types'

function makeElement(overrides: Partial<RepeatingBandElement> = {}): RepeatingBandElement {
  return createRepeatingBandWithDefaults(overrides) as RepeatingBandElement
}

describe('RepeatingBandRenderer — デザインプレビュー (records=undefined)', () => {
  it('renders design preview without error', () => {
    const { container } = render(<RepeatingBandRenderer element={makeElement()} />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('shows data source badge', () => {
    render(<RepeatingBandRenderer element={makeElement({ dataSource: 'items' })} />)
    expect(screen.getByText(/繰り返しバンド/)).toBeInTheDocument()
    expect(screen.getByText(/items/)).toBeInTheDocument()
  })

  it('shows column headers when showHeader is true', () => {
    const el = makeElement({
      showHeader: true,
      fields: [
        { key: 'no', label: 'No.', width: 12, align: 'center' },
        { key: 'name', label: '品目', width: 55, align: 'left' },
      ],
    })
    render(<RepeatingBandRenderer element={el} />)
    expect(screen.getByText('No.')).toBeInTheDocument()
  })

  it('shows max items text when maxItems > 0', () => {
    render(<RepeatingBandRenderer element={makeElement({ maxItems: 10 })} />)
    expect(screen.getByText(/最大 10 件/)).toBeInTheDocument()
  })

  it('shows unlimited records text when maxItems is 0', () => {
    render(<RepeatingBandRenderer element={makeElement({ maxItems: 0 })} />)
    expect(screen.getByText(/レコード数分 繰り返し/)).toBeInTheDocument()
  })
})

describe('RepeatingBandRenderer — ライブレンダラー (records provided)', () => {
  it('renders live records without error', () => {
    const records = [
      { no: '1', name: '商品A', quantity: 2, unit: '個', unitPrice: 100, amount: 200 },
      { no: '2', name: '商品B', quantity: 1, unit: '個', unitPrice: 500, amount: 500 },
    ]
    const { container } = render(
      <RepeatingBandRenderer element={makeElement()} records={records} />,
    )
    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders empty records array without error', () => {
    const { container } = render(
      <RepeatingBandRenderer element={makeElement()} records={[]} />,
    )
    expect(container.firstChild).toBeInTheDocument()
  })
})

describe('RepeatingBandRenderer — showEmptyRowLines', () => {
  it('renders empty row dividers when showEmptyRowLines=true and data is empty', () => {
    const el = makeElement({ maxItems: 5, showEmptyRowLines: true, showHeader: false, showFooter: false })
    const { container } = render(<RepeatingBandRenderer element={el} records={[]} />)
    // Should render 5 empty row slots (dividers between them)
    const emptyRows = container.querySelectorAll('[data-testid="empty-row-line"]')
    expect(emptyRows.length).toBe(5)
  })

  it('renders remaining empty row dividers when data rows < maxItems', () => {
    const records = [
      { no: '1', name: 'A', quantity: 1, unit: '個', unitPrice: 100, amount: 100 },
      { no: '2', name: 'B', quantity: 2, unit: '個', unitPrice: 200, amount: 400 },
    ]
    const el = makeElement({ maxItems: 5, showEmptyRowLines: true, showHeader: false, showFooter: false })
    const { container } = render(<RepeatingBandRenderer element={el} records={records} />)
    // 5 total slots - 2 data rows = 3 empty rows
    const emptyRows = container.querySelectorAll('[data-testid="empty-row-line"]')
    expect(emptyRows.length).toBe(3)
  })

  it('does not render empty row dividers when showEmptyRowLines is false', () => {
    const el = makeElement({ maxItems: 5, showEmptyRowLines: false, showHeader: false, showFooter: false })
    const { container } = render(<RepeatingBandRenderer element={el} records={[]} />)
    const emptyRows = container.querySelectorAll('[data-testid="empty-row-line"]')
    expect(emptyRows.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// groupBy tests
// ---------------------------------------------------------------------------

const groupRecords = [
  { system: 'dev', name: 'ProductA', amount: 100 },
  { system: 'dev', name: 'ProductB', amount: 200 },
  { system: 'staging', name: 'ProductC', amount: 300 },
  { system: 'prod', name: 'ProductD', amount: 400 },
  { system: 'prod', name: 'ProductE', amount: 500 },
]

function makeGroupedElement(overrides: Partial<RepeatingBandElement> = {}): RepeatingBandElement {
  return makeElement({
    groupBy: 'system',
    showHeader: false,
    showFooter: false,
    showEmptyRowLines: false,
    maxItems: 0,
    fields: [
      { key: 'system', label: 'System', width: 30, align: 'left' },
      { key: 'name', label: 'Name', width: 40, align: 'left' },
      { key: 'amount', label: 'Amount', width: 30, align: 'right' },
    ],
    totals: [
      { fieldKey: 'amount', formula: 'sum', label: '小計' },
    ],
    ...overrides,
  })
}

describe('RepeatingBandRenderer — groupBy rendering', () => {
  it('グループヘッダー行が表示されること', () => {
    const el = makeGroupedElement()
    const { container } = render(<RepeatingBandRenderer element={el} records={groupRecords} />)
    const headers = container.querySelectorAll('[data-testid="group-header"]')
    expect(headers.length).toBe(3) // dev, staging, prod
    expect(headers[0].textContent).toContain('dev')
    expect(headers[1].textContent).toContain('staging')
    expect(headers[2].textContent).toContain('prod')
  })

  it('データ行がグループ内に正しく配置されること', () => {
    const el = makeGroupedElement()
    const { container } = render(<RepeatingBandRenderer element={el} records={groupRecords} />)
    const sections = container.querySelectorAll('[data-testid="group-section"]')
    expect(sections.length).toBe(3)

    // dev group has 2 data rows
    expect(sections[0].querySelectorAll('[data-testid="group-data-row"]').length).toBe(2)
    // staging group has 1 data row
    expect(sections[1].querySelectorAll('[data-testid="group-data-row"]').length).toBe(1)
    // prod group has 2 data rows
    expect(sections[2].querySelectorAll('[data-testid="group-data-row"]').length).toBe(2)
  })

  it('groupByフィールドのデータセルが空白になること', () => {
    const el = makeGroupedElement()
    const { container } = render(<RepeatingBandRenderer element={el} records={groupRecords} />)
    // First data row in dev group - system column (index 0) should be empty
    const dataRows = container.querySelectorAll('[data-testid="group-data-row"]')
    const firstRowCells = dataRows[0].children
    // system column should be blank (auto-hidden)
    expect(firstRowCells[0].textContent).toBe('')
    // name column should have value
    expect(firstRowCells[1].textContent).toBe('ProductA')
  })

  it('groupBy未設定時は従来のフラット表示になること', () => {
    const el = makeElement({
      showHeader: false,
      showFooter: false,
      fields: [
        { key: 'name', label: 'Name', width: 50, align: 'left' },
        { key: 'amount', label: 'Amount', width: 50, align: 'right' },
      ],
    })
    const { container } = render(<RepeatingBandRenderer element={el} records={groupRecords} />)
    // No group headers should be present
    const headers = container.querySelectorAll('[data-testid="group-header"]')
    expect(headers.length).toBe(0)
  })
})

describe('RepeatingBandRenderer — showGroupSubtotals', () => {
  it('小計行が各グループ末尾に表示されること', () => {
    const el = makeGroupedElement({ showGroupSubtotals: true })
    const { container } = render(<RepeatingBandRenderer element={el} records={groupRecords} />)
    const subtotals = container.querySelectorAll('[data-testid="group-subtotal"]')
    expect(subtotals.length).toBe(3)
  })

  it('aggregateFieldによる集計値が正しいこと', () => {
    const el = makeGroupedElement({ showGroupSubtotals: true })
    const { container } = render(<RepeatingBandRenderer element={el} records={groupRecords} />)
    const subtotals = container.querySelectorAll('[data-testid="group-subtotal"]')

    // dev group: 100 + 200 = 300
    expect(subtotals[0].textContent).toContain('300')
    // staging group: 300
    expect(subtotals[1].textContent).toContain('300')
    // prod group: 400 + 500 = 900
    expect(subtotals[2].textContent).toContain('900')
  })

  it('showGroupSubtotals=falseで小計行が非表示になること', () => {
    const el = makeGroupedElement({ showGroupSubtotals: false })
    const { container } = render(<RepeatingBandRenderer element={el} records={groupRecords} />)
    const subtotals = container.querySelectorAll('[data-testid="group-subtotal"]')
    expect(subtotals.length).toBe(0)
  })

  it('先頭列に「小計」ラベルが表示されること', () => {
    const el = makeGroupedElement({ showGroupSubtotals: true })
    const { container } = render(<RepeatingBandRenderer element={el} records={groupRecords} />)
    const subtotals = container.querySelectorAll('[data-testid="group-subtotal"]')
    expect(subtotals[0].textContent).toContain('小計')
  })
})

describe('RepeatingBandRenderer — maxItems with groupBy', () => {
  it('総表示行数がmaxItemsを超えないこと', () => {
    // maxItems=5, no subtotals: dev(1h+2d=3) + staging(1h+1d=2) = 5 → fits exactly
    const el = makeGroupedElement({ maxItems: 5, showGroupSubtotals: false })
    const { container } = render(<RepeatingBandRenderer element={el} records={groupRecords} />)
    const headers = container.querySelectorAll('[data-testid="group-header"]')
    const dataRows = container.querySelectorAll('[data-testid="group-data-row"]')
    // 2 groups, 3 data rows
    expect(headers.length).toBe(2)
    expect(dataRows.length).toBe(3)
  })

  it('行数超過時にグループが切り捨てられること', () => {
    // maxItems=4, no subtotals: dev(1+2=3), staging: remaining=1 < min(2) → cut
    const el = makeGroupedElement({ maxItems: 4, showGroupSubtotals: false })
    const { container } = render(<RepeatingBandRenderer element={el} records={groupRecords} />)
    const headers = container.querySelectorAll('[data-testid="group-header"]')
    expect(headers.length).toBe(1) // only dev group fits
  })
})

describe('RepeatingBandRenderer — showEmptyRowLines with groupBy', () => {
  it('空行数 = maxItems - (データ行 + ヘッダー行 + 小計行)', () => {
    // 3 groups, 5 data rows, subtotals: 3h + 5d + 3s = 11, maxItems=15 → 4 empty
    const el = makeGroupedElement({ maxItems: 15, showEmptyRowLines: true, showGroupSubtotals: true })
    const { container } = render(<RepeatingBandRenderer element={el} records={groupRecords} />)
    const emptyRows = container.querySelectorAll('[data-testid="empty-row-line"]')
    expect(emptyRows.length).toBe(4)
  })

  it('空行が全グループ後に表示されること', () => {
    const el = makeGroupedElement({ maxItems: 10, showEmptyRowLines: true, showGroupSubtotals: false })
    const { container } = render(<RepeatingBandRenderer element={el} records={groupRecords} />)
    // 3h + 5d = 8, 10 - 8 = 2 empty
    const emptyRows = container.querySelectorAll('[data-testid="empty-row-line"]')
    expect(emptyRows.length).toBe(2)
  })
})

describe('RepeatingBandRenderer — groupBy edge cases', () => {
  it('空配列でのgroupBy', () => {
    const el = makeGroupedElement()
    const { container } = render(<RepeatingBandRenderer element={el} records={[]} />)
    const headers = container.querySelectorAll('[data-testid="group-header"]')
    expect(headers.length).toBe(0)
  })

  it('groupByフィールドがfieldsに含まれないケース', () => {
    const el = makeGroupedElement({
      fields: [
        { key: 'name', label: 'Name', width: 50, align: 'left' },
        { key: 'amount', label: 'Amount', width: 50, align: 'right' },
      ],
    })
    const { container } = render(<RepeatingBandRenderer element={el} records={groupRecords} />)
    // Should still group and show headers
    const headers = container.querySelectorAll('[data-testid="group-header"]')
    expect(headers.length).toBe(3)
    // Data cells should show values normally since groupBy field is not in fields
    const dataRows = container.querySelectorAll('[data-testid="group-data-row"]')
    expect(dataRows[0].children[0].textContent).toBe('ProductA')
  })

  it('デザインプレビューでgroupBy設定時にグループ構造が表示されること', () => {
    const el = makeGroupedElement()
    render(<RepeatingBandRenderer element={el} />)
    expect(screen.getByText(/グループ化/)).toBeInTheDocument()
    expect(screen.getByText(/グループ 1/)).toBeInTheDocument()
  })
})

describe('RepeatingBandRenderer — Rules of Hooks (issue #62)', () => {
  it('does not crash when fields transition from 0 to n (hook order stays stable)', () => {
    const empty = makeElement({ fields: [] })
    const { rerender } = render(<RepeatingBandRenderer element={empty} onFieldsChange={() => {}} />)
    expect(screen.getByText(/スキーマフィールドをドロップ/)).toBeInTheDocument()

    const withFields = makeElement({
      id: empty.id,
      showHeader: true,
      fields: [{ key: 'name', label: '品目', width: 55, align: 'left' }],
    })
    // Before the fix this rerender changed the hook order (useState after an
    // early return) and React threw "Rendered more hooks than during the
    // previous render".
    expect(() =>
      rerender(<RepeatingBandRenderer element={withFields} onFieldsChange={() => {}} />),
    ).not.toThrow()
    expect(screen.getByText('品目')).toBeInTheDocument()
  })

  it('does not crash when fields transition from n to 0', () => {
    const withFields = makeElement({
      showHeader: true,
      fields: [{ key: 'name', label: '品目', width: 55, align: 'left' }],
    })
    const { rerender } = render(<RepeatingBandRenderer element={withFields} onFieldsChange={() => {}} />)
    const empty = makeElement({ id: withFields.id, fields: [] })
    expect(() =>
      rerender(<RepeatingBandRenderer element={empty} onFieldsChange={() => {}} />),
    ).not.toThrow()
    expect(screen.getByText(/スキーマフィールドをドロップ/)).toBeInTheDocument()
  })
})

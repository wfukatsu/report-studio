import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FormTableRenderer } from './Renderer'
import { createFormTableElement } from '@/lib/elementFactories'
import type { FormTableElement, FormTableRow } from '@/types'

function makeElement(overrides: Partial<FormTableElement> = {}): FormTableElement {
  return createFormTableElement(overrides) as FormTableElement
}

describe('FormTableRenderer — デザインプレビュー (records=undefined)', () => {
  it('renders without error', () => {
    const { container } = render(<FormTableRenderer element={makeElement()} />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('shows header cell labels from default factory', () => {
    render(<FormTableRenderer element={makeElement()} />)
    expect(screen.getByText('項目 1')).toBeInTheDocument()
    expect(screen.getByText('項目 2')).toBeInTheDocument()
    expect(screen.getByText('項目 3')).toBeInTheDocument()
  })

  it('shows data-bind badge when dataSource is set', () => {
    render(<FormTableRenderer element={makeElement({ dataSource: 'items' })} />)
    expect(screen.getByText(/帳票テーブル/)).toBeInTheDocument()
    expect(screen.getByText(/items/)).toBeInTheDocument()
  })

  it('shows placeholder text for input cells', () => {
    const element = makeElement({
      rows: [
        {
          id: 'r1',
          role: 'body' as const,
          height: 8,
          cells: [
            { id: 'c1', type: 'input' as const, placeholder: '記入' },
          ],
        },
      ],
      columns: [{ id: 'col1', width: 40, align: 'left' }],
    })
    render(<FormTableRenderer element={element} />)
    expect(screen.getByText('記入')).toBeInTheDocument()
  })

  it('shows label text for label cells', () => {
    const element = makeElement({
      rows: [
        {
          id: 'r1',
          role: 'header' as const,
          height: 8,
          cells: [{ id: 'c1', type: 'label' as const, text: 'ラベルテスト' }],
        },
      ],
      columns: [{ id: 'col1', width: 40, align: 'left' }],
    })
    render(<FormTableRenderer element={element} />)
    expect(screen.getByText('ラベルテスト')).toBeInTheDocument()
  })

  it('shows dataField key for dataField cells', () => {
    const element = makeElement({
      rows: [
        {
          id: 'r1',
          role: 'body' as const,
          height: 8,
          cells: [{ id: 'c1', type: 'dataField' as const, fieldKey: 'customer.name' }],
        },
      ],
      columns: [{ id: 'col1', width: 40, align: 'left' }],
    })
    render(<FormTableRenderer element={element} />)
    expect(screen.getByText(/customer\.name/)).toBeInTheDocument()
  })

  it('shows unlimited text when maxItems is 0 and dataSource set', () => {
    render(<FormTableRenderer element={makeElement({ dataSource: 'rows', maxItems: 0 })} />)
    expect(screen.getByText(/レコード数分 繰り返し/)).toBeInTheDocument()
  })

  it('shows max items text when maxItems > 0 and dataSource set', () => {
    render(<FormTableRenderer element={makeElement({ dataSource: 'rows', maxItems: 5 })} />)
    expect(screen.getByText(/最大 5 件/)).toBeInTheDocument()
  })
})

describe('FormTableRenderer — フッター行', () => {
  it('デザインプレビューでフッター行のテキストが描画される', () => {
    const element = makeElement({
      rows: [
        {
          id: 'r1',
          role: 'footer' as const,
          height: 8,
          cells: [{ id: 'c1', type: 'label' as const, text: '合計' }],
        },
      ],
      columns: [{ id: 'col1', width: 40, align: 'left' }],
    })
    render(<FormTableRenderer element={element} />)
    expect(screen.getByText('合計')).toBeInTheDocument()
  })

  it('ライブレンダラーでフッター行が表示される', () => {
    const element = makeElement({
      rows: [
        {
          id: 'r1',
          role: 'footer' as const,
          height: 8,
          cells: [{ id: 'c1', type: 'label' as const, text: '合計行' }],
        },
      ],
      columns: [{ id: 'col1', width: 40, align: 'left' }],
    })
    render(<FormTableRenderer element={element} records={[]} />)
    expect(screen.getByText('合計行')).toBeInTheDocument()
  })
})

describe('FormTableRenderer — dataField fallbackText', () => {
  it('fieldKey が解決できない場合は fallbackText を表示する', () => {
    const element = makeElement({
      rows: [
        {
          id: 'r1',
          role: 'body' as const,
          height: 8,
          cells: [{ id: 'c1', type: 'dataField' as const, fieldKey: 'missing', fallbackText: 'N/A' }],
        },
      ],
      columns: [{ id: 'col1', width: 40, align: 'left' }],
    })
    const records = [{ other: 'value' }]
    render(<FormTableRenderer element={element} records={records} />)
    expect(screen.getByText('N/A')).toBeInTheDocument()
  })
})

describe('FormTableRenderer — ライブレンダラー (records provided)', () => {
  it('renders live records without error', () => {
    const element = makeElement({ dataSource: 'items' })
    const records = [
      { name: '商品A', price: 100 },
      { name: '商品B', price: 200 },
    ]
    const { container } = render(
      <FormTableRenderer element={element} records={records} />,
    )
    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders empty records array without error', () => {
    const element = makeElement({ dataSource: 'items' })
    const { container } = render(
      <FormTableRenderer element={element} records={[]} />,
    )
    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders dataField cell values from record data', () => {
    const element = makeElement({
      dataSource: 'items',
      rows: makeElement().rows.map((r: FormTableRow) =>
        r.role === 'body'
          ? {
              ...r,
              cells: [{ id: 'c1', type: 'dataField' as const, fieldKey: 'name' }],
            }
          : r,
      ),
      columns: [{ id: 'col1', width: 40, align: 'left' }],
    })
    const records = [{ name: '商品A' }]
    render(<FormTableRenderer element={element} records={records} />)
    expect(screen.getByText('商品A')).toBeInTheDocument()
  })

  it('respects maxItems limit when rendering live records', () => {
    const element = makeElement({
      dataSource: 'items',
      maxItems: 1,
      rows: makeElement().rows.map((r: FormTableRow) =>
        r.role === 'body'
          ? {
              ...r,
              cells: [{ id: 'c1', type: 'dataField' as const, fieldKey: 'name' }],
            }
          : r,
      ),
      columns: [{ id: 'col1', width: 40, align: 'left' }],
    })
    const records = [{ name: '商品A' }, { name: '商品B' }]
    render(<FormTableRenderer element={element} records={records} />)
    expect(screen.getByText('商品A')).toBeInTheDocument()
    expect(screen.queryByText('商品B')).not.toBeInTheDocument()
  })

  it('evenRowColor が偶数インデックス行（rowIdx=1）に適用される（クラッシュしない）', () => {
    const element = makeElement({
      dataSource: 'items',
      evenRowColor: '#eeeeff',
      rows: [
        { id: 'r1', role: 'body' as const, height: 8, cells: [{ id: 'c1', type: 'dataField' as const, fieldKey: 'name' }] },
      ],
      columns: [{ id: 'col1', width: 40, align: 'left' }],
    })
    // 3 records: rowIdx 0 = odd, rowIdx 1 = even (evenRowColor), rowIdx 2 = odd
    const records = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
    render(<FormTableRenderer element={element} records={records} />)
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('oddRowColor / evenRowColor が body 行に適用される（クラッシュしない）', () => {
    const element = makeElement({
      dataSource: 'items',
      oddRowColor: '#ffeeee',
      evenRowColor: '#eeeeff',
      rows: makeElement().rows.map((r: FormTableRow) =>
        r.role === 'body'
          ? { ...r, cells: [{ id: 'c1', type: 'dataField' as const, fieldKey: 'name' }] }
          : r,
      ),
      columns: [{ id: 'col1', width: 40, align: 'left' }],
    })
    const records = [{ name: '商品A' }, { name: '商品B' }]
    render(<FormTableRenderer element={element} records={records} />)
    // 両レコードが描画される
    expect(screen.getByText('商品A')).toBeInTheDocument()
    expect(screen.getByText('商品B')).toBeInTheDocument()
  })
})

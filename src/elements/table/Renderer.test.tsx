import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TableRenderer } from './Renderer'
import type { TableElement } from '@/types'

function makeElement(overrides: Partial<TableElement> = {}): TableElement {
  return {
    id: 'tbl-1',
    type: 'table',
    position: { x: 10, y: 10 },
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
  } as TableElement
}

describe('TableRenderer', () => {
  it('renders a table element', () => {
    const { container } = render(<TableRenderer element={makeElement()} />)
    expect(container.querySelector('table')).toBeInTheDocument()
  })

  it('renders header cells as th elements', () => {
    const { container } = render(<TableRenderer element={makeElement()} />)
    const headers = container.querySelectorAll('th')
    expect(headers.length).toBe(3)
  })

  it('renders data cells as td elements', () => {
    const { container } = render(<TableRenderer element={makeElement()} />)
    const cells = container.querySelectorAll('td')
    expect(cells.length).toBe(6) // 2 data rows × 3 columns
  })

  it('renders cell content', () => {
    render(<TableRenderer element={makeElement()} />)
    expect(screen.getByText('ヘッダー1')).toBeInTheDocument()
    expect(screen.getByText('データ1')).toBeInTheDocument()
  })

  it('renders without header row when headerRow is false', () => {
    const { container } = render(
      <TableRenderer element={makeElement({ headerRow: false })} />,
    )
    expect(container.querySelectorAll('th').length).toBe(0)
    expect(container.querySelectorAll('td').length).toBe(9)
  })

  it('uses data from data prop when dataBinding matches', () => {
    const boundData = [['A', 'B'], ['C', 'D']]
    render(
      <TableRenderer
        element={makeElement({ dataBinding: 'tableData' })}
        data={{ tableData: boundData }}
      />,
    )
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
  })

  it('falls back to element data when dataBinding key not in data', () => {
    render(
      <TableRenderer
        element={makeElement({ dataBinding: 'missing' })}
        data={{}}
      />,
    )
    // Falls back to el.data
    expect(screen.getByText('ヘッダー1')).toBeInTheDocument()
  })

  it('marks cells with tax rate 8 with ※', () => {
    render(
      <TableRenderer
        element={makeElement({ columnTaxRates: [8, 0, 0] })}
      />,
    )
    // First column header should have ※
    expect(screen.getByText(/ヘッダー1\s*※/)).toBeInTheDocument()
  })
})

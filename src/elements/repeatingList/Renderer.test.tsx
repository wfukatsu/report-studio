import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RepeatingListRenderer } from './Renderer'
import { createRepeatingListElement } from '@/lib/elementFactories'
import type { RepeatingListElement } from '@/types'

function makeElement(overrides: Partial<RepeatingListElement> = {}): RepeatingListElement {
  return createRepeatingListElement(overrides) as RepeatingListElement
}

describe('RepeatingListRenderer — デザインプレビュー', () => {
  it('renders design preview without error', () => {
    const { container } = render(<RepeatingListRenderer element={makeElement()} />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('shows data source badge', () => {
    render(<RepeatingListRenderer element={makeElement({ dataSource: 'products' })} />)
    expect(screen.getByText(/繰り返しリスト/)).toBeInTheDocument()
    expect(screen.getByText(/products/)).toBeInTheDocument()
  })

  it('shows max items text when maxItems > 0', () => {
    render(<RepeatingListRenderer element={makeElement({ maxItems: 6 })} />)
    expect(screen.getByText(/最大 6 件/)).toBeInTheDocument()
  })

  it('shows unlimited records text when maxItems is 0', () => {
    render(<RepeatingListRenderer element={makeElement({ maxItems: 0 })} />)
    expect(screen.getByText(/レコード数分 繰り返し/)).toBeInTheDocument()
  })

  it('renders grid layout text', () => {
    render(<RepeatingListRenderer element={makeElement({ layout: 'grid', gridColumns: 3 })} />)
    expect(screen.getByText(/3列グリッド/)).toBeInTheDocument()
  })

  it('renders horizontal layout text', () => {
    render(<RepeatingListRenderer element={makeElement({ layout: 'horizontal' })} />)
    expect(screen.getByText(/横並び/)).toBeInTheDocument()
  })

  it('renders vertical layout text', () => {
    render(<RepeatingListRenderer element={makeElement({ layout: 'vertical' })} />)
    expect(screen.getByText(/縦並び/)).toBeInTheDocument()
  })
})

describe('RepeatingListRenderer — ライブレンダラー', () => {
  it('renders live records without error', () => {
    const records = [
      { name: '田中太郎', title: '部長', dept: '営業部' },
      { name: '山田花子', title: '係長', dept: '総務部' },
    ]
    const { container } = render(
      <RepeatingListRenderer element={makeElement()} records={records} />,
    )
    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders empty records without error', () => {
    const { container } = render(
      <RepeatingListRenderer element={makeElement()} records={[]} />,
    )
    expect(container.firstChild).toBeInTheDocument()
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useReportStore } from '@/store'
import { ElementPalette, PALETTE_CATEGORIES, PALETTE_ITEM_MAP } from './ElementPalette'

beforeEach(() => {
  useReportStore.getState().newReport()
})

describe('ElementPalette', () => {
  it('renders all category labels', () => {
    render(<ElementPalette />)
    expect(screen.getByText('テキスト系')).toBeInTheDocument()
    expect(screen.getByText('図形・画像')).toBeInTheDocument()
    expect(screen.getByText('繰り返し要素')).toBeInTheDocument()
    expect(screen.getByText('データ表示')).toBeInTheDocument()
    expect(screen.getAllByText('記入欄').length).toBeGreaterThan(0)
    expect(screen.getByText('日本語帳票専用')).toBeInTheDocument()
  })

  it('renders palette item buttons', () => {
    render(<ElementPalette />)
    expect(screen.getByText('テキスト')).toBeInTheDocument()
    // ラベルは text に統合されたためパレットから削除済み
    expect(screen.getByText('矩形')).toBeInTheDocument()
  })

  it('clicking an item adds an element to the store', () => {
    render(<ElementPalette />)
    const before = useReportStore.getState()
    const activePage = before.definition.pages[0]
    const beforeCount = activePage.sections.flatMap((s) => s.elements).length

    fireEvent.click(screen.getByText('テキスト'))

    const after = useReportStore.getState()
    const afterPage = after.definition.pages[0]
    const afterCount = afterPage.sections.flatMap((s) => s.elements).length
    expect(afterCount).toBe(beforeCount + 1)
  })

  it('clicking a shape item adds a shape element', () => {
    render(<ElementPalette />)
    fireEvent.click(screen.getByText('矩形'))

    const state = useReportStore.getState()
    const allElements = state.definition.pages[0].sections.flatMap((s) => s.elements)
    const added = allElements.find((e) => e.type === 'shape')
    expect(added).toBeDefined()
  })

  it('collapses category when header button is clicked', () => {
    render(<ElementPalette />)
    // テキスト系 category header button — click to collapse
    const categoryButton = screen.getByText('テキスト系').closest('button')!
    expect(screen.getByText('テキスト')).toBeInTheDocument()

    fireEvent.click(categoryButton)
    expect(screen.queryByText('テキスト')).not.toBeInTheDocument()
  })

  it('re-expands category after second click', () => {
    render(<ElementPalette />)
    const categoryButton = screen.getByText('テキスト系').closest('button')!

    fireEvent.click(categoryButton)
    expect(screen.queryByText('テキスト')).not.toBeInTheDocument()

    fireEvent.click(categoryButton)
    expect(screen.getByText('テキスト')).toBeInTheDocument()
  })
})

describe('PALETTE_CATEGORIES', () => {
  it('all items have a label, icon, and createElement function', () => {
    for (const cat of PALETTE_CATEGORIES) {
      for (const item of cat.items) {
        expect(item.label).toBeTruthy()
        expect(item.icon).toBeDefined()
        expect(typeof item.createElement).toBe('function')
      }
    }
  })

  it('each createElement returns a ReportElement with required fields', () => {
    for (const cat of PALETTE_CATEGORIES) {
      for (const item of cat.items) {
        const el = item.createElement()
        expect(el.id).toBeTruthy()
        expect(el.type).toBeTruthy()
        expect(el.position).toBeDefined()
        expect(el.size).toBeDefined()
      }
    }
  })
})

describe('PALETTE_ITEM_MAP', () => {
  it('maps label strings to createElement functions', () => {
    expect(typeof PALETTE_ITEM_MAP['テキスト']).toBe('function')
    expect(typeof PALETTE_ITEM_MAP['矩形']).toBe('function')
  })

  it('includes all palette items', () => {
    const allLabels = PALETTE_CATEGORIES.flatMap((c) => c.items.map((i) => i.label))
    for (const label of allLabels) {
      expect(PALETTE_ITEM_MAP[label]).toBeDefined()
    }
  })
})

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
  it('all items have a type id, icon, and createElement function', () => {
    for (const cat of PALETTE_CATEGORIES) {
      for (const item of cat.items) {
        expect(item.type).toBeTruthy()
        // #411: the drag/lookup id must be a stable ASCII identifier, never a localized label
        expect(item.type).toMatch(/^[a-zA-Z0-9]+$/)
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
  it('maps stable type ids to createElement functions', () => {
    expect(typeof PALETTE_ITEM_MAP['text']).toBe('function')
    expect(typeof PALETTE_ITEM_MAP['rectangle']).toBe('function')
  })

  it('includes all palette items', () => {
    const allTypes = PALETTE_CATEGORIES.flatMap((c) => c.items.map((i) => i.type))
    for (const type of allTypes) {
      expect(PALETTE_ITEM_MAP[type]).toBeDefined()
    }
  })
})

describe('ElementPalette — handleAdd positioning branches', () => {
  it('adding ページ番号 uses bottom-center position', () => {
    render(<ElementPalette />)
    fireEvent.click(screen.getByText('ページ番号'))
    const state = useReportStore.getState()
    const allElements = state.definition.pages[0].sections.flatMap((s) => s.elements)
    const added = allElements.find((e) => e.type === 'pageNumber')
    expect(added).toBeDefined()
    // pageNumber is positioned at bottom of page
    const page = state.definition.pages[0]
    expect(added!.position.y).toBeGreaterThan(page.height / 2)
  })

  it('adding 現在日付 uses top-right position', () => {
    render(<ElementPalette />)
    fireEvent.click(screen.getByText('現在日付'))
    const state = useReportStore.getState()
    const allElements = state.definition.pages[0].sections.flatMap((s) => s.elements)
    const added = allElements.find((e) => e.type === 'currentDate')
    expect(added).toBeDefined()
    // currentDate is positioned near top
    expect(added!.position.y).toBeLessThan(30)
  })

  it('adding 区切り線 uses left-margin position and content width', () => {
    render(<ElementPalette />)
    fireEvent.click(screen.getByText('区切り線'))
    const state = useReportStore.getState()
    const allElements = state.definition.pages[0].sections.flatMap((s) => s.elements)
    const added = allElements.find((e) => e.type === 'divider')
    expect(added).toBeDefined()
    // divider width should be page width minus margins
    const page = state.definition.pages[0]
    const margins = state.definition.pageSettings.margins
    const expectedWidth = page.width - margins.left - margins.right
    expect(added!.size.width).toBe(expectedWidth)
    // position x = margins.left
    expect(added!.position.x).toBe(margins.left)
  })
})

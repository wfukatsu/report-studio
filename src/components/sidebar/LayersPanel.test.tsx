import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useReportStore } from '@/store'
import { LayersPanel } from './LayersPanel'
import { createTextElement, createShapeElement } from '@/lib/elementFactories'

beforeEach(() => {
  useReportStore.getState().newReport()
  useReportStore.getState().setLayerSearchQuery('')
})

function addElement(createElement = createTextElement) {
  const store = useReportStore.getState()
  const page = store.definition.pages[0]
  const el = createElement()
  store.addElement(page.id, el)
  return el
}

describe('LayersPanel — 初期レンダリング', () => {
  it('renders search input', () => {
    render(<LayersPanel />)
    expect(screen.getByRole('textbox', { name: 'レイヤーを検索' })).toBeInTheDocument()
  })

  it('renders add element button', () => {
    render(<LayersPanel />)
    expect(screen.getByRole('button', { name: '新規レイヤーを追加' })).toBeInTheDocument()
  })

  it('renders add group button', () => {
    render(<LayersPanel />)
    expect(screen.getByRole('button', { name: '空のグループを追加' })).toBeInTheDocument()
  })

  it('shows empty state when no elements', () => {
    render(<LayersPanel />)
    expect(screen.getByText(/要素がありません/)).toBeInTheDocument()
  })

  it('shows element count in footer', () => {
    render(<LayersPanel />)
    expect(screen.getByText('0個の要素')).toBeInTheDocument()
  })
})

describe('LayersPanel — 要素が存在するとき', () => {
  it('shows element count after adding element', () => {
    addElement()
    render(<LayersPanel />)
    expect(screen.getByText('1個の要素')).toBeInTheDocument()
  })

  it('does not show empty state when elements exist', () => {
    addElement()
    render(<LayersPanel />)
    expect(screen.queryByText('要素がありません。')).not.toBeInTheDocument()
  })

  it('renders section labels', () => {
    addElement()
    render(<LayersPanel />)
    // sectionLabel('body') === 'ボディ'
    expect(screen.getByText(/ボディ|ヘッダー|フッター/)).toBeInTheDocument()
  })
})

describe('LayersPanel — 検索', () => {
  it('filters elements by search query', () => {
    const store = useReportStore.getState()
    const page = store.definition.pages[0]
    const el = createTextElement()
    store.addElement(page.id, el)

    render(<LayersPanel />)
    const searchInput = screen.getByRole('textbox', { name: 'レイヤーを検索' })
    fireEvent.change(searchInput, { target: { value: 'text' } })

    // Search updates store
    expect(useReportStore.getState().layerSearchQuery).toBe('text')
  })

  it('shows no-match message when search has no results', () => {
    addElement()
    render(<LayersPanel />)
    const searchInput = screen.getByRole('textbox', { name: 'レイヤーを検索' })
    fireEvent.change(searchInput, { target: { value: 'zzznomatch9999' } })

    expect(screen.getByText(/一致する要素が見つかりません/)).toBeInTheDocument()
  })
})

describe('LayersPanel — グループ追加', () => {
  it('adds a layer group when 空のグループを追加 is clicked', () => {
    render(<LayersPanel />)
    const page = useReportStore.getState().definition.pages[0]
    expect(page.groups ?? []).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: '空のグループを追加' }))

    const updatedPage = useReportStore.getState().definition.pages[0]
    expect((updatedPage.groups ?? [])).toHaveLength(1)
  })
})

describe('LayersPanel — ページなしの場合', () => {
  it('shows no-pages message when all pages removed', () => {
    useReportStore.setState((draft) => {
      draft.definition.pages = []
      draft.selection.activePageId = null
    })

    render(<LayersPanel />)
    expect(screen.getByText('ページがありません')).toBeInTheDocument()
  })
})

describe('LayersPanel — 複数選択時のバルクツールバー', () => {
  it('shows bulk toolbar when 2+ elements selected', () => {
    const store = useReportStore.getState()
    const page = store.definition.pages[0]
    const el1 = createTextElement()
    const el2 = createShapeElement()
    store.addElement(page.id, el1)
    store.addElement(page.id, el2)
    store.selectElement(el1.id, false)
    store.selectElement(el2.id, true)

    render(<LayersPanel />)
    expect(screen.getByText('2個選択中')).toBeInTheDocument()
  })

  it('shows bulk visibility buttons when multiple selected', () => {
    const store = useReportStore.getState()
    const page = store.definition.pages[0]
    const el1 = createTextElement()
    const el2 = createShapeElement()
    store.addElement(page.id, el1)
    store.addElement(page.id, el2)
    store.selectElement(el1.id, false)
    store.selectElement(el2.id, true)

    render(<LayersPanel />)
    expect(screen.getByTitle('選択中を表示')).toBeInTheDocument()
    expect(screen.getByTitle('選択中を非表示')).toBeInTheDocument()
  })
})

describe('LayersPanel — 要素追加ドロップダウン', () => {
  it('opens element type dropdown when + button clicked', () => {
    render(<LayersPanel />)
    // Add button opens dropdown with element categories
    const addBtn = screen.getByRole('button', { name: '新規レイヤーを追加' })
    fireEvent.click(addBtn)

    // Should see palette categories in the dropdown
    expect(screen.getByText('テキスト系')).toBeInTheDocument()
  })

  it('closes dropdown when same button is clicked again', () => {
    render(<LayersPanel />)
    const addBtn = screen.getByRole('button', { name: '新規レイヤーを追加' })
    fireEvent.click(addBtn)
    fireEvent.click(addBtn)

    expect(screen.queryByText('テキスト系')).not.toBeInTheDocument()
  })

  it('adds an element when item is selected from dropdown', () => {
    render(<LayersPanel />)
    const store = useReportStore.getState()
    const beforeCount = store.definition.pages[0].sections.flatMap((s) => s.elements).length

    // Open dropdown
    fireEvent.click(screen.getByRole('button', { name: '新規レイヤーを追加' }))

    // Click on テキスト item
    const textItem = screen.getByText('テキスト')
    fireEvent.click(textItem)

    const afterCount = useReportStore.getState().definition.pages[0].sections.flatMap((s) => s.elements).length
    expect(afterCount).toBe(beforeCount + 1)
  })
})

describe('LayersPanel — 要素選択', () => {
  it('selects element when row is clicked', () => {
    const store = useReportStore.getState()
    const page = store.definition.pages[0]
    const el = createTextElement({ id: 'el-layer-click', name: 'クリックテスト' })
    store.addElement(page.id, el)

    render(<LayersPanel />)
    fireEvent.click(screen.getByText('クリックテスト'))
    expect(useReportStore.getState().selection.selectedElementIds).toContain('el-layer-click')
  })
})

describe('LayersPanel — 要素表示/非表示', () => {
  it('toggles visibility when visibility button clicked', () => {
    const store = useReportStore.getState()
    const page = store.definition.pages[0]
    const el = createTextElement({ id: 'el-vis-toggle', name: '表示切替', visible: true })
    store.addElement(page.id, el)
    store.selectElement('el-vis-toggle', false)

    render(<LayersPanel />)
    fireEvent.click(screen.getByTitle('非表示にする'))

    const elements = useReportStore.getState().definition.pages[0].sections.flatMap((s) => s.elements)
    expect(elements.find((e) => e.id === 'el-vis-toggle')?.visible).toBe(false)
  })
})

describe('LayersPanel — 要素ロック', () => {
  it('toggles lock when lock button clicked', () => {
    const store = useReportStore.getState()
    const page = store.definition.pages[0]
    const el = createTextElement({ id: 'el-lock-toggle', name: 'ロックテスト', locked: false })
    store.addElement(page.id, el)
    store.selectElement('el-lock-toggle', false)

    render(<LayersPanel />)
    fireEvent.click(screen.getByTitle('ロック'))

    const elements = useReportStore.getState().definition.pages[0].sections.flatMap((s) => s.elements)
    expect(elements.find((e) => e.id === 'el-lock-toggle')?.locked).toBe(true)
  })
})

describe('LayersPanel — 要素削除', () => {
  it('deletes element when delete button clicked', () => {
    const store = useReportStore.getState()
    const page = store.definition.pages[0]
    const el = createTextElement({ id: 'el-del-layer', name: '削除テスト' })
    store.addElement(page.id, el)
    store.selectElement('el-del-layer', false)

    render(<LayersPanel />)
    fireEvent.click(screen.getByTitle('削除'))

    const elements = useReportStore.getState().definition.pages[0].sections.flatMap((s) => s.elements)
    expect(elements.find((e) => e.id === 'el-del-layer')).toBeUndefined()
  })
})

describe('LayersPanel — リネーム', () => {
  it('starts rename mode on double-click of element name', () => {
    const store = useReportStore.getState()
    const page = store.definition.pages[0]
    const el = createTextElement({ id: 'el-ren-layer', name: 'リネームテスト' })
    store.addElement(page.id, el)
    store.selectElement('el-ren-layer', false)

    render(<LayersPanel />)
    fireEvent.doubleClick(screen.getByText('リネームテスト'))

    // Should show an input field
    expect(screen.getByDisplayValue('リネームテスト')).toBeInTheDocument()
  })

  it('commits rename on Enter key', () => {
    const store = useReportStore.getState()
    const page = store.definition.pages[0]
    const el = createTextElement({ id: 'el-ren-enter', name: '変更前' })
    store.addElement(page.id, el)
    store.selectElement('el-ren-enter', false)

    render(<LayersPanel />)
    fireEvent.doubleClick(screen.getByText('変更前'))
    const input = screen.getByDisplayValue('変更前')
    fireEvent.change(input, { target: { value: '変更後' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    const elements = useReportStore.getState().definition.pages[0].sections.flatMap((s) => s.elements)
    expect(elements.find((e) => e.id === 'el-ren-enter')?.name).toBe('変更後')
  })

  it('cancels rename on Escape key', () => {
    const store = useReportStore.getState()
    const page = store.definition.pages[0]
    const el = createTextElement({ id: 'el-ren-esc', name: 'キャンセルテスト' })
    store.addElement(page.id, el)
    store.selectElement('el-ren-esc', false)

    render(<LayersPanel />)
    fireEvent.doubleClick(screen.getByText('キャンセルテスト'))
    const input = screen.getByDisplayValue('キャンセルテスト')
    fireEvent.change(input, { target: { value: '変更しない' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByDisplayValue('変更しない')).not.toBeInTheDocument()
  })
})

describe('LayersPanel — バルクツールバーのボタン', () => {
  it('calls bulkSetVisible(false) when hide button clicked', () => {
    const store = useReportStore.getState()
    const page = store.definition.pages[0]
    const el1 = createTextElement({ id: 'bulk-el1', visible: true })
    const el2 = createShapeElement({ id: 'bulk-el2', visible: true })
    store.addElement(page.id, el1)
    store.addElement(page.id, el2)
    store.selectElement(el1.id, false)
    store.selectElement(el2.id, true)

    render(<LayersPanel />)
    fireEvent.click(screen.getByTitle('選択中を非表示'))

    const elements = useReportStore.getState().definition.pages[0].sections.flatMap((s) => s.elements)
    const el1Updated = elements.find((e) => e.id === 'bulk-el1')
    const el2Updated = elements.find((e) => e.id === 'bulk-el2')
    expect(el1Updated?.visible).toBe(false)
    expect(el2Updated?.visible).toBe(false)
  })

  it('calls bulkSetLocked(true) when lock button clicked', () => {
    const store = useReportStore.getState()
    const page = store.definition.pages[0]
    const el1 = createTextElement({ id: 'bulk-lock1', locked: false })
    const el2 = createShapeElement({ id: 'bulk-lock2', locked: false })
    store.addElement(page.id, el1)
    store.addElement(page.id, el2)
    store.selectElement(el1.id, false)
    store.selectElement(el2.id, true)

    render(<LayersPanel />)
    fireEvent.click(screen.getByTitle('選択中をロック'))

    const elements = useReportStore.getState().definition.pages[0].sections.flatMap((s) => s.elements)
    const el1Updated = elements.find((e) => e.id === 'bulk-lock1')
    expect(el1Updated?.locked).toBe(true)
  })
})

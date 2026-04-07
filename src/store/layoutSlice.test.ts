/**
 * layoutSlice — action coverage tests
 * Focuses on actions NOT already covered by reportStore.test.ts
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useReportStore } from './index'
import { flattenPageElements } from './selectors'
import type { ReportElement, Section } from '@/types'

function store() { return useReportStore.getState() }

function makeEl(overrides: Partial<ReportElement> = {}): ReportElement {
  return {
    id: 'e1',
    type: 'text',
    position: { x: 10, y: 20 },
    size: { width: 50, height: 20 },
    zIndex: 1,
    visible: true,
    locked: false,
    content: 'hello',
    style: {},
    ...overrides,
  } as ReportElement
}

function activePage() {
  const s = store()
  return s.definition.pages.find((p) => p.id === s.selection.activePageId)!
}

beforeEach(() => {
  vi.useFakeTimers()
  store().newReport()
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// setReportName
// ---------------------------------------------------------------------------

describe('setReportName', () => {
  it('ドキュメント名を更新する', () => {
    store().setReportName('新しいレポート')
    expect(store().definition.metadata.documentName).toBe('新しいレポート')
  })
})

// ---------------------------------------------------------------------------
// updateSettings
// ---------------------------------------------------------------------------

describe('updateSettings', () => {
  it('用紙設定を更新する', () => {
    store().updateSettings({ paperSize: 'A3', orientation: 'landscape' })
    const { paperSize, orientation } = store().definition.pageSettings
    expect(paperSize).toBe('A3')
    expect(orientation).toBe('landscape')
  })

  it('全ページのサイズが更新される', () => {
    store().addPage()
    store().updateSettings({ paperSize: 'A3', orientation: 'landscape' })
    for (const page of store().definition.pages) {
      expect(page.width).toBeGreaterThan(210) // A3 landscape > A4 portrait
    }
  })
})

// ---------------------------------------------------------------------------
// renamePage / updatePageBackground
// ---------------------------------------------------------------------------

describe('renamePage', () => {
  it('ページ名を変更する', () => {
    const pageId = activePage().id
    store().renamePage(pageId, '表紙')
    expect(activePage().name).toBe('表紙')
  })
})

describe('updatePageBackground', () => {
  it('背景色を変更する', () => {
    const pageId = activePage().id
    store().updatePageBackground(pageId, '#ff0000')
    expect(activePage().background).toBe('#ff0000')
  })
})

// ---------------------------------------------------------------------------
// setActivePage
// ---------------------------------------------------------------------------

describe('setActivePage', () => {
  it('アクティブページを切り替え、選択をクリアする', () => {
    store().addPage()
    const [p1, p2] = store().definition.pages
    // 要素を選択した状態にする
    store().addElement(p1.id, makeEl())
    store().selectElement('e1')
    expect(store().selection.selectedElementIds).toContain('e1')

    store().setActivePage(p2.id)
    expect(store().selection.activePageId).toBe(p2.id)
    expect(store().selection.selectedElementIds).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// updateSectionHeight
// ---------------------------------------------------------------------------

describe('updateSectionHeight', () => {
  it('セクションの高さを更新する', () => {
    const page = activePage()
    const sectionId = page.sections[0].id
    store().updateSectionHeight(page.id, sectionId, 150)
    expect(activePage().sections[0].height).toBe(150)
  })

  it('最小高さを下回る場合はクランプされる', () => {
    const page = activePage()
    const sectionId = page.sections[0].id
    store().updateSectionHeight(page.id, sectionId, 5) // body min is 50
    expect(activePage().sections[0].height).toBe(50)
  })
})

// ---------------------------------------------------------------------------
// updateElement / moveElement / resizeElement
// ---------------------------------------------------------------------------

describe('updateElement', () => {
  it('要素のプロパティを更新する', async () => {
    const pageId = activePage().id
    store().addElement(pageId, makeEl({ id: 'e1', content: 'A' }))
    store().updateElement(pageId, 'e1', { content: 'B' } as Partial<ReportElement>)
    vi.advanceTimersByTime(300)
    const el = flattenPageElements(activePage()).find((e) => e.id === 'e1') as { content: string }
    expect(el?.content).toBe('B')
  })
})

describe('moveElement', () => {
  it('要素の position を更新する', () => {
    const pageId = activePage().id
    store().addElement(pageId, makeEl({ id: 'e1' }))
    store().moveElement(pageId, 'e1', { x: 99, y: 88 })
    const el = flattenPageElements(activePage()).find((e) => e.id === 'e1')!
    expect(el.position).toEqual({ x: 99, y: 88 })
  })
})

describe('resizeElement', () => {
  it('要素の size を更新する', () => {
    const pageId = activePage().id
    store().addElement(pageId, makeEl({ id: 'e1' }))
    store().resizeElement(pageId, 'e1', { width: 200, height: 100 })
    const el = flattenPageElements(activePage()).find((e) => e.id === 'e1')!
    expect(el.size).toEqual({ width: 200, height: 100 })
  })
})

// ---------------------------------------------------------------------------
// duplicateElement
// ---------------------------------------------------------------------------

describe('duplicateElement', () => {
  it('複製された要素が追加される', () => {
    const pageId = activePage().id
    store().addElement(pageId, makeEl({ id: 'e1' }))
    store().duplicateElement(pageId, 'e1')
    expect(flattenPageElements(activePage())).toHaveLength(2)
  })

  it('複製された要素の position がオフセットされる', () => {
    const pageId = activePage().id
    store().addElement(pageId, makeEl({ id: 'e1', position: { x: 10, y: 20 } }))
    store().duplicateElement(pageId, 'e1')
    const els = flattenPageElements(activePage())
    const copy = els.find((e) => e.id !== 'e1')!
    expect(copy.position.x).toBe(15)
    expect(copy.position.y).toBe(25)
  })

  it('複製された要素が選択される', () => {
    const pageId = activePage().id
    store().addElement(pageId, makeEl({ id: 'e1' }))
    store().duplicateElement(pageId, 'e1')
    const els = flattenPageElements(activePage())
    const copyId = els.find((e) => e.id !== 'e1')!.id
    expect(store().selection.selectedElementIds).toContain(copyId)
  })
})

// ---------------------------------------------------------------------------
// selectElement / clearSelection / selectAll
// ---------------------------------------------------------------------------

describe('selectElement', () => {
  it('単一選択', () => {
    const pageId = activePage().id
    store().addElement(pageId, makeEl({ id: 'e1' }))
    store().addElement(pageId, makeEl({ id: 'e2' }))
    store().selectElement('e1')
    expect(store().selection.selectedElementIds).toEqual(['e1'])
  })

  it('multi=true で追加選択', () => {
    const pageId = activePage().id
    store().addElement(pageId, makeEl({ id: 'e1' }))
    store().addElement(pageId, makeEl({ id: 'e2' }))
    store().selectElement('e1')
    store().selectElement('e2', true)
    expect(store().selection.selectedElementIds).toContain('e1')
    expect(store().selection.selectedElementIds).toContain('e2')
  })

  it('multi=true で既選択要素はトグル解除', () => {
    const pageId = activePage().id
    store().addElement(pageId, makeEl({ id: 'e1' }))
    store().selectElement('e1')
    store().selectElement('e1', true)
    expect(store().selection.selectedElementIds).not.toContain('e1')
  })
})

describe('clearSelection', () => {
  it('選択を解除する', () => {
    const pageId = activePage().id
    store().addElement(pageId, makeEl({ id: 'e1' }))
    store().selectElement('e1')
    store().clearSelection()
    expect(store().selection.selectedElementIds).toHaveLength(0)
  })
})

describe('selectAll', () => {
  it('ページの全要素を選択する', () => {
    const pageId = activePage().id
    store().addElement(pageId, makeEl({ id: 'e1' }))
    store().addElement(pageId, makeEl({ id: 'e2' }))
    store().selectAll(pageId)
    expect(store().selection.selectedElementIds).toContain('e1')
    expect(store().selection.selectedElementIds).toContain('e2')
  })
})

// ---------------------------------------------------------------------------
// copyElements / pasteElements / cutElements
// ---------------------------------------------------------------------------

describe('copyElements / pasteElements', () => {
  it('コピー後にペーストすると要素が増える', () => {
    const pageId = activePage().id
    store().addElement(pageId, makeEl({ id: 'e1' }))
    store().copyElements(pageId, ['e1'])
    store().pasteElements(pageId)
    expect(flattenPageElements(activePage())).toHaveLength(2)
  })

  it('クリップボードが空のときはペーストしない', () => {
    useReportStore.setState({ clipboard: null })
    const pageId = activePage().id
    store().addElement(pageId, makeEl({ id: 'e1' }))
    store().pasteElements(pageId)
    expect(flattenPageElements(activePage())).toHaveLength(1)
  })
})

describe('cutElements', () => {
  it('cut 後は元の要素が削除される', () => {
    const pageId = activePage().id
    store().addElement(pageId, makeEl({ id: 'e1' }))
    store().cutElements(pageId, ['e1'])
    expect(flattenPageElements(activePage())).toHaveLength(0)
  })

  it('cut した要素をペーストできる', () => {
    const pageId = activePage().id
    store().addElement(pageId, makeEl({ id: 'e1' }))
    store().cutElements(pageId, ['e1'])
    store().pasteElements(pageId)
    expect(flattenPageElements(activePage())).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// alignElements
// ---------------------------------------------------------------------------

describe('alignElements', () => {
  function addTwo() {
    const pageId = activePage().id
    store().addElement(pageId, makeEl({ id: 'e1', position: { x: 10, y: 10 }, size: { width: 50, height: 20 } }))
    store().addElement(pageId, makeEl({ id: 'e2', position: { x: 80, y: 50 }, size: { width: 30, height: 10 } }))
    return pageId
  }

  it('left — 左端を揃える', () => {
    const pageId = addTwo()
    store().alignElements(pageId, ['e1', 'e2'], 'left')
    const els = flattenPageElements(activePage())
    const minX = Math.min(...els.map((e) => e.position.x))
    expect(els.every((e) => e.position.x === minX)).toBe(true)
  })

  it('top — 上端を揃える', () => {
    const pageId = addTwo()
    store().alignElements(pageId, ['e1', 'e2'], 'top')
    const els = flattenPageElements(activePage())
    const minY = Math.min(...els.map((e) => e.position.y))
    expect(els.every((e) => e.position.y === minY)).toBe(true)
  })

  it('right — 右端を揃える', () => {
    const pageId = addTwo()
    store().alignElements(pageId, ['e1', 'e2'], 'right')
    const els = flattenPageElements(activePage())
    const maxRight = Math.max(...els.map((e) => e.position.x + e.size.width))
    expect(els.every((e) => e.position.x + e.size.width === maxRight)).toBe(true)
  })

  it('bottom — 下端を揃える', () => {
    const pageId = addTwo()
    store().alignElements(pageId, ['e1', 'e2'], 'bottom')
    const els = flattenPageElements(activePage())
    const maxBottom = Math.max(...els.map((e) => e.position.y + e.size.height))
    expect(els.every((e) => e.position.y + e.size.height === maxBottom)).toBe(true)
  })

  it('centerH — 水平中央を揃える', () => {
    const pageId = addTwo()
    store().alignElements(pageId, ['e1', 'e2'], 'centerH')
    const els = flattenPageElements(activePage())
    const centers = els.map((e) => e.position.x + e.size.width / 2)
    expect(Math.abs(centers[0] - centers[1])).toBeLessThan(0.01)
  })

  it('centerV — 垂直中央を揃える', () => {
    const pageId = addTwo()
    store().alignElements(pageId, ['e1', 'e2'], 'centerV')
    const els = flattenPageElements(activePage())
    const centers = els.map((e) => e.position.y + e.size.height / 2)
    expect(Math.abs(centers[0] - centers[1])).toBeLessThan(0.01)
  })
})

// ---------------------------------------------------------------------------
// setZOrder
// ---------------------------------------------------------------------------

describe('setZOrder', () => {
  it('front — z を最前面にする', () => {
    const pageId = activePage().id
    store().addElement(pageId, makeEl({ id: 'e1', zIndex: 1 }))
    store().addElement(pageId, makeEl({ id: 'e2', zIndex: 2 }))
    store().setZOrder(pageId, 'e1', 'front')
    const els = flattenPageElements(activePage())
    const e1 = els.find((e) => e.id === 'e1')!
    const e2 = els.find((e) => e.id === 'e2')!
    expect(e1.zIndex).toBeGreaterThan(e2.zIndex)
  })

  it('back — z を最背面にする', () => {
    const pageId = activePage().id
    store().addElement(pageId, makeEl({ id: 'e1', zIndex: 1 }))
    store().addElement(pageId, makeEl({ id: 'e2', zIndex: 2 }))
    store().setZOrder(pageId, 'e2', 'back')
    const els = flattenPageElements(activePage())
    const e2 = els.find((e) => e.id === 'e2')!
    expect(e2.zIndex).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// addLayerGroup / removeLayerGroup / updateLayerGroup
// ---------------------------------------------------------------------------

describe('addLayerGroup / removeLayerGroup / updateLayerGroup', () => {
  it('グループを追加・削除できる', () => {
    const pageId = activePage().id
    store().addLayerGroup(pageId, { id: 'g1', name: 'G1', elementIds: [], visible: true, locked: false })
    expect(activePage().groups).toHaveLength(1)
    store().removeLayerGroup(pageId, 'g1')
    expect(activePage().groups).toHaveLength(0)
  })

  it('グループのプロパティを更新できる', () => {
    const pageId = activePage().id
    store().addLayerGroup(pageId, { id: 'g1', name: 'G1', elementIds: [], visible: true, locked: false })
    store().updateLayerGroup(pageId, 'g1', { name: '更新グループ' })
    expect(activePage().groups![0].name).toBe('更新グループ')
  })
})

// ---------------------------------------------------------------------------
// groupSelectedElements / leaveGroup
// ---------------------------------------------------------------------------

describe('groupSelectedElements', () => {
  it('2要素以上を選択してグループ化できる', () => {
    const pageId = activePage().id
    store().addElement(pageId, makeEl({ id: 'e1' }))
    store().addElement(pageId, makeEl({ id: 'e2' }))
    store().selectElement('e1')
    store().selectElement('e2', true)
    store().groupSelectedElements(pageId, 'テストグループ')
    const groups = activePage().groups ?? []
    expect(groups).toHaveLength(1)
    expect(groups[0].elementIds).toContain('e1')
    expect(groups[0].elementIds).toContain('e2')
  })

  it('1要素以下では何もしない', () => {
    const pageId = activePage().id
    store().addElement(pageId, makeEl({ id: 'e1' }))
    store().selectElement('e1')
    store().groupSelectedElements(pageId, 'G')
    expect(activePage().groups ?? []).toHaveLength(0)
  })
})

describe('leaveGroup', () => {
  it('グループから要素を外せる', () => {
    const pageId = activePage().id
    store().addElement(pageId, makeEl({ id: 'e1' }))
    store().addElement(pageId, makeEl({ id: 'e2' }))
    store().selectElement('e1')
    store().selectElement('e2', true)
    store().groupSelectedElements(pageId, 'G')
    store().leaveGroup(pageId, 'e1')
    const groups = activePage().groups ?? []
    expect(groups[0].elementIds).not.toContain('e1')
  })
})

// ---------------------------------------------------------------------------
// updateElements / removeElements
// ---------------------------------------------------------------------------

describe('updateElements', () => {
  it('複数要素を一括更新する', () => {
    const pageId = activePage().id
    store().addElement(pageId, makeEl({ id: 'e1', visible: true }))
    store().addElement(pageId, makeEl({ id: 'e2', visible: true }))
    store().updateElements(pageId, ['e1', 'e2'], { visible: false })
    const els = flattenPageElements(activePage())
    expect(els.every((e) => e.visible === false)).toBe(true)
  })
})

describe('removeElements', () => {
  it('複数要素を一括削除する', () => {
    const pageId = activePage().id
    store().addElement(pageId, makeEl({ id: 'e1' }))
    store().addElement(pageId, makeEl({ id: 'e2' }))
    store().addElement(pageId, makeEl({ id: 'e3' }))
    store().removeElements(pageId, ['e1', 'e3'])
    const els = flattenPageElements(activePage())
    expect(els).toHaveLength(1)
    expect(els[0].id).toBe('e2')
  })
})

// ---------------------------------------------------------------------------
// setMasterHeader / setMasterFooter
// ---------------------------------------------------------------------------

describe('setMasterHeader', () => {
  it('マスターヘッダーを設定すると definition.masterHeader が更新される', () => {
    const header: Section = {
      id: 'h1',
      sectionType: 'header',
      height: 20,
      elements: [],
    }
    store().setMasterHeader(header)
    expect(store().definition.masterHeader).toBeDefined()
    expect((store().definition.masterHeader as Section).height).toBe(20)
  })

  it('null を渡すとマスターヘッダーが解除される', () => {
    store().setMasterHeader(null)
    expect(store().definition.masterHeader).toBeUndefined()
  })
})

describe('setMasterFooter', () => {
  it('マスターフッターを設定すると全ページに反映される', () => {
    store().addPage()
    const footer: Section = {
      id: 'f1',
      sectionType: 'footer',
      height: 15,
      elements: [],
    }
    store().setMasterFooter(footer)
    expect(store().definition.masterFooter).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// removePage — 2ページ以上のとき実際に削除される
// ---------------------------------------------------------------------------

describe('removePage (2+pages)', () => {
  it('2枚目を削除できる', () => {
    store().addPage()
    const [p1, p2] = store().definition.pages
    store().removePage(p2.id)
    expect(store().definition.pages).toHaveLength(1)
    expect(store().definition.pages[0].id).toBe(p1.id)
  })

  it('アクティブページを削除したとき、前のページがアクティブになる', () => {
    store().addPage()
    const [, p2] = store().definition.pages
    store().setActivePage(p2.id)
    store().removePage(p2.id)
    expect(store().selection.activePageId).toBe(store().definition.pages[0].id)
  })
})

// ---------------------------------------------------------------------------
// distributeH / distributeV (alignElements)
// ---------------------------------------------------------------------------

describe('alignElements — distribute', () => {
  it('distributeH — 水平均等配置', () => {
    const pageId = activePage().id
    store().addElement(pageId, makeEl({ id: 'e1', position: { x: 0, y: 0 }, size: { width: 10, height: 10 } }))
    store().addElement(pageId, makeEl({ id: 'e2', position: { x: 50, y: 0 }, size: { width: 10, height: 10 } }))
    store().addElement(pageId, makeEl({ id: 'e3', position: { x: 100, y: 0 }, size: { width: 10, height: 10 } }))
    store().alignElements(pageId, ['e1', 'e2', 'e3'], 'distributeH')
    const els = flattenPageElements(activePage()).sort((a, b) => a.position.x - b.position.x)
    const gap1 = els[1].position.x - (els[0].position.x + els[0].size.width)
    const gap2 = els[2].position.x - (els[1].position.x + els[1].size.width)
    expect(Math.abs(gap1 - gap2)).toBeLessThan(0.01)
  })

  it('distributeV — 垂直均等配置', () => {
    const pageId = activePage().id
    store().addElement(pageId, makeEl({ id: 'e1', position: { x: 0, y: 0 }, size: { width: 10, height: 10 } }))
    store().addElement(pageId, makeEl({ id: 'e2', position: { x: 0, y: 50 }, size: { width: 10, height: 10 } }))
    store().addElement(pageId, makeEl({ id: 'e3', position: { x: 0, y: 100 }, size: { width: 10, height: 10 } }))
    store().alignElements(pageId, ['e1', 'e2', 'e3'], 'distributeV')
    const els = flattenPageElements(activePage()).sort((a, b) => a.position.y - b.position.y)
    const gap1 = els[1].position.y - (els[0].position.y + els[0].size.height)
    const gap2 = els[2].position.y - (els[1].position.y + els[1].size.height)
    expect(Math.abs(gap1 - gap2)).toBeLessThan(0.01)
  })
})

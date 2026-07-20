import { describe, it, expect, beforeEach } from 'vitest'
import { useReportStore, selectActivePage, flattenPageElements } from './reportStore'

function getStore() {
  return useReportStore.getState()
}

beforeEach(() => {
  useReportStore.getState().newReport()
})

describe('reportStore', () => {
  it('initializes with one page', () => {
    const { definition } = getStore()
    expect(definition.pages).toHaveLength(1)
  })

  it('adds a page', () => {
    getStore().addPage()
    expect(getStore().definition.pages).toHaveLength(2)
  })

  it('removes a page (min 1 enforced)', () => {
    const pageId = getStore().definition.pages[0].id
    getStore().removePage(pageId)
    expect(getStore().definition.pages).toHaveLength(1)
  })

  it('adds and selects an element', () => {
    const store = getStore()
    const page = store.definition.pages[0]
    const el = {
      id: 'test-el',
      type: 'text' as const,
      position: { x: 0, y: 0 },
      size: { width: 100, height: 40 },
      zIndex: 1,
      locked: false,
      visible: true,
      content: 'Hello',
      style: {},
    }
    store.addElement(page.id, el)
    const updatedPage = getStore().definition.pages[0]
    const elements = flattenPageElements(updatedPage)
    expect(elements).toHaveLength(1)
    expect(getStore().selection.selectedElementIds).toContain('test-el')
  })

  it('removes an element', () => {
    const store = getStore()
    const page = store.definition.pages[0]
    const el = {
      id: 'del-me',
      type: 'text' as const,
      position: { x: 0, y: 0 },
      size: { width: 100, height: 40 },
      zIndex: 1,
      locked: false,
      visible: true,
      content: '',
      style: {},
    }
    store.addElement(page.id, el)
    store.removeElement(page.id, 'del-me')
    const elements = flattenPageElements(getStore().definition.pages[0])
    expect(elements).toHaveLength(0)
  })

  it('undo/redo works', () => {
    const store = getStore()
    const page = store.definition.pages[0]
    const el = {
      id: 'undo-el',
      type: 'text' as const,
      position: { x: 0, y: 0 },
      size: { width: 100, height: 40 },
      zIndex: 1,
      locked: false,
      visible: true,
      content: 'Test',
      style: {},
    }
    store.addElement(page.id, el)
    expect(flattenPageElements(getStore().definition.pages[0])).toHaveLength(1)

    getStore().undo()
    expect(flattenPageElements(getStore().definition.pages[0])).toHaveLength(0)

    getStore().redo()
    expect(flattenPageElements(getStore().definition.pages[0])).toHaveLength(1)
  })

  it('addPage is undoable (#215)', () => {
    const store = getStore()
    expect(store.definition.pages).toHaveLength(1)
    store.addPage()
    expect(getStore().definition.pages).toHaveLength(2)

    getStore().undo()
    expect(getStore().definition.pages).toHaveLength(1)

    getStore().redo()
    expect(getStore().definition.pages).toHaveLength(2)
  })

  it('updateSettings (page settings) is undoable (#215)', () => {
    const store = getStore()
    const originalSize = store.definition.pageSettings.paperSize
    store.updateSettings({ paperSize: 'A3' })
    expect(getStore().definition.pageSettings.paperSize).toBe('A3')

    getStore().undo()
    expect(getStore().definition.pageSettings.paperSize).toBe(originalSize)
  })

  it('selectActivePage returns first page when no activePageId', () => {
    const state = getStore()
    const page = selectActivePage(state)
    expect(page).toBeTruthy()
    expect(page?.id).toBe(state.definition.pages[0].id)
  })

  it('definition.pages[0].sections has body section', () => {
    const { definition } = getStore()
    const page = definition.pages[0]
    expect(page.sections).toHaveLength(1)
    expect(page.sections[0].sectionType).toBe('body')
  })

  it('pushHistory completes within 10ms for 3-page 50-element report', () => {
    const store = getStore()
    // Add 2 more pages (total 3)
    store.addPage('Page 2')
    store.addPage('Page 3')
    expect(getStore().definition.pages).toHaveLength(3)

    // Add ~17 elements per page (51 total)
    const pages = getStore().definition.pages
    for (const page of pages) {
      for (let i = 0; i < 17; i++) {
        getStore().addElement(page.id, {
          id: `perf-${page.id}-${i}`,
          type: 'text' as const,
          position: { x: i * 10, y: i * 10 },
          size: { width: 50, height: 20 },
          zIndex: 1,
          locked: false,
          visible: true,
          content: `Element ${i}`,
          style: {},
        })
      }
    }

    const totalElements = getStore().definition.pages.flatMap(
      (p) => flattenPageElements(p)
    ).length
    expect(totalElements).toBeGreaterThanOrEqual(50)

    // Measure addElement time
    const pageId = getStore().definition.pages[0].id
    const start = performance.now()
    getStore().addElement(pageId, {
      id: 'perf-final',
      type: 'text' as const,
      position: { x: 0, y: 0 },
      size: { width: 50, height: 20 },
      zIndex: 1,
      locked: false,
      visible: true,
      content: 'Final',
      style: {},
    })
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(10)
  })

  it('importReportJSON auto-migrates legacy Report format', () => {
    const legacyReport = {
      id: 'legacy-id',
      name: 'Old Report',
      pages: [
        {
          id: 'page-1',
          name: 'Page 1',
          elements: [],
          background: '#ffffff',
          width: 210,
          height: 297,
          sections: [],
        },
      ],
      settings: {
        paperSize: 'A4',
        orientation: 'portrait',
        margin: { top: 20, right: 20, bottom: 20, left: 20 },
        unit: 'mm',
      },
      dataSource: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const result = getStore().importReportJSON(JSON.stringify(legacyReport))
    expect(result.ok).toBe(true)
    const { definition } = getStore()
    expect(definition.metadata.documentName).toBe('Old Report')
    expect(definition.pages).toHaveLength(1)
  })
})

/**
 * Layout slice — definition, pages, sections, elements, selection.
 * This is the primary slice managing report structure and user interactions.
 */

import type { StateCreator } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type {
  ReportDefinition,
  PageDef,
  Section,
  ReportElement,
  DataSourceDefinition,
  LayerGroup,
} from '@/types'
import { getPageDimensions } from '@/lib/paperSizes'
import { migrateReport, importFromJSON } from '@/lib/migration'
import { exportToJSON } from '@/lib/exportUtils'
import { mergePreviewData } from '@/lib/dataSourceUtils'
import type { StoreState, AlignmentType, ZOrderAction, SelectionState, HistoryEntry } from './types'
import { flattenPageElements } from './selectors'
import { cloneSectionForPage } from '@/lib/sectionUtils'

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/**
 * Recalculate the body section height so that the total of all sections
 * equals page.height. Header and footer keep their own heights; the body
 * section absorbs the remainder.  Minimum body height is 50mm.
 */
function fitBodyToPage(page: PageDef): void {
  const body = page.sections.find((s) => s.sectionType === 'body')
  if (!body) return
  const nonBodyHeight = page.sections
    .filter((s) => s.sectionType !== 'body')
    .reduce((sum, s) => sum + s.height, 0)
  body.height = Math.max(50, page.height - nonBodyHeight)
}

function createDefaultSection(elements: ReportElement[] = [], height?: number): Section {
  return {
    id: uuidv4(),
    sectionType: 'body',
    height: height ?? 0,
    elements,
  }
}

export function createDefaultPageDef(name = 'Page 1'): PageDef {
  const dims = getPageDimensions('A4', 'portrait')
  const section = createDefaultSection([], dims.height)
  return {
    id: uuidv4(),
    name,
    background: '#ffffff',
    width: dims.width,
    height: dims.height,
    sections: [section],
  }
}

export function createDefaultDefinition(): ReportDefinition {
  return {
    id: uuidv4(),
    metadata: {
      documentName: 'Untitled Report',
      version: '1.0',
      reportType: 'general',
    },
    pageSettings: {
      paperSize: 'A4',
      orientation: 'portrait',
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
      unit: 'mm',
    },
    defaultTextStyle: {},
    templateVariables: [],
    calculationRules: [],
    dataSources: [],
    outputVariants: [],
    submissionModels: [],
    validationRules: [],
    pages: [createDefaultPageDef()],
  }
}

// ---------------------------------------------------------------------------
// Snapshot helper (inlined to avoid lateral historySlice import)
// ---------------------------------------------------------------------------

function snapshotPages(pages: PageDef[]): HistoryEntry {
  return { pages: JSON.parse(JSON.stringify(pages)) as PageDef[] }
}

// ---------------------------------------------------------------------------
// Slice type
// ---------------------------------------------------------------------------

export type LayoutSlice = Pick<StoreState,
  | 'definition'
  | 'selection'
  | 'testData'
  | 'setReportName'
  | 'updateSettings'
  | 'setDataSource'
  | 'loadReport'
  | 'loadLegacyReport'
  | 'newReport'
  | 'exportReportJSON'
  | 'importReportJSON'
  | 'addPage'
  | 'removePage'
  | 'renamePage'
  | 'updatePageBackground'
  | 'setActivePage'
  | 'updateSectionHeight'
  | 'updateTestData'
  | 'addElement'
  | 'updateElement'
  | 'removeElement'
  | 'moveElement'
  | 'resizeElement'
  | 'duplicateElement'
  | 'alignElements'
  | 'setZOrder'
  | 'copyElements'
  | 'pasteElements'
  | 'cutElements'
  | 'addLayerGroup'
  | 'removeLayerGroup'
  | 'updateLayerGroup'
  | 'groupSelectedElements'
  | 'leaveGroup'
  | 'reorderElements'
  | 'updateElements'
  | 'removeElements'
  | 'selectElement'
  | 'clearSelection'
  | 'selectAll'
  | 'setMasterHeader'
  | 'setMasterFooter'
>

// ---------------------------------------------------------------------------
// Slice creator
// ---------------------------------------------------------------------------

const _initialDefinition = createDefaultDefinition()
const _initialPages = _initialDefinition.pages

export const createLayoutSlice: StateCreator<
  StoreState,
  [['zustand/immer', never]],
  [],
  LayoutSlice
> = (set, get) => {
  let _historyTimer: ReturnType<typeof setTimeout> | null = null

  return {
  definition: _initialDefinition,
  selection: {
    selectedElementIds: [],
    activePageId: _initialPages[0]?.id ?? null,
  } as SelectionState,
  testData: mergePreviewData(_initialDefinition.dataSources),

  setReportName: (name) => set((s) => {
    s.definition.metadata.documentName = name
  }),

  updateSettings: (settings) => set((s) => {
    Object.assign(s.definition.pageSettings, settings)
    const { paperSize, orientation, customWidth, customHeight } = s.definition.pageSettings
    const dims = getPageDimensions(paperSize, orientation, customWidth, customHeight)
    for (const page of s.definition.pages) {
      page.width = dims.width
      page.height = dims.height
      const bodySection = page.sections.find((sec) => sec.sectionType === 'body')
      if (bodySection) {
        bodySection.height = dims.height
      } else if (page.sections.length > 0) {
        page.sections[0].height = dims.height
      }
    }
  }),

  setDataSource: (dataSource: DataSourceDefinition | null) => set((s) => {
    s.definition.dataSources = dataSource === null ? [] : [dataSource]
  }),

  loadReport: (definition: ReportDefinition) => {
    if (_historyTimer) { clearTimeout(_historyTimer); _historyTimer = null }
    const migratedPages = definition.pages.map((p) => {
      if (!p.sections || p.sections.length === 0) {
        return { ...p, sections: [createDefaultSection([], p.height)] }
      }
      return p
    })
    const migratedDefinition = { ...definition, pages: migratedPages }
    const initial = snapshotPages(migratedPages)
    set((s) => {
      s.definition = migratedDefinition
      s.selection = { selectedElementIds: [], activePageId: migratedPages[0]?.id ?? null }
      s.history = [initial]
      s.historyIndex = 0
      s.testData = mergePreviewData(migratedDefinition.dataSources)
    })
    get().invalidateComputed()
  },

  loadLegacyReport: (report) => {
    get().loadReport(migrateReport(report))
  },

  newReport: () => {
    if (_historyTimer) { clearTimeout(_historyTimer); _historyTimer = null }
    const definition = createDefaultDefinition()
    const initial = snapshotPages(definition.pages)
    set((s) => {
      s.definition = definition
      s.selection = { selectedElementIds: [], activePageId: definition.pages[0].id }
      s.history = [initial]
      s.historyIndex = 0
    })
    get().invalidateComputed()
  },

  exportReportJSON: () => {
    return exportToJSON(get().definition)
  },

  importReportJSON: (json) => {
    const result = importFromJSON(json)
    if (!result.ok) return { ok: false, error: result.error }
    get().loadReport(result.definition)
    return { ok: true }
  },

  addPage: (name) => set((s) => {
    const pageName = name ?? `Page ${s.definition.pages.length + 1}`
    const page = createDefaultPageDef(pageName)
    const { masterHeader, masterFooter } = s.definition
    if (masterHeader) {
      const idx = page.sections.findIndex((sec) => sec.sectionType === 'header')
      if (idx !== -1) {
        page.sections[idx] = cloneSectionForPage(masterHeader as Section)
      } else {
        const cloned = cloneSectionForPage(masterHeader as Section)
        page.sections.unshift(cloned)
      }
    }
    if (masterFooter) {
      const idx = page.sections.findIndex((sec) => sec.sectionType === 'footer')
      if (idx !== -1) {
        page.sections[idx] = cloneSectionForPage(masterFooter as Section)
      } else {
        const cloned = cloneSectionForPage(masterFooter as Section)
        page.sections.push(cloned)
      }
    }
    fitBodyToPage(page)
    s.definition.pages.push(page)
    s.selection.activePageId = page.id
  }),

  removePage: (pageId) => set((s) => {
    if (s.definition.pages.length <= 1) return
    const idx = s.definition.pages.findIndex((p) => p.id === pageId)
    if (idx === -1) return
    s.definition.pages.splice(idx, 1)
    if (s.selection.activePageId === pageId) {
      s.selection.activePageId = s.definition.pages[Math.max(0, idx - 1)]?.id ?? null
    }
  }),

  renamePage: (pageId, name) => set((s) => {
    const page = s.definition.pages.find((p) => p.id === pageId)
    if (page) page.name = name
  }),

  updatePageBackground: (pageId, background) => set((s) => {
    const page = s.definition.pages.find((p) => p.id === pageId)
    if (page) page.background = background
  }),

  setActivePage: (pageId) => set((s) => {
    s.selection.activePageId = pageId
    s.selection.selectedElementIds = []
  }),

  updateSectionHeight: (pageId, sectionId, heightMm) => set((s) => {
    const page = s.definition.pages.find((p) => p.id === pageId)
    if (!page) return
    const section = page.sections.find((sec) => sec.id === sectionId)
    if (!section) return
    const MIN_HEIGHT: Record<string, number> = {
      header: 10, footer: 10, body: 50, custom: 10,
    }
    const min = MIN_HEIGHT[section.sectionType] ?? 10
    section.height = Math.max(min, heightMm)
    // If a non-body section was resized, adjust body to fit page
    if (section.sectionType !== 'body') fitBodyToPage(page)
  }),

  updateTestData: (dataSourceId, fieldKey, value) => set((s) => {
    const ds = s.definition.dataSources.find((d) => d.id === dataSourceId)
    if (ds) {
      (ds.fields as Record<string, unknown>)[fieldKey] = value
      // Keep testData in sync for expression evaluation
      s.testData = mergePreviewData(s.definition.dataSources as import('@/types').DataSourceDefinition[])
    }
    // Not pushed to history — test data changes are not undo-able
  }),

  addElement: (pageId, element) => {
    if (_historyTimer !== null) { clearTimeout(_historyTimer); _historyTimer = null }
    set((s) => {
      const page = s.definition.pages.find((p) => p.id === pageId)
      if (!page) return
      const allElements = flattenPageElements(page as PageDef)
      const maxZ = allElements.reduce((m, e) => Math.max(m, e.zIndex), 0)
      const newEl = { ...element, zIndex: maxZ + 1 }
      const bodyIdx = page.sections.findIndex((sec) => sec.sectionType === 'body')
      const targetIdx = bodyIdx !== -1 ? bodyIdx : 0
      if (!page.sections || page.sections.length === 0) {
        page.sections = [createDefaultSection([newEl], page.height)]
      } else {
        page.sections[targetIdx].elements.push(newEl)
      }
      s.selection.selectedElementIds = [element.id]
    })
    get().pushHistory()
  },

  updateElement: (pageId, elementId, patch) => {
    set((s) => {
      const page = s.definition.pages.find((p) => p.id === pageId)
      if (!page) return
      for (const section of page.sections ?? []) {
        const sEl = section.elements.find((e) => e.id === elementId)
        if (sEl) Object.assign(sEl, patch)
      }
    })
    // Debounce history push
    if (_historyTimer) clearTimeout(_historyTimer)
    _historyTimer = setTimeout(() => {
      _historyTimer = null
      get().pushHistory()
    }, 300)
  },

  removeElement: (pageId, elementId) => {
    if (_historyTimer !== null) { clearTimeout(_historyTimer); _historyTimer = null }
    set((s) => {
      const page = s.definition.pages.find((p) => p.id === pageId)
      if (!page) return
      for (const section of page.sections ?? []) {
        section.elements = section.elements.filter((e) => e.id !== elementId)
      }
      // Clean up group memberships and remove empty groups
      if (page.groups) {
        page.groups = page.groups
          .map((g) => ({ ...g, elementIds: g.elementIds.filter((id) => id !== elementId) }))
          .filter((g) => g.elementIds.length > 0)
      }
      s.selection.selectedElementIds = s.selection.selectedElementIds.filter(
        (id) => id !== elementId,
      )
    })
    // Clean up variant references — called after set() so the draft is committed
    get().cleanupVariantRefsForElement(elementId)
    get().pushHistory()
  },

  moveElement: (pageId, elementId, position) => set((s) => {
    const page = s.definition.pages.find((p) => p.id === pageId)
    if (!page) return
    for (const section of page.sections ?? []) {
      const sEl = section.elements.find((e) => e.id === elementId)
      if (sEl) sEl.position = position
    }
    // No history push for move — too noisy during drag
  }),

  resizeElement: (pageId, elementId, size) => set((s) => {
    const page = s.definition.pages.find((p) => p.id === pageId)
    if (!page) return
    for (const section of page.sections ?? []) {
      const sEl = section.elements.find((e) => e.id === elementId)
      if (sEl) sEl.size = size
    }
    // No history push for resize — too noisy during drag
  }),

  duplicateElement: (pageId, elementId) => {
    if (_historyTimer !== null) { clearTimeout(_historyTimer); _historyTimer = null }
    set((s) => {
      const page = s.definition.pages.find((p) => p.id === pageId)
      if (!page) return
      let sourceEl: ReportElement | undefined
      let sourceSectionIdx = -1
      for (let i = 0; i < page.sections.length; i++) {
        const found = page.sections[i].elements.find((e) => e.id === elementId)
        if (found) {
          sourceEl = found
          sourceSectionIdx = i
          break
        }
      }
      if (!sourceEl) return
      const copy = JSON.parse(JSON.stringify(sourceEl)) as ReportElement
      copy.id = uuidv4()
      copy.position = { x: sourceEl.position.x + 5, y: sourceEl.position.y + 5 }
      const allElements = flattenPageElements(page as PageDef)
      const maxZ = allElements.reduce((m, e) => Math.max(m, e.zIndex), 0)
      copy.zIndex = maxZ + 1
      page.sections[sourceSectionIdx].elements.push(copy)
      s.selection.selectedElementIds = [copy.id]
    })
    get().pushHistory()
  },

  selectElement: (elementId, multi = false) => set((s) => {
    if (multi) {
      const already = s.selection.selectedElementIds.includes(elementId)
      s.selection.selectedElementIds = already
        ? s.selection.selectedElementIds.filter((id) => id !== elementId)
        : [...s.selection.selectedElementIds, elementId]
    } else {
      s.selection.selectedElementIds = [elementId]
    }
  }),

  clearSelection: () => set((s) => {
    s.selection.selectedElementIds = []
  }),

  selectAll: (pageId) => set((s) => {
    const page = s.definition.pages.find((p) => p.id === pageId)
    if (!page) return
    s.selection.selectedElementIds = flattenPageElements(page as PageDef).map((e) => e.id)
  }),

  setSelectionIds: (ids) => set((s) => {
    s.selection.selectedElementIds = ids
  }),

  setMasterHeader: (section: Section | null) => {
    if (_historyTimer !== null) { clearTimeout(_historyTimer); _historyTimer = null }
    set((s) => {
      s.definition.masterHeader = section ?? undefined
      if (section) {
        s.definition.pages.forEach((page) => {
          const idx = page.sections.findIndex((sec) => sec.sectionType === 'header')
          if (idx !== -1) {
            page.sections[idx] = cloneSectionForPage(section as Section)
          } else {
            page.sections.unshift(cloneSectionForPage(section as Section))
          }
          fitBodyToPage(page)
        })
      } else {
        s.definition.pages.forEach((page) => {
          page.sections = page.sections.filter((sec) => sec.sectionType !== 'header')
          fitBodyToPage(page)
        })
      }
    })
    get().pushHistory()
  },

  setMasterFooter: (section: Section | null) => {
    if (_historyTimer !== null) { clearTimeout(_historyTimer); _historyTimer = null }
    set((s) => {
      s.definition.masterFooter = section ?? undefined
      if (section) {
        s.definition.pages.forEach((page) => {
          const idx = page.sections.findIndex((sec) => sec.sectionType === 'footer')
          if (idx !== -1) {
            page.sections[idx] = cloneSectionForPage(section as Section)
          } else {
            page.sections.push(cloneSectionForPage(section as Section))
          }
          fitBodyToPage(page)
        })
      } else {
        s.definition.pages.forEach((page) => {
          page.sections = page.sections.filter((sec) => sec.sectionType !== 'footer')
          fitBodyToPage(page)
        })
      }
    })
    get().pushHistory()
  },

  copyElements: (pageId, elementIds) => {
    const page = get().definition.pages.find((p) => p.id === pageId)
    if (!page) return
    const elements = flattenPageElements(page).filter((e) => elementIds.includes(e.id))
    if (elements.length === 0) return
    set((s) => {
      s.clipboard = JSON.parse(JSON.stringify(elements)) as ReportElement[]
    })
  },

  cutElements: (pageId, elementIds) => {
    if (_historyTimer !== null) { clearTimeout(_historyTimer); _historyTimer = null }
    const page = get().definition.pages.find((p) => p.id === pageId)
    if (!page) return
    const elements = flattenPageElements(page).filter((e) => elementIds.includes(e.id))
    if (elements.length === 0) return
    // Capture clipboard outside produce
    const clipboardData = JSON.parse(JSON.stringify(elements)) as ReportElement[]
    const removedSet = new Set(elementIds)
    set((s) => {
      s.clipboard = clipboardData
      const pg = s.definition.pages.find((p) => p.id === pageId)
      if (!pg) return
      for (const section of pg.sections ?? []) {
        section.elements = section.elements.filter((e) => !removedSet.has(e.id))
      }
      // Clean up group memberships (#117)
      if (pg.groups) {
        pg.groups = pg.groups
          .map((g) => ({ ...g, elementIds: g.elementIds.filter((id) => !removedSet.has(id)) }))
          .filter((g) => g.elementIds.length > 0)
      }
      s.selection.selectedElementIds = []
    })
    get().pushHistory()
  },

  pasteElements: (pageId) => {
    if (_historyTimer !== null) { clearTimeout(_historyTimer); _historyTimer = null }
    const clipboard = get().clipboard
    if (!clipboard || clipboard.length === 0) return
    set((s) => {
      const page = s.definition.pages.find((p) => p.id === pageId)
      if (!page) return
      const allElements = flattenPageElements(page as PageDef)
      const maxZ = allElements.reduce((m, e) => Math.max(m, e.zIndex), 0)
      const newIds: string[] = []
      const bodyIdx = page.sections.findIndex((sec) => sec.sectionType === 'body')
      const targetIdx = bodyIdx !== -1 ? bodyIdx : 0
      clipboard.forEach((el, i) => {
        const copy = JSON.parse(JSON.stringify(el)) as ReportElement
        copy.id = uuidv4()
        copy.position = { x: el.position.x + 5, y: el.position.y + 5 }
        copy.zIndex = maxZ + i + 1
        if (page.sections && page.sections.length > 0) {
          page.sections[targetIdx].elements.push(copy)
        }
        newIds.push(copy.id)
      })
      s.selection.selectedElementIds = newIds
    })
    get().pushHistory()
  },

  alignElements: (pageId, elementIds, alignment: AlignmentType) => {
    if (_historyTimer !== null) { clearTimeout(_historyTimer); _historyTimer = null }
    set((s) => {
      const page = s.definition.pages.find((p) => p.id === pageId)
      if (!page || elementIds.length < 2) return
      const allElements = flattenPageElements(page as PageDef)
      const els = allElements.filter((e) => elementIds.includes(e.id))
      if (els.length < 2) return

      const updatePos = (id: string, x: number, y: number) => {
        for (const section of page.sections ?? []) {
          const sEl = section.elements.find((e) => e.id === id)
          if (sEl) sEl.position = { x, y }
        }
      }

      if (alignment === 'left') {
        const minX = Math.min(...els.map((e) => e.position.x))
        els.forEach((e) => updatePos(e.id, minX, e.position.y))
      } else if (alignment === 'right') {
        const maxRight = Math.max(...els.map((e) => e.position.x + e.size.width))
        els.forEach((e) => updatePos(e.id, maxRight - e.size.width, e.position.y))
      } else if (alignment === 'centerH') {
        const cX = (Math.min(...els.map((e) => e.position.x)) + Math.max(...els.map((e) => e.position.x + e.size.width))) / 2
        els.forEach((e) => updatePos(e.id, cX - e.size.width / 2, e.position.y))
      } else if (alignment === 'top') {
        const minY = Math.min(...els.map((e) => e.position.y))
        els.forEach((e) => updatePos(e.id, e.position.x, minY))
      } else if (alignment === 'bottom') {
        const maxBottom = Math.max(...els.map((e) => e.position.y + e.size.height))
        els.forEach((e) => updatePos(e.id, e.position.x, maxBottom - e.size.height))
      } else if (alignment === 'centerV') {
        const cY = (Math.min(...els.map((e) => e.position.y)) + Math.max(...els.map((e) => e.position.y + e.size.height))) / 2
        els.forEach((e) => updatePos(e.id, e.position.x, cY - e.size.height / 2))
      } else if (alignment === 'distributeH') {
        const sorted = [...els].sort((a, b) => a.position.x - b.position.x)
        const minX = sorted[0].position.x
        const maxRight = sorted[sorted.length - 1].position.x + sorted[sorted.length - 1].size.width
        const totalWidth = sorted.reduce((sum, e) => sum + e.size.width, 0)
        const gap = (maxRight - minX - totalWidth) / (sorted.length - 1)
        let curX = minX
        sorted.forEach((e) => { updatePos(e.id, curX, e.position.y); curX += e.size.width + gap })
      } else if (alignment === 'distributeV') {
        const sorted = [...els].sort((a, b) => a.position.y - b.position.y)
        const minY = sorted[0].position.y
        const maxBottom = sorted[sorted.length - 1].position.y + sorted[sorted.length - 1].size.height
        const totalHeight = sorted.reduce((sum, e) => sum + e.size.height, 0)
        const gap = (maxBottom - minY - totalHeight) / (sorted.length - 1)
        let curY = minY
        sorted.forEach((e) => { updatePos(e.id, e.position.x, curY); curY += e.size.height + gap })
      }
    })
    get().pushHistory()
  },

  setZOrder: (pageId, elementId, order: ZOrderAction) => {
    if (_historyTimer !== null) { clearTimeout(_historyTimer); _historyTimer = null }
    set((s) => {
      const page = s.definition.pages.find((p) => p.id === pageId)
      if (!page) return
      const allElements = flattenPageElements(page as PageDef)
      const els = [...allElements].sort((a, b) => a.zIndex - b.zIndex)
      const idx = els.findIndex((e) => e.id === elementId)
      if (idx === -1) return

      const reassign = (sorted: typeof els) => {
        sorted.forEach((e, i) => {
          for (const section of page.sections ?? []) {
            const sEl = section.elements.find((se) => se.id === e.id)
            if (sEl) sEl.zIndex = i + 1
          }
        })
      }

      if (order === 'front') {
        reassign([...els.slice(0, idx), ...els.slice(idx + 1), els[idx]])
      } else if (order === 'back') {
        reassign([els[idx], ...els.slice(0, idx), ...els.slice(idx + 1)])
      } else if (order === 'forward' && idx < els.length - 1) {
        const reordered = [...els]
        ;[reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]]
        reassign(reordered)
      } else if (order === 'backward' && idx > 0) {
        const reordered = [...els]
        ;[reordered[idx], reordered[idx - 1]] = [reordered[idx - 1], reordered[idx]]
        reassign(reordered)
      }
    })
    get().pushHistory()
  },

  // ── Group layer actions ───────────────────────────────────────────────────

  addLayerGroup: (pageId, group: LayerGroup) => {
    set((s) => {
      const page = s.definition.pages.find((p) => p.id === pageId)
      if (!page) return
      if (!page.groups) page.groups = []
      page.groups.push(group)
    })
    get().pushHistory()
  },

  removeLayerGroup: (pageId, groupId) => {
    set((s) => {
      const page = s.definition.pages.find((p) => p.id === pageId)
      if (!page?.groups) return
      page.groups = page.groups.filter((g) => g.id !== groupId)
    })
    get().pushHistory()
  },

  groupSelectedElements: (pageId, name) => {
    const selectedIds = get().selection.selectedElementIds
    if (selectedIds.length < 2) return
    // Build Set outside immer to avoid O(n²) Array.includes inside Proxy (#119)
    const selectedSet = new Set(selectedIds)
    // Validate all selected elements belong to the same section (#121)
    const page = get().definition.pages.find((p) => p.id === pageId)
    if (!page) return
    let ownerSectionId: string | null = null
    for (const section of page.sections ?? []) {
      for (const el of section.elements) {
        if (selectedSet.has(el.id)) {
          if (ownerSectionId === null) ownerSectionId = section.id
          else if (ownerSectionId !== section.id) return // cross-section: abort
        }
      }
    }
    const group: LayerGroup = {
      id: uuidv4(),
      name: name ?? 'グループ',
      elementIds: [...selectedIds],
      collapsed: false,
      visible: true,
      locked: false,
    }
    set((s) => {
      const pg = s.definition.pages.find((p) => p.id === pageId)
      if (!pg) return
      if (!pg.groups) pg.groups = []
      // Remove selected elements from any existing groups first
      pg.groups = pg.groups
        .map((g) => ({ ...g, elementIds: g.elementIds.filter((id) => !selectedSet.has(id)) }))
        .filter((g) => g.elementIds.length > 0)
      pg.groups.push(group)
    })
    get().pushHistory()
  },

  leaveGroup: (pageId, elementId) => {
    set((s) => {
      const page = s.definition.pages.find((p) => p.id === pageId)
      if (!page?.groups) return
      page.groups = page.groups
        .map((g) => ({ ...g, elementIds: g.elementIds.filter((id) => id !== elementId) }))
        .filter((g) => g.elementIds.length > 0)
    })
    get().pushHistory()
  },

  updateLayerGroup: (pageId, groupId, patch) => {
    set((s) => {
      const page = s.definition.pages.find((p) => p.id === pageId)
      const group = page?.groups?.find((g) => g.id === groupId)
      if (group) Object.assign(group, patch)
    })
    get().pushHistory()
  },

  // ── Batch element actions ─────────────────────────────────────────────────

  reorderElements: (pageId, sectionId, orderedIds) => {
    if (_historyTimer !== null) { clearTimeout(_historyTimer); _historyTimer = null }
    set((s) => {
      const page = s.definition.pages.find((p) => p.id === pageId)
      if (!page) return

      // Sort all page elements by current zIndex
      const allElements = flattenPageElements(page as PageDef).sort((a, b) => a.zIndex - b.zIndex)

      // Collect the IDs belonging to the target section
      const sectionElementIdSet = new Set(
        page.sections.find((sec) => sec.id === sectionId)?.elements.map((e) => e.id) ?? []
      )

      // Build the reordered section elements in the requested order
      const reorderedSection = orderedIds
        .map((id) => allElements.find((e) => e.id === id))
        .filter((e): e is ReportElement => e !== undefined)

      // Splice section elements in-place at their original position in global order
      const firstSectionIdx = allElements.findIndex((e) => sectionElementIdSet.has(e.id))
      const reorderedAll = [
        ...allElements.slice(0, firstSectionIdx).filter((e) => !sectionElementIdSet.has(e.id)),
        ...reorderedSection,
        ...allElements.slice(firstSectionIdx).filter((e) => !sectionElementIdSet.has(e.id)),
      ]

      // Reassign zIndex across all sections (same logic as setZOrder)
      reorderedAll.forEach((el, i) => {
        for (const section of page.sections) {
          const found = section.elements.find((e) => e.id === el.id)
          if (found) found.zIndex = i + 1
        }
      })
    })
    get().pushHistory()
  },

  updateElements: (pageId, elementIds, patch) => {
    if (_historyTimer !== null) { clearTimeout(_historyTimer); _historyTimer = null }
    set((s) => {
      const page = s.definition.pages.find((p) => p.id === pageId)
      if (!page) return
      for (const section of page.sections) {
        for (const el of section.elements) {
          if (elementIds.includes(el.id)) Object.assign(el, patch)
        }
      }
    })
    get().pushHistory()
  },

  removeElements: (pageId, elementIds) => {
    if (_historyTimer !== null) { clearTimeout(_historyTimer); _historyTimer = null }
    const removedSet = new Set(elementIds)
    set((s) => {
      const page = s.definition.pages.find((p) => p.id === pageId)
      if (!page) return
      for (const section of page.sections) {
        section.elements = section.elements.filter((e) => !removedSet.has(e.id))
      }
      // Clean up group memberships and remove empty groups
      if (page.groups) {
        page.groups = page.groups
          .map((g) => ({ ...g, elementIds: g.elementIds.filter((id) => !removedSet.has(id)) }))
          .filter((g) => g.elementIds.length > 0)
      }
      s.selection.selectedElementIds = s.selection.selectedElementIds.filter(
        (id) => !removedSet.has(id),
      )
    })
    get().pushHistory()
  },
}
}

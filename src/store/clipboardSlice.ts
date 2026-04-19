/**
 * Clipboard slice — copy, cut, paste operations.
 * Extracted from layoutSlice to keep each file under 800 lines.
 */
import type { StateCreator } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { ReportElement, TextStyle, PageDef } from '@/types'
import type { StoreState } from './types'
import { flattenPageElements } from './selectors'
import { clearHistoryTimer } from './historyTimer'

export type ClipboardSlice = Pick<StoreState,
  | 'clipboard'
  | 'styleClipboard'
  | 'copyElements'
  | 'cutElements'
  | 'pasteElements'
  | 'copyStyle'
  | 'pasteStyle'
>

export const createClipboardSlice: StateCreator<
  StoreState,
  [['zustand/immer', never]],
  [],
  ClipboardSlice
> = (set, get) => ({
  clipboard: null,
  styleClipboard: null,

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
    clearHistoryTimer()
    const page = get().definition.pages.find((p) => p.id === pageId)
    if (!page) return
    const elements = flattenPageElements(page).filter((e) => elementIds.includes(e.id))
    if (elements.length === 0) return
    const clipboardData = JSON.parse(JSON.stringify(elements)) as ReportElement[]
    const removedSet = new Set(elementIds)
    set((s) => {
      s.clipboard = clipboardData
      const pg = s.definition.pages.find((p) => p.id === pageId)
      if (!pg) return
      for (const section of pg.sections ?? []) {
        section.elements = section.elements.filter((e) => !removedSet.has(e.id))
      }
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
    clearHistoryTimer()
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

  copyStyle: (pageId, elementId) => {
    const page = get().definition.pages.find((p) => p.id === pageId)
    if (!page) return
    const el = flattenPageElements(page).find((e) => e.id === elementId)
    if (!el || !('style' in el) || !el.style) return
    set((s) => {
      s.styleClipboard = JSON.parse(JSON.stringify(el.style)) as TextStyle
    })
  },

  pasteStyle: (pageId, elementIds) => {
    clearHistoryTimer()
    const styleClip = get().styleClipboard
    if (!styleClip || elementIds.length === 0) return
    set((s) => {
      const page = s.definition.pages.find((p) => p.id === pageId)
      if (!page) return
      for (const section of page.sections ?? []) {
        for (const el of section.elements) {
          if (elementIds.includes(el.id) && 'style' in el && el.style) {
            ;(el as { style: TextStyle }).style = JSON.parse(JSON.stringify(styleClip)) as TextStyle
          }
        }
      }
    })
    get().pushHistory()
  },
})

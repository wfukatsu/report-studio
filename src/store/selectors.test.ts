import { describe, it, expect, beforeEach } from 'vitest'
import { useReportStore } from '@/store'
import {
  flattenPageElements,
  selectActivePage,
  selectActivePageId,
  selectSelectedElements,
} from './selectors'
import { createTextElement, createShapeElement } from '@/lib/elementFactories'
import type { PageDef } from '@/types'

beforeEach(() => {
  useReportStore.getState().newReport()
})

// ---------------------------------------------------------------------------
// flattenPageElements
// ---------------------------------------------------------------------------

describe('flattenPageElements', () => {
  it('returns empty array when page has no sections', () => {
    const page: PageDef = {
      id: 'p1',
      name: 'Page 1',
      width: 210,
      height: 297,
      background: '#ffffff',
      sections: [],
    }
    expect(flattenPageElements(page)).toEqual([])
  })

  it('flattens elements from multiple sections', () => {
    const el1 = createTextElement({ id: 'el-1' })
    const el2 = createShapeElement({ id: 'el-2' })
    const page: PageDef = {
      id: 'p1',
      name: 'Page 1',
      width: 210,
      height: 297,
      background: '#ffffff',
      sections: [
        { id: 's1', sectionType: 'body', height: 100, elements: [el1] },
        { id: 's2', sectionType: 'body', height: 100, elements: [el2] },
      ],
    }
    const result = flattenPageElements(page)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('el-1')
    expect(result[1].id).toBe('el-2')
  })

  it('returns elements from single section', () => {
    const el = createTextElement({ id: 'el-1' })
    const page: PageDef = {
      id: 'p1',
      name: 'Page 1',
      width: 210,
      height: 297,
      background: '#ffffff',
      sections: [{ id: 's1', sectionType: 'body', height: 100, elements: [el] }],
    }
    const result = flattenPageElements(page)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('el-1')
  })

  it('returns empty array for page with empty sections', () => {
    const page: PageDef = {
      id: 'p1',
      name: 'Page 1',
      width: 210,
      height: 297,
      background: '#ffffff',
      sections: [{ id: 's1', sectionType: 'body', height: 100, elements: [] }],
    }
    expect(flattenPageElements(page)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// selectActivePageId
// ---------------------------------------------------------------------------

describe('selectActivePageId', () => {
  it('returns first page id when no active page is set', () => {
    const state = useReportStore.getState()
    const firstPageId = state.definition.pages[0]?.id
    const result = selectActivePageId(state)
    expect(result).toBe(firstPageId)
  })

  it('returns selected active page id when set', () => {
    const state = useReportStore.getState()
    const page = state.definition.pages[0]
    state.setActivePage(page.id)
    const updatedState = useReportStore.getState()
    expect(selectActivePageId(updatedState)).toBe(page.id)
  })

  it('returns null when no pages exist', () => {
    // Manually construct a minimal state for edge case
    const fakeState = {
      selection: { activePageId: null, selectedElementIds: [] },
      definition: { pages: [] },
    } as unknown as Parameters<typeof selectActivePageId>[0]
    expect(selectActivePageId(fakeState)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// selectActivePage
// ---------------------------------------------------------------------------

describe('selectActivePage', () => {
  it('returns the first page when no active page set', () => {
    const state = useReportStore.getState()
    const result = selectActivePage(state)
    expect(result).toBeTruthy()
    expect(result!.id).toBe(state.definition.pages[0].id)
  })

  it('returns the active page when explicitly set', () => {
    const store = useReportStore.getState()
    const page = store.definition.pages[0]
    store.setActivePage(page.id)
    const updatedState = useReportStore.getState()
    const result = selectActivePage(updatedState)
    expect(result).toBeTruthy()
    expect(result!.id).toBe(page.id)
  })

  it('returns null when no pages and no active page', () => {
    const fakeState = {
      selection: { activePageId: undefined, selectedElementIds: [] },
      definition: { pages: [] },
    } as unknown as Parameters<typeof selectActivePage>[0]
    expect(selectActivePage(fakeState)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// selectSelectedElements
// ---------------------------------------------------------------------------

describe('selectSelectedElements', () => {
  it('returns empty array when no elements selected', () => {
    const state = useReportStore.getState()
    expect(selectSelectedElements(state)).toEqual([])
  })

  it('returns selected elements', () => {
    const store = useReportStore.getState()
    const page = store.definition.pages[0]
    const el = createTextElement({ id: 'el-select-1' })
    store.addElement(page.id, el)
    store.selectElement(el.id, false)
    const state = useReportStore.getState()
    const result = selectSelectedElements(state)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('el-select-1')
  })

  it('returns multiple selected elements', () => {
    const store = useReportStore.getState()
    const page = store.definition.pages[0]
    const el1 = createTextElement({ id: 'el-m1' })
    const el2 = createShapeElement({ id: 'el-m2' })
    store.addElement(page.id, el1)
    store.addElement(page.id, el2)
    store.selectElement(el1.id, false)
    store.selectElement(el2.id, true) // multi-select
    const state = useReportStore.getState()
    const result = selectSelectedElements(state)
    expect(result).toHaveLength(2)
  })

  it('returns empty array when no pages', () => {
    const fakeState = {
      selection: { activePageId: null, selectedElementIds: ['el-1'] },
      definition: { pages: [] },
    } as unknown as Parameters<typeof selectSelectedElements>[0]
    expect(selectSelectedElements(fakeState)).toEqual([])
  })

  it('returns empty array when selected id does not match any element', () => {
    const state = useReportStore.getState()
    const fakeState = {
      ...state,
      selection: { ...state.selection, selectedElementIds: ['nonexistent-id'] },
    }
    expect(selectSelectedElements(fakeState)).toEqual([])
  })
})


// ---------------------------------------------------------------------------
// Phase 2: selectSchemaFieldKeyById
// ---------------------------------------------------------------------------

import { selectSchemaFieldKeyById } from './selectors'

describe('selectSchemaFieldKeyById', () => {
  it('存在するフィールドIDからキーを返す', () => {
    useReportStore.getState().addSchemaGroup('master')
    const groupId = useReportStore.getState().definition.schema!.groups[0].id
    useReportStore.getState().addSchemaField(groupId, { key: 'customer_name', label: '顧客名', type: 'string' })
    const fieldId = useReportStore.getState().definition.schema!.groups[0].fields[0].id

    const result = selectSchemaFieldKeyById(fieldId)(useReportStore.getState())
    expect(result).toBe('customer_name')
  })

  it('存在しないフィールドIDは undefined を返す', () => {
    const result = selectSchemaFieldKeyById('non-existent-id')(useReportStore.getState())
    expect(result).toBeUndefined()
  })

  it('スキーマが未定義の場合は undefined を返す', () => {
    expect(useReportStore.getState().definition.schema).toBeUndefined()
    const result = selectSchemaFieldKeyById('any-id')(useReportStore.getState())
    expect(result).toBeUndefined()
  })
})

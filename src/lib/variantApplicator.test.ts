import { describe, it, expect } from 'vitest'
import { applyVariant } from './variantApplicator'
import type { PageDef, ReportElement, OutputVariant } from '@/types'

// ---------------------------------------------------------------------------
// Minimal factories
// ---------------------------------------------------------------------------

function makeTextElement(id: string, content: string): ReportElement {
  return {
    id,
    type: 'text' as const,
    content,
    position: { x: 0, y: 0 },
    size: { width: 50, height: 10 },
    zIndex: 0,
    locked: false,
    visible: true,
    style: {},
  } as ReportElement
}

function makeShapeElement(id: string): ReportElement {
  return {
    id,
    type: 'shape' as const,
    shape: 'rectangle' as const,
    position: { x: 0, y: 0 },
    size: { width: 20, height: 20 },
    zIndex: 0,
    locked: false,
    visible: true,
  } as ReportElement
}

function makePage(elements: ReportElement[]): PageDef {
  return {
    id: 'p1',
    name: 'Page 1',
    width: 210,
    height: 297,
    background: '#ffffff',
    sections: [
      {
        id: 's1',
        sectionType: 'body',
        height: 297,
        elements,
      },
    ],
  }
}

function makeVariant(opts: Partial<OutputVariant> = {}): OutputVariant {
  return {
    id: 'v1',
    name: 'Test Variant',
    hiddenElementIds: [],
    maskingRules: [],
    ...opts,
  }
}

// ---------------------------------------------------------------------------
// applyVariant — null variant
// ---------------------------------------------------------------------------

describe('applyVariant — null variant', () => {
  it('returns original pages unchanged when variant is null', () => {
    const pages = [makePage([makeTextElement('e1', 'hello')])]
    const result = applyVariant(pages, null)
    expect(result).toBe(pages) // same reference
  })
})

// ---------------------------------------------------------------------------
// applyVariant — immutability
// ---------------------------------------------------------------------------

describe('applyVariant — immutability', () => {
  it('does not mutate original pages', () => {
    const el = makeTextElement('e1', 'original')
    const pages = [makePage([el])]
    const variant = makeVariant({ hiddenElementIds: ['e1'] })
    const result = applyVariant(pages, variant)

    expect(result).not.toBe(pages)
    expect(pages[0].sections[0].elements).toHaveLength(1) // original untouched
    expect(result[0].sections[0].elements).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// applyVariant — hiddenElementIds
// ---------------------------------------------------------------------------

describe('applyVariant — hiddenElementIds', () => {
  it('removes elements whose ids are in hiddenElementIds', () => {
    const el1 = makeTextElement('e1', 'visible')
    const el2 = makeTextElement('e2', 'hidden')
    const pages = [makePage([el1, el2])]
    const variant = makeVariant({ hiddenElementIds: ['e2'] })
    const result = applyVariant(pages, variant)
    const remaining = result[0].sections[0].elements
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe('e1')
  })

  it('removes multiple elements', () => {
    const elements = ['e1', 'e2', 'e3'].map((id) => makeTextElement(id, id))
    const pages = [makePage(elements)]
    const variant = makeVariant({ hiddenElementIds: ['e1', 'e3'] })
    const result = applyVariant(pages, variant)
    const ids = result[0].sections[0].elements.map((e) => e.id)
    expect(ids).toEqual(['e2'])
  })

  it('keeps all elements when hiddenElementIds is empty', () => {
    const elements = ['e1', 'e2'].map((id) => makeTextElement(id, id))
    const pages = [makePage(elements)]
    const result = applyVariant(pages, makeVariant())
    expect(result[0].sections[0].elements).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// applyVariant — fullReplace masking
// ---------------------------------------------------------------------------

describe('applyVariant — fullReplace masking', () => {
  it('replaces content of text elements', () => {
    const el = makeTextElement('e1', 'secret text')
    const variant = makeVariant({
      maskingRules: [{ id: 'r1', targetElementId: 'e1', type: 'fullReplace', replaceValue: '***' }],
    })
    const result = applyVariant([makePage([el])], variant)
    const resultEl = result[0].sections[0].elements[0]
    expect((resultEl as { content: string }).content).toBe('***')
  })

  it('replaces content of another text element', () => {
    const el = makeTextElement('e1', 'sensitive text')
    const variant = makeVariant({
      maskingRules: [{ id: 'r1', targetElementId: 'e1', type: 'fullReplace', replaceValue: 'MASKED' }],
    })
    const result = applyVariant([makePage([el])], variant)
    expect((result[0].sections[0].elements[0] as { content: string }).content).toBe('MASKED')
  })

  it('does not replace content of non-text elements', () => {
    const el = makeShapeElement('e1')
    const variant = makeVariant({
      maskingRules: [{ id: 'r1', targetElementId: 'e1', type: 'fullReplace', replaceValue: 'X' }],
    })
    const result = applyVariant([makePage([el])], variant)
    // shape returned as-is — no content field mutation
    expect(result[0].sections[0].elements[0]).toMatchObject({ id: 'e1', type: 'shape' })
  })

  it('does not apply masking to unrelated elements', () => {
    const el1 = makeTextElement('e1', 'keep')
    const el2 = makeTextElement('e2', 'secret')
    const variant = makeVariant({
      maskingRules: [{ id: 'r1', targetElementId: 'e2', type: 'fullReplace', replaceValue: '***' }],
    })
    const result = applyVariant([makePage([el1, el2])], variant)
    expect((result[0].sections[0].elements[0] as { content: string }).content).toBe('keep')
    expect((result[0].sections[0].elements[1] as { content: string }).content).toBe('***')
  })
})

// ---------------------------------------------------------------------------
// applyVariant — partial masking
// ---------------------------------------------------------------------------

describe('applyVariant — partial masking', () => {
  it('masks middle characters keeping first and last', () => {
    const el = makeTextElement('e1', '1234567890')
    const variant = makeVariant({
      maskingRules: [{ id: 'r1', targetElementId: 'e1', type: 'partial', keepFirst: 2, keepLast: 2 }],
    })
    const result = applyVariant([makePage([el])], variant)
    expect((result[0].sections[0].elements[0] as { content: string }).content).toBe('12******90')
  })

  it('masks all characters when keepFirst and keepLast are both 0', () => {
    const el = makeTextElement('e1', 'hello')
    const variant = makeVariant({
      maskingRules: [{ id: 'r1', targetElementId: 'e1', type: 'partial', keepFirst: 0, keepLast: 0 }],
    })
    const result = applyVariant([makePage([el])], variant)
    expect((result[0].sections[0].elements[0] as { content: string }).content).toBe('*****')
  })

  it('returns original when keepFirst + keepLast >= length', () => {
    const el = makeTextElement('e1', 'abc')
    const variant = makeVariant({
      maskingRules: [{ id: 'r1', targetElementId: 'e1', type: 'partial', keepFirst: 2, keepLast: 2 }],
    })
    const result = applyVariant([makePage([el])], variant)
    expect((result[0].sections[0].elements[0] as { content: string }).content).toBe('abc')
  })

  it('skips partial masking for non-text element types', () => {
    const el = makeShapeElement('e1')
    const variant = makeVariant({
      maskingRules: [{ id: 'r1', targetElementId: 'e1', type: 'partial', keepFirst: 1, keepLast: 1 }],
    })
    const result = applyVariant([makePage([el])], variant)
    // shape type is not 'text' — partial rule skips
    expect(result[0].sections[0].elements[0]).toMatchObject({ id: 'e1', type: 'shape' })
  })

  it('masks keepFirst only when keepLast omitted', () => {
    const el = makeTextElement('e1', 'abcdef')
    const variant = makeVariant({
      maskingRules: [{ id: 'r1', targetElementId: 'e1', type: 'partial', keepFirst: 2 }],
    })
    const result = applyVariant([makePage([el])], variant)
    expect((result[0].sections[0].elements[0] as { content: string }).content).toBe('ab****')
  })
})

// ---------------------------------------------------------------------------
// applyVariant — multi-page
// ---------------------------------------------------------------------------

describe('applyVariant — multi-page', () => {
  it('applies variant across all pages', () => {
    const page1 = makePage([makeTextElement('e1', 'page1 text')])
    const page2 = {
      ...makePage([makeTextElement('e2', 'page2 text')]),
      id: 'p2',
    }
    const variant = makeVariant({
      hiddenElementIds: ['e1'],
      maskingRules: [{ id: 'r1', targetElementId: 'e2', type: 'fullReplace', replaceValue: '---' }],
    })
    const result = applyVariant([page1, page2], variant)
    expect(result[0].sections[0].elements).toHaveLength(0)
    expect((result[1].sections[0].elements[0] as { content: string }).content).toBe('---')
  })
})

// ---------------------------------------------------------------------------
// applyPartialMask (shared with the client PDF fallback — issue #61)
// ---------------------------------------------------------------------------

import { applyPartialMask } from './variantApplicator'

describe('applyPartialMask', () => {
  it('keeps first and last chars, stars the middle', () => {
    expect(applyPartialMask('1234567890', 2, 2)).toBe('12******90')
  })

  it('returns the original when kept edges cover the whole string', () => {
    expect(applyPartialMask('123', 2, 2)).toBe('123')
    expect(applyPartialMask('', 1, 1)).toBe('')
  })

  it('defaults missing keep counts to zero', () => {
    expect(applyPartialMask('abcd')).toBe('****')
    expect(applyPartialMask('abcd', 1)).toBe('a***')
  })
})

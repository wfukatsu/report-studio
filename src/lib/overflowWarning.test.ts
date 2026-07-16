import { describe, it, expect } from 'vitest'
import { computeOverflowWarning } from './overflowWarning'
import type { RepeatingBandElement, RepeatingListElement, TextElement } from '@/types'

function makeBand(overrides: Partial<RepeatingBandElement> = {}): RepeatingBandElement {
  return {
    id: 'band-1',
    type: 'repeatingBand',
    position: { x: 10, y: 10 },
    size: { width: 100, height: 50 },
    zIndex: 1,
    locked: false,
    visible: true,
    dataSource: 'items',
    itemHeight: 8,
    fields: [],
    showHeader: false,
    showFooter: false,
    totals: [],
    pageBreak: 'none',
    maxItems: 0,
    oddRowColor: '#fff',
    evenRowColor: '#fff',
    borderColor: '#000',
    borderWidth: 0.3,
    ...overrides,
  }
}

function makeList(overrides: Partial<RepeatingListElement> = {}): RepeatingListElement {
  return {
    id: 'list-1',
    type: 'repeatingList',
    position: { x: 10, y: 10 },
    size: { width: 100, height: 50 },
    zIndex: 1,
    locked: false,
    visible: true,
    dataSource: 'items',
    layout: 'vertical',
    gridColumns: 2,
    itemWidth: 40,
    itemHeight: 20,
    gap: 0,
    fields: [],
    maxItems: 0,
    pageBreak: 'none',
    ...overrides,
  }
}

function records(n: number): Record<string, unknown> {
  return { items: Array.from({ length: n }, (_, i) => ({ name: `品目${i + 1}` })) }
}

describe('computeOverflowWarning — repeatingBand', () => {
  it('returns null when all records fit', () => {
    // height 50 / itemHeight 8 = 6 rows; 5 records fit
    expect(computeOverflowWarning(makeBand(), records(5))).toBeNull()
  })

  it('warns when records exceed the frame capacity', () => {
    // 6 rows fit, 10 records bound
    const w = computeOverflowWarning(makeBand(), records(10))
    expect(w).toEqual({ intended: 10, visible: 6 })
  })

  it('accounts for header and footer rows', () => {
    // available = 50 - header 8 - footer 8 = 34 → 4 rows
    const el = makeBand({
      showHeader: true,
      showFooter: true,
      totals: [{ fieldKey: 'amount', type: 'sum', label: '合計' } as never],
    })
    const w = computeOverflowWarning(el, records(10))
    expect(w).toEqual({ intended: 10, visible: 4 })
  })

  it('uses explicit headerHeight when set', () => {
    // available = 50 - 18 = 32 → 4 rows
    const el = makeBand({ showHeader: true, headerHeight: 18 })
    const w = computeOverflowWarning(el, records(10))
    expect(w).toEqual({ intended: 10, visible: 4 })
  })

  it('does not warn about records dropped by maxItems (designer choice)', () => {
    // 6 rows fit; maxItems 5 → intended 5 → fits
    expect(computeOverflowWarning(makeBand({ maxItems: 5 }), records(100))).toBeNull()
  })

  it('warns when even maxItems-capped records do not fit', () => {
    const w = computeOverflowWarning(makeBand({ maxItems: 8 }), records(100))
    expect(w).toEqual({ intended: 8, visible: 6 })
  })

  it('returns null for empty or unbound data', () => {
    expect(computeOverflowWarning(makeBand(), records(0))).toBeNull()
    expect(computeOverflowWarning(makeBand(), { other: [1, 2, 3] })).toBeNull()
    expect(computeOverflowWarning(makeBand(), undefined)).toBeNull()
  })

  it('returns null for zero itemHeight (no geometry to estimate)', () => {
    expect(computeOverflowWarning(makeBand({ itemHeight: 0 }), records(10))).toBeNull()
  })
})

describe('computeOverflowWarning — repeatingList', () => {
  it('vertical: warns when items exceed height', () => {
    // (50 + 0) / (20 + 0) = 2 items fit
    const w = computeOverflowWarning(makeList(), records(5))
    expect(w).toEqual({ intended: 5, visible: 2 })
  })

  it('horizontal: fits by width', () => {
    // (100 + 0) / (40 + 0) = 2 items fit
    const w = computeOverflowWarning(makeList({ layout: 'horizontal' }), records(3))
    expect(w).toEqual({ intended: 3, visible: 2 })
  })

  it('grid: cols × rows', () => {
    // rows = 50/20 = 2, cols = 2 → 4 fit
    const w = computeOverflowWarning(makeList({ layout: 'grid' }), records(6))
    expect(w).toEqual({ intended: 6, visible: 4 })
  })

  it('accounts for gap', () => {
    // (50 + 5) / (20 + 5) = 2 items fit
    const w = computeOverflowWarning(makeList({ gap: 5 }), records(3))
    expect(w).toEqual({ intended: 3, visible: 2 })
  })

  it('returns null when everything fits', () => {
    expect(computeOverflowWarning(makeList(), records(2))).toBeNull()
  })
})

describe('computeOverflowWarning — other element types', () => {
  it('returns null for non-data elements', () => {
    const text: TextElement = {
      id: 't1', type: 'text', position: { x: 0, y: 0 }, size: { width: 10, height: 10 },
      zIndex: 1, locked: false, visible: true, content: 'x', style: {},
    }
    expect(computeOverflowWarning(text, records(10))).toBeNull()
  })
})

/**
 * canvasGeometry — pure drag/drop/snap math extracted from ReportCanvas (#223).
 */
import { describe, it, expect } from 'vitest'
import { snapAxis, findSectionAtY, topmostElementAt } from './canvasGeometry'

describe('snapAxis', () => {
  it('returns the raw value when snapping is off', () => {
    expect(snapAxis(7.3, undefined, 10, 10, 210, false, 5)).toBe(7.3)
  })

  it('snaps to the nearest grid multiple when snapping is on', () => {
    // 7 / 5 = 1.4 → rounds to 1 → 5mm; 8 / 5 = 1.6 → rounds to 2 → 10mm
    expect(snapAxis(7, undefined, 10, 10, 210, true, 5)).toBe(5)
    expect(snapAxis(8, undefined, 10, 10, 210, true, 5)).toBe(10)
  })

  it('prefers the near-margin boundary over the grid when it is closer', () => {
    // marginNear=12 is off-grid; value 12.3 grid-snaps to 10 (dist 2.3) but the
    // margin at 12 is only 0.3 away → margin wins.
    expect(snapAxis(12.3, undefined, 12, 10, 210, true, 5)).toBe(12)
  })

  it('does NOT snap to a margin outside the threshold', () => {
    // value 20 is 8mm from the margin at 12 → beyond the 1mm threshold, so the
    // grid snap (20 → 20) stands.
    expect(snapAxis(20, undefined, 12, 10, 210, true, 5)).toBe(20)
  })

  it('snaps the far edge so the element aligns with the far margin', () => {
    // pageSize 100, marginFar 8 → far boundary at 92. element width 20, near
    // edge 71.5 ⇒ far edge 91.5 (0.5 from boundary) beats grid snap to 70.
    // Result places the near edge at 92 - 20 = 72.
    expect(snapAxis(71.5, 20, 10, 8, 100, true, 5)).toBe(72)
  })

  it('skips far-edge snapping when the element size is unknown', () => {
    // Same geometry as above but no elementSize → only grid/near-margin apply.
    expect(snapAxis(71.5, undefined, 10, 8, 100, true, 5)).toBe(70)
  })

  it('honours a custom threshold', () => {
    // value 13 grid-snaps to 15 (dist 2); the off-grid margin at 12 is 1mm away.
    // 1mm is NOT < the default 1mm threshold → grid wins; but < a 5mm threshold.
    expect(snapAxis(13, undefined, 12, 10, 210, true, 5)).toBe(15)
    expect(snapAxis(13, undefined, 12, 10, 210, true, 5, 5)).toBe(12)
  })
})

describe('findSectionAtY', () => {
  const sections = [
    { id: 'header', height: 100 },
    { id: 'body', height: 50 },
    { id: 'footer', height: 30 },
  ]

  it('locates the first section for a Y within it', () => {
    expect(findSectionAtY(sections, 30)).toEqual({
      section: sections[0],
      sectionOffsetY: 0,
      relativeY: 30,
    })
  })

  it('locates a later section and reports the offset + relative Y', () => {
    expect(findSectionAtY(sections, 120)).toEqual({
      section: sections[1],
      sectionOffsetY: 100,
      relativeY: 20,
    })
  })

  it('assigns an exact boundary to the section below it', () => {
    // y=100 is the top edge of the body section, not the bottom of the header.
    expect(findSectionAtY(sections, 100)).toEqual({
      section: sections[1],
      sectionOffsetY: 100,
      relativeY: 0,
    })
  })

  it('returns an undefined section when Y is past every section', () => {
    // total stacked height = 180
    expect(findSectionAtY(sections, 200)).toEqual({
      section: undefined,
      sectionOffsetY: 180,
      relativeY: 20,
    })
  })

  it('handles an empty section list', () => {
    expect(findSectionAtY([], 42)).toEqual({
      section: undefined,
      sectionOffsetY: 0,
      relativeY: 42,
    })
  })
})

describe('topmostElementAt', () => {
  const box = (id: string, zIndex: number, x: number, y: number, w = 20, h = 20) => ({
    id,
    zIndex,
    position: { x, y },
    size: { width: w, height: h },
  })

  it('returns the highest-zIndex element containing the point', () => {
    const lo = box('lo', 1, 0, 0)
    const hi = box('hi', 5, 0, 0)
    expect(topmostElementAt([lo, hi], 5, 5)?.id).toBe('hi')
  })

  it('ignores elements that do not contain the point', () => {
    const a = box('a', 1, 0, 0)
    const b = box('b', 9, 100, 100)
    expect(topmostElementAt([a, b], 5, 5)?.id).toBe('a')
  })

  it('treats the box edges as inclusive', () => {
    const a = box('a', 1, 10, 10, 20, 20) // covers x∈[10,30], y∈[10,30]
    expect(topmostElementAt([a], 10, 10)?.id).toBe('a') // top-left corner
    expect(topmostElementAt([a], 30, 30)?.id).toBe('a') // bottom-right corner
    expect(topmostElementAt([a], 31, 30)).toBeUndefined() // just outside
  })

  it('applies the predicate filter', () => {
    const band = { ...box('band', 1, 0, 0), type: 'repeatingBand' }
    const text = { ...box('text', 9, 0, 0), type: 'text' }
    // Higher zIndex text is rejected by the predicate → the band is returned.
    const hit = topmostElementAt(
      [band, text],
      5,
      5,
      (el) => el.type === 'repeatingBand',
    )
    expect(hit?.id).toBe('band')
  })

  it('returns undefined when nothing matches', () => {
    expect(topmostElementAt([box('a', 1, 0, 0)], 500, 500)).toBeUndefined()
  })

  it('resolves a zIndex tie to the earlier element (stable order)', () => {
    const first = box('first', 3, 0, 0)
    const second = box('second', 3, 0, 0)
    expect(topmostElementAt([first, second], 5, 5)?.id).toBe('first')
  })

  it('does not mutate the input array order', () => {
    const els = [box('a', 1, 0, 0), box('b', 9, 0, 0)]
    topmostElementAt(els, 5, 5)
    expect(els.map((e) => e.id)).toEqual(['a', 'b'])
  })
})

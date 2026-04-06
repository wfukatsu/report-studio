import { describe, it, expect } from 'vitest'
import { getPageDimensions, PAPER_SIZES } from './paperSizes'

describe('getPageDimensions', () => {
  it('returns portrait A4 dimensions', () => {
    const dims = getPageDimensions('A4', 'portrait')
    expect(dims).toEqual(PAPER_SIZES.A4)
  })

  it('returns landscape A4 as swapped dimensions', () => {
    const dims = getPageDimensions('A4', 'landscape')
    expect(dims.width).toBe(PAPER_SIZES.A4.height)
    expect(dims.height).toBe(PAPER_SIZES.A4.width)
  })

  it('respects custom dimensions in portrait', () => {
    const dims = getPageDimensions('custom', 'portrait', 500, 700)
    expect(dims).toEqual({ width: 500, height: 700 })
  })

  it('swaps custom dimensions for landscape', () => {
    const dims = getPageDimensions('custom', 'landscape', 500, 700)
    expect(dims).toEqual({ width: 700, height: 500 })
  })
})

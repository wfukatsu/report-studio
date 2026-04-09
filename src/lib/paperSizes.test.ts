import { describe, it, expect } from 'vitest'
import { getPageDimensions, PAPER_SIZES, mmToPx, pxToMm } from './paperSizes'

describe('getPageDimensions', () => {
  it('returns portrait A4 dimensions', () => {
    const dims = getPageDimensions('A4', 'portrait')
    expect(dims).toEqual({ width: 210, height: 297 })
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

  it('uses default custom dimensions when not provided', () => {
    const dims = getPageDimensions('custom', 'portrait')
    expect(dims).toEqual({ width: 210, height: 297 })
  })
})

describe('mmToPx', () => {
  it('converts mm to px at default 96 DPI', () => {
    const result = mmToPx(25.4)
    expect(result).toBeCloseTo(96, 0)
  })

  it('converts mm to px at custom DPI', () => {
    const result = mmToPx(25.4, 72)
    expect(result).toBeCloseTo(72, 0)
  })

  it('converts zero correctly', () => {
    expect(mmToPx(0)).toBe(0)
  })
})

describe('pxToMm', () => {
  it('converts px to mm at default 96 DPI', () => {
    const result = pxToMm(96)
    expect(result).toBeCloseTo(25.4, 1)
  })

  it('converts px to mm at custom DPI', () => {
    const result = pxToMm(72, 72)
    expect(result).toBeCloseTo(25.4, 1)
  })

  it('converts zero correctly', () => {
    expect(pxToMm(0)).toBe(0)
  })
})

import { describe, it, expect } from 'vitest'
import {
  MM_TO_PX,
  DEFAULT_FONT_SIZE,
  DEFAULT_LINE_HEIGHT,
  FONT_FAMILIES,
  DEFAULT_CHART_COLORS,
  UPLOAD_CONSTRAINTS,
  DEFAULT_BORDER_WIDTH,
  DEFAULT_FURIGANA_SCALE,
} from './constants'

describe('constants', () => {
  it('MM_TO_PX is the correct conversion factor for 96dpi', () => {
    // 1 inch = 25.4mm, 1 inch = 96px → 1mm = 96/25.4 ≈ 3.7795
    expect(MM_TO_PX).toBeCloseTo(96 / 25.4, 4)
  })

  it('DEFAULT_FONT_SIZE is a reasonable pt value', () => {
    expect(DEFAULT_FONT_SIZE).toBeGreaterThan(0)
    expect(DEFAULT_FONT_SIZE).toBeLessThan(72)
  })

  it('DEFAULT_LINE_HEIGHT is a reasonable unitless value', () => {
    expect(DEFAULT_LINE_HEIGHT).toBeGreaterThanOrEqual(1)
    expect(DEFAULT_LINE_HEIGHT).toBeLessThanOrEqual(3)
  })

  it('FONT_FAMILIES includes at least generic and Japanese fonts', () => {
    expect(FONT_FAMILIES).toContain('sans-serif')
    expect(FONT_FAMILIES).toContain('Noto Sans JP')
    expect(FONT_FAMILIES.length).toBeGreaterThanOrEqual(5)
  })

  it('DEFAULT_CHART_COLORS has at least 5 colors', () => {
    expect(DEFAULT_CHART_COLORS.length).toBeGreaterThanOrEqual(5)
    for (const color of DEFAULT_CHART_COLORS) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('UPLOAD_CONSTRAINTS has valid size limits', () => {
    expect(UPLOAD_CONSTRAINTS.maxServerSize).toBeGreaterThan(UPLOAD_CONSTRAINTS.maxBase64Size)
    expect(UPLOAD_CONSTRAINTS.allowedMimes.length).toBeGreaterThan(0)
  })

  it('DEFAULT_BORDER_WIDTH is a positive mm value', () => {
    expect(DEFAULT_BORDER_WIDTH).toBeGreaterThan(0)
    expect(DEFAULT_BORDER_WIDTH).toBeLessThan(5)
  })

  it('DEFAULT_FURIGANA_SCALE is between 0 and 1', () => {
    expect(DEFAULT_FURIGANA_SCALE).toBeGreaterThan(0)
    expect(DEFAULT_FURIGANA_SCALE).toBeLessThan(1)
  })
})

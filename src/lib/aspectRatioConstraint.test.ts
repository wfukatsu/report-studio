import { describe, it, expect } from 'vitest'
import { constrainAspectRatio } from './aspectRatioConstraint'

const START_W = 100
const START_H = 50  // ratio = 2

describe('constrainAspectRatio — width dominant (widthChange >= heightChange)', () => {
  it('derives height from width when width changes more', () => {
    const { width, height } = constrainAspectRatio(120, 51, START_W, START_H, 2)
    expect(width / height).toBeCloseTo(2, 5)
    expect(width).toBeCloseTo(120, 5)
  })

  it('equal change uses width (tie-breaker)', () => {
    const { width, height } = constrainAspectRatio(110, 55, START_W, START_H, 2)
    // widthChange == heightChange == 5 → width dominant
    expect(width / height).toBeCloseTo(2, 5)
  })
})

describe('constrainAspectRatio — height dominant', () => {
  it('derives width from height when height changes more', () => {
    const { width, height } = constrainAspectRatio(101, 80, START_W, START_H, 2)
    expect(width / height).toBeCloseTo(2, 5)
    expect(height).toBeCloseTo(80, 5)
  })
})

describe('constrainAspectRatio — MIN_SIZE_MM clamping', () => {
  it('clamps to min and re-derives opposite axis when width hits floor (ratio=2)', () => {
    // Force width to go below 5mm
    const { width, height } = constrainAspectRatio(2, START_H, START_W, START_H, 2)
    expect(width).toBeGreaterThanOrEqual(5)
    expect(height).toBeGreaterThanOrEqual(5)
    expect(width / height).toBeCloseTo(2, 1)
  })

  it('clamps to min and re-derives opposite axis when height hits floor (ratio=2)', () => {
    const { width, height } = constrainAspectRatio(START_W, 1, START_W, START_H, 2)
    expect(width).toBeGreaterThanOrEqual(5)
    expect(height).toBeGreaterThanOrEqual(5)
  })
})

describe('constrainAspectRatio — edge cases', () => {
  it('handles ratio = 1 (square)', () => {
    const { width, height } = constrainAspectRatio(80, 50, 60, 60, 1)
    expect(width / height).toBeCloseTo(1, 5)
  })

  it('handles shrink in both axes', () => {
    const { width, height } = constrainAspectRatio(80, 30, START_W, START_H, 2)
    // widthChange=20, heightChange=20 → tie → width dominant
    expect(width / height).toBeCloseTo(2, 5)
  })

  it('returns non-negative values', () => {
    const { width, height } = constrainAspectRatio(3, 1, START_W, START_H, 2)
    expect(width).toBeGreaterThan(0)
    expect(height).toBeGreaterThan(0)
  })
})

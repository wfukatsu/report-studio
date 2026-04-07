import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { clampZoom, computeFitZoom, FitWidthIcon, FitPageIcon } from './zoomUtils'
import type { PageDef } from '@/types'

const A4_PAGE: PageDef = {
  id: 'page-1',
  name: 'Page 1',
  width: 210,
  height: 297,
  background: '#ffffff',
  sections: [],
}

describe('clampZoom', () => {
  it('returns value within bounds when in range', () => {
    expect(clampZoom(1.0)).toBe(1.0)
    expect(clampZoom(1.5)).toBe(1.5)
  })

  it('clamps to minimum', () => {
    const result = clampZoom(0.01)
    expect(result).toBeGreaterThan(0)
  })

  it('clamps to maximum', () => {
    const result = clampZoom(100)
    expect(result).toBeLessThanOrEqual(3)
  })
})

describe('computeFitZoom', () => {
  it('returns default {1, 1} when containerRef.current is null', () => {
    const ref = { current: null }
    const result = computeFitZoom(ref, A4_PAGE)
    expect(result).toEqual({ fitWidth: 1, fitPage: 1 })
  })

  it('computes fit-width and fit-page based on container dimensions', () => {
    const el = document.createElement('div')
    Object.defineProperty(el, 'clientWidth', { value: 800, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: 600, configurable: true })

    const ref = { current: el }
    const result = computeFitZoom(ref, A4_PAGE)

    expect(result.fitWidth).toBeGreaterThan(0)
    expect(result.fitPage).toBeGreaterThan(0)
    expect(result.fitWidth).toBeGreaterThanOrEqual(result.fitPage)
  })

  it('respects ZOOM_MIN and ZOOM_MAX constraints', () => {
    // Very small container
    const el = document.createElement('div')
    Object.defineProperty(el, 'clientWidth', { value: 10, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: 10, configurable: true })

    const ref = { current: el }
    const result = computeFitZoom(ref, A4_PAGE)

    expect(result.fitWidth).toBeGreaterThan(0)
    expect(result.fitPage).toBeGreaterThan(0)
  })
})

describe('FitWidthIcon', () => {
  it('renders an svg', () => {
    const { container } = render(<FitWidthIcon />)
    expect(container.querySelector('svg')).toBeTruthy()
  })
})

describe('FitPageIcon', () => {
  it('renders an svg', () => {
    const { container } = render(<FitPageIcon />)
    expect(container.querySelector('svg')).toBeTruthy()
  })
})

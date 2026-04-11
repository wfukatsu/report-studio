import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ImageRenderer } from './Renderer'
import { isSafeImageSrc } from '@/lib/exportUtils'
import type { ImageElement } from '@/types'

function makeElement(overrides: Partial<ImageElement> = {}): ImageElement {
  return {
    id: 'img-1',
    type: 'image',
    position: { x: 0, y: 0 },
    size: { width: 40, height: 26 },
    zIndex: 1,
    visible: true,
    locked: false,
    src: '',
    alt: '',
    objectFit: 'contain',
    opacity: 1,
    ...overrides,
  } as ImageElement
}

describe('ImageRenderer — 画像なし', () => {
  it('shows placeholder when src is empty', () => {
    render(<ImageRenderer element={makeElement({ src: '' })} />)
    expect(screen.getByText(/画像/)).toBeInTheDocument()
  })

  it('shows placeholder when src is unsafe (javascript:)', () => {
    render(<ImageRenderer element={makeElement({ src: 'javascript:alert(1)' })} />)
    expect(screen.getByText(/画像/)).toBeInTheDocument()
  })
})

describe('ImageRenderer — SVGファイル', () => {
  // Use an inline, self-contained SVG — tests must not depend on filesystem files
  // that may not be present in CI or on a fresh clone.
  const safeSvgXml = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="50" fill="#0066cc"/></svg>'
  const svgBase64 = btoa(safeSvgXml)
  const svgDataUrl = 'data:image/svg+xml;base64,' + svgBase64

  it('isSafeImageSrc accepts a clean SVG data URL', () => {
    expect(isSafeImageSrc(svgDataUrl)).toBe(true)
  })

  it('isSafeImageSrc rejects an SVG containing <script>', () => {
    // btoa('<svg><script>alert(1)</script></svg>')
    const xssSvg = 'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+'
    expect(isSafeImageSrc(xssSvg)).toBe(false)
  })

  it('renders SVG data URL as img (not placeholder)', () => {
    const { container } = render(
      <ImageRenderer element={makeElement({ src: svgDataUrl, alt: 'Logo' })} />,
    )
    const img = container.querySelector('img')
    expect(img).toBeInTheDocument()
    expect(img!.getAttribute('src')).toBe(svgDataUrl)
    expect(screen.queryByText(/画像/)).not.toBeInTheDocument()
  })
})

describe('ImageRenderer — 画像あり', () => {
  it('renders img element with safe http src', () => {
    const { container } = render(
      <ImageRenderer element={makeElement({ src: 'https://example.com/img.png', alt: 'test' })} />,
    )
    const img = container.querySelector('img')!
    expect(img).toBeInTheDocument()
    expect(img.getAttribute('src')).toBe('https://example.com/img.png')
    expect(img.getAttribute('alt')).toBe('test')
  })

  it('renders img with data URI src', () => {
    const src = 'data:image/png;base64,abc123'
    const { container } = render(
      <ImageRenderer element={makeElement({ src })} />,
    )
    const img = container.querySelector('img')!
    expect(img).toBeInTheDocument()
  })

  it('applies opacity style', () => {
    const { container } = render(
      <ImageRenderer element={makeElement({ src: 'https://example.com/img.png', opacity: 0.5 })} />,
    )
    const img = container.querySelector('img')!
    expect(img.style.opacity).toBe('0.5')
  })
})

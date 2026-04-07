import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RevenueStampRenderer } from './Renderer'
import type { RevenueStampElement } from '@/types'

function makeElement(overrides: Partial<RevenueStampElement> = {}): RevenueStampElement {
  return {
    id: 'rs-1',
    type: 'revenueStamp',
    position: { x: 10, y: 10 },
    size: { width: 30, height: 30 },
    zIndex: 1,
    visible: true,
    locked: false,
    borderColor: '#000000',
    borderWidth: 0.3,
    showLabel: true,
    showCancellationGuide: false,
    amount: '200円',
    ...overrides,
  } as RevenueStampElement
}

describe('RevenueStampRenderer', () => {
  it('renders without error', () => {
    const { container } = render(<RevenueStampRenderer element={makeElement()} />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('shows 収入印紙 label when showLabel is true', () => {
    render(<RevenueStampRenderer element={makeElement({ showLabel: true })} />)
    expect(screen.getByText('収入印紙')).toBeInTheDocument()
  })

  it('hides label when showLabel is false', () => {
    render(<RevenueStampRenderer element={makeElement({ showLabel: false })} />)
    expect(screen.queryByText('収入印紙')).not.toBeInTheDocument()
  })

  it('shows amount when provided', () => {
    render(<RevenueStampRenderer element={makeElement({ amount: '200円' })} />)
    expect(screen.getByText('200円')).toBeInTheDocument()
  })

  it('does not show amount when not set', () => {
    render(<RevenueStampRenderer element={makeElement({ amount: undefined })} />)
    expect(screen.queryByText(/円/)).not.toBeInTheDocument()
  })

  it('renders cancellation guide SVG when showCancellationGuide is true', () => {
    const { container } = render(
      <RevenueStampRenderer element={makeElement({ showCancellationGuide: true })} />,
    )
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})

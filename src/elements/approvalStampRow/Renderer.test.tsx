import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ApprovalStampRowRenderer } from './Renderer'
import type { ApprovalStampRowElement } from '@/types'

function makeElement(overrides: Partial<ApprovalStampRowElement> = {}): ApprovalStampRowElement {
  return {
    id: 'asr-1',
    type: 'approvalStampRow',
    position: { x: 10, y: 10 },
    size: { width: 75, height: 20 },
    zIndex: 1,
    visible: true,
    locked: false,
    cells: [
      { role: '担当', width: 15 },
      { role: '係長', width: 15 },
      { role: '課長', width: 15 },
    ],
    labelPosition: 'bottom',
    borderColor: '#000000',
    borderWidth: 0.3,
    cellHeight: 15,
    ...overrides,
  } as ApprovalStampRowElement
}

describe('ApprovalStampRowRenderer', () => {
  it('renders without error', () => {
    const { container } = render(<ApprovalStampRowRenderer element={makeElement()} />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders all cell role labels at the bottom', () => {
    render(<ApprovalStampRowRenderer element={makeElement({ labelPosition: 'bottom' })} />)
    expect(screen.getByText('担当')).toBeInTheDocument()
    expect(screen.getByText('係長')).toBeInTheDocument()
    expect(screen.getByText('課長')).toBeInTheDocument()
  })

  it('renders labels at the top when labelPosition is top', () => {
    render(<ApprovalStampRowRenderer element={makeElement({ labelPosition: 'top' })} />)
    expect(screen.getByText('担当')).toBeInTheDocument()
  })

  it('renders cells with correct count', () => {
    const { container } = render(<ApprovalStampRowRenderer element={makeElement()} />)
    // 3 cells
    const cellDivs = container.querySelectorAll('div > div')
    expect(cellDivs.length).toBeGreaterThan(0)
  })
})

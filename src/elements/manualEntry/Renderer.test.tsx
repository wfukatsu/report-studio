import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ManualEntryRenderer } from './Renderer'
import type { ManualEntryField } from '@/types'

function makeElement(overrides: Partial<ManualEntryField> = {}): ManualEntryField {
  return {
    id: 'me-1',
    type: 'manualEntry',
    position: { x: 10, y: 10 },
    size: { width: 60, height: 8 },
    zIndex: 1,
    visible: true,
    locked: false,
    label: '記入欄',
    labelPosition: 'top',
    displayMode: 'line',
    lineColor: '#000000',
    placeholder: '（記入）',
    style: { fontSize: 3.5, color: '#000000' },
    ...overrides,
  } as ManualEntryField
}

describe('ManualEntryRenderer', () => {
  it('renders the label', () => {
    render(<ManualEntryRenderer element={makeElement()} />)
    expect(screen.getByText('記入欄')).toBeInTheDocument()
  })

  it('renders the placeholder', () => {
    render(<ManualEntryRenderer element={makeElement({ placeholder: 'ここに入力' })} />)
    expect(screen.getByText('ここに入力')).toBeInTheDocument()
  })

  it('hides label when labelPosition is none', () => {
    render(<ManualEntryRenderer element={makeElement({ labelPosition: 'none' })} />)
    expect(screen.queryByText('記入欄')).not.toBeInTheDocument()
  })

  it('renders without error for box display mode', () => {
    const { container } = render(
      <ManualEntryRenderer element={makeElement({ displayMode: 'box' })} />,
    )
    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders grid SVG when displayMode is grid and gridCount set', () => {
    const { container } = render(
      <ManualEntryRenderer element={makeElement({ displayMode: 'grid', gridCount: 5 })} />,
    )
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders without border or grid when displayMode is none', () => {
    const { container } = render(
      <ManualEntryRenderer element={makeElement({ displayMode: 'none' })} />,
    )
    // No border on the inner div
    const inner = container.querySelector('div > div') as HTMLDivElement
    expect(inner.style.border).toBeFalsy()
    expect(inner.style.borderBottom).toBeFalsy()
    // No SVG grid
    expect(container.querySelector('svg')).not.toBeInTheDocument()
    // Element is still present in the DOM
    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders without error for left label position', () => {
    const { container } = render(
      <ManualEntryRenderer element={makeElement({ labelPosition: 'left' })} />,
    )
    expect(container.firstChild).toBeInTheDocument()
    expect(screen.getByText('記入欄')).toBeInTheDocument()
  })

  describe('furiganaEnabled', () => {
    it('does not show フリガナ zone when furiganaEnabled is false (default)', () => {
      render(<ManualEntryRenderer element={makeElement()} />)
      expect(screen.queryByText('フリガナ')).not.toBeInTheDocument()
    })

    it('shows フリガナ zone when furiganaEnabled is true', () => {
      render(<ManualEntryRenderer element={makeElement({ furiganaEnabled: true })} />)
      expect(screen.getByText('フリガナ')).toBeInTheDocument()
    })

    it('displays resolved furiganaDataSource value in the furigana zone', () => {
      render(
        <ManualEntryRenderer
          element={makeElement({ furiganaEnabled: true, furiganaDataSource: 'name.furigana' })}
          data={{ name: { furigana: 'ヤマダ タロウ' } }}
        />,
      )
      expect(screen.getByText('ヤマダ タロウ')).toBeInTheDocument()
    })

    it('shows empty furigana zone when data field is missing', () => {
      render(
        <ManualEntryRenderer
          element={makeElement({ furiganaEnabled: true, furiganaDataSource: 'name.furigana' })}
          data={{}}
        />,
      )
      expect(screen.getByText('フリガナ')).toBeInTheDocument()
      // no error thrown, furigana zone still renders
    })

    it('still shows main label when furiganaEnabled is true', () => {
      render(
        <ManualEntryRenderer element={makeElement({ furiganaEnabled: true, label: '氏名' })} />,
      )
      expect(screen.getByText('氏名')).toBeInTheDocument()
    })
  })
})

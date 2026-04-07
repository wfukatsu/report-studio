import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DataFieldRenderer } from './Renderer'
import type { DataFieldElement } from '@/types'

function makeElement(overrides: Partial<DataFieldElement> = {}): DataFieldElement {
  return {
    id: 'df-1',
    type: 'dataField',
    position: { x: 10, y: 10 },
    size: { width: 50, height: 8 },
    zIndex: 1,
    visible: true,
    locked: false,
    fieldKey: 'customer.name',
    label: '顧客名',
    style: { fontSize: 3.5, fontWeight: 'normal', color: '#000000', textAlign: 'left' },
    ...overrides,
  } as DataFieldElement
}

describe('DataFieldRenderer', () => {
  it('shows label as placeholder when no data provided', () => {
    render(<DataFieldRenderer element={makeElement()} data={{}} />)
    expect(screen.getByText('顧客名')).toBeInTheDocument()
  })

  it('shows fieldKey as placeholder when no label', () => {
    render(<DataFieldRenderer element={makeElement({ label: undefined })} data={{}} />)
    expect(screen.getByText('customer.name')).toBeInTheDocument()
  })

  it('renders resolved field value from data', () => {
    render(
      <DataFieldRenderer
        element={makeElement({ fieldKey: 'name' })}
        data={{ name: 'Taro' }}
      />,
    )
    expect(screen.getByText('Taro')).toBeInTheDocument()
  })

  it('resolves nested dot-notation field path', () => {
    render(
      <DataFieldRenderer
        element={makeElement({ fieldKey: 'customer.name' })}
        data={{ customer: { name: '山田太郎' } }}
      />,
    )
    expect(screen.getByText('山田太郎')).toBeInTheDocument()
  })

  it('shows label as placeholder when field is not found (no fallbackText)', () => {
    render(
      <DataFieldRenderer
        element={makeElement({ fieldKey: 'missing' })}
        data={{}}
      />,
    )
    // No fallbackText → shows label as placeholder
    expect(screen.getByText('顧客名')).toBeInTheDocument()
  })

  it('renders raw value as string when format is provided', () => {
    render(
      <DataFieldRenderer
        element={makeElement({ fieldKey: 'amount' })}
        data={{ amount: 1000 }}
      />,
    )
    // Without format, raw value is converted to string
    expect(screen.getByText('1000')).toBeInTheDocument()
  })
})

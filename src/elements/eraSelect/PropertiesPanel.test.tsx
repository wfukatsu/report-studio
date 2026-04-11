import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EraSelectPropertiesPanel } from './PropertiesPanel'
import type { EraSelectElement } from '@/types'

function makeEl(overrides?: Partial<EraSelectElement>): EraSelectElement {
  return {
    id: 'era-1', type: 'eraSelect',
    position: { x: 0, y: 0 }, size: { width: 30, height: 10 },
    zIndex: 1, visible: true, locked: false,
    ...overrides,
  }
}

describe('EraSelectPropertiesPanel', () => {
  it('renders without error', () => {
    render(<EraSelectPropertiesPanel el={makeEl()} onChange={vi.fn()} />)
    expect(screen.getByText('元号選択')).toBeInTheDocument()
  })

  it('shows default eras as toggle buttons', () => {
    render(<EraSelectPropertiesPanel el={makeEl()} onChange={vi.fn()} />)
    expect(screen.getByText('令')).toBeInTheDocument()
    expect(screen.getByText('平')).toBeInTheDocument()
  })

  it('calls onChange with updated eras when an era is toggled off', () => {
    const onChange = vi.fn()
    render(<EraSelectPropertiesPanel el={makeEl({ eras: ['明', '大', '昭', '平', '令'] })} onChange={onChange} />)
    fireEvent.click(screen.getByText('昭'))
    expect(onChange).toHaveBeenCalled()
    const call = onChange.mock.calls[0][0]
    expect(call.eras).not.toContain('昭')
  })

  it('does not remove last era (minimum 1 required)', () => {
    const onChange = vi.fn()
    render(<EraSelectPropertiesPanel el={makeEl({ eras: ['令'] })} onChange={onChange} />)
    fireEvent.click(screen.getByText('令'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('calls onChange when layout changes to row', () => {
    const onChange = vi.fn()
    render(<EraSelectPropertiesPanel el={makeEl()} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('横1行'))
    expect(onChange).toHaveBeenCalledWith({ layout: 'row' })
  })

  it('calls onChange when dataSource changes', () => {
    const onChange = vi.fn()
    render(<EraSelectPropertiesPanel el={makeEl()} onChange={onChange} />)
    const input = screen.getByPlaceholderText('例: employee.era')
    fireEvent.change(input, { target: { value: 'person.era' } })
    expect(onChange).toHaveBeenCalledWith({ dataSource: 'person.era' })
  })
})

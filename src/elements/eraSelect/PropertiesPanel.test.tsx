import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EraSelectPropertiesPanel } from './PropertiesPanel'
import type { EraSelectElement } from '@/types'

function makeElement(overrides: Partial<EraSelectElement> = {}): EraSelectElement {
  return {
    id: 'era-1',
    type: 'eraSelect',
    position: { x: 0, y: 0 },
    size: { width: 7, height: 12 },
    zIndex: 1,
    visible: true,
    locked: false,
    ...overrides,
  } as EraSelectElement
}

describe('EraSelectPropertiesPanel — dataSource 入力', () => {
  it('dataSource 入力が onChange を呼ぶ', () => {
    const onChange = vi.fn()
    render(<EraSelectPropertiesPanel el={makeElement()} onChange={onChange} />)
    const input = screen.getByPlaceholderText('例: employee.era')
    fireEvent.change(input, { target: { value: 'employee.era' } })
    expect(onChange).toHaveBeenCalledWith({ dataSource: 'employee.era' })
  })

  it('dataSource 入力が空文字のとき undefined を渡す', () => {
    const onChange = vi.fn()
    render(
      <EraSelectPropertiesPanel
        el={makeElement({ dataSource: 'employee.era' })}
        onChange={onChange}
      />,
    )
    const input = screen.getByPlaceholderText('例: employee.era')
    fireEvent.change(input, { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith({ dataSource: undefined })
  })

  it('既存の dataSource 値が入力に表示される', () => {
    render(
      <EraSelectPropertiesPanel
        el={makeElement({ dataSource: 'employee.era' })}
        onChange={vi.fn()}
      />,
    )
    const input = screen.getByPlaceholderText('例: employee.era') as HTMLInputElement
    expect(input.value).toBe('employee.era')
  })
})

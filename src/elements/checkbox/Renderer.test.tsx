import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CheckboxRenderer } from './Renderer'
import type { CheckboxElement } from '@/types'

function makeElement(overrides: Partial<CheckboxElement> = {}): CheckboxElement {
  return {
    id: 'cb-1',
    type: 'checkbox',
    position: { x: 0, y: 0 },
    size: { width: 5, height: 5 },
    zIndex: 1,
    visible: true,
    locked: false,
    checked: false,
    checkmark: '✓',
    label: '',
    ...overrides,
  } as CheckboxElement
}

describe('CheckboxRenderer — checked state', () => {
  it('checked: true でチェックマーク記号を表示する', () => {
    render(<CheckboxRenderer element={makeElement({ checked: true })} />)
    expect(screen.getByText('✓')).toBeInTheDocument()
  })

  it('checked: false でチェックマーク記号を表示しない', () => {
    render(<CheckboxRenderer element={makeElement({ checked: false })} />)
    expect(screen.queryByText('✓')).not.toBeInTheDocument()
  })

  it('checkmark: × で × 記号が表示される', () => {
    render(<CheckboxRenderer element={makeElement({ checked: true, checkmark: '×' })} />)
    expect(screen.getByText('×')).toBeInTheDocument()
  })

  it('checkmark: ● で ● 記号が表示される', () => {
    render(<CheckboxRenderer element={makeElement({ checked: true, checkmark: '●' })} />)
    expect(screen.getByText('●')).toBeInTheDocument()
  })
})

describe('CheckboxRenderer — dataSource binding', () => {
  it('dataSource 指定時に非空文字列で checked になる', () => {
    render(
      <CheckboxRenderer
        element={makeElement({ checked: false, dataSource: 'flag' })}
        data={{ flag: 'true' }}
      />,
    )
    expect(screen.getByText('✓')).toBeInTheDocument()
  })

  it('dataSource 指定時に空文字列で unchecked になる', () => {
    render(
      <CheckboxRenderer
        element={makeElement({ checked: true, dataSource: 'flag' })}
        data={{ flag: '' }}
      />,
    )
    expect(screen.queryByText('✓')).not.toBeInTheDocument()
  })

  it('dataSource 指定時にフィールドが存在しない場合 unchecked になる', () => {
    render(
      <CheckboxRenderer
        element={makeElement({ checked: true, dataSource: 'missing' })}
        data={{}}
      />,
    )
    expect(screen.queryByText('✓')).not.toBeInTheDocument()
  })

  it('dataSource 未指定時は checked の静的値を使用する', () => {
    render(<CheckboxRenderer element={makeElement({ checked: true })} />)
    expect(screen.getByText('✓')).toBeInTheDocument()
  })
})

describe('CheckboxRenderer — label', () => {
  it('label が非空のとき表示される', () => {
    render(<CheckboxRenderer element={makeElement({ label: '対象' })} />)
    expect(screen.getByText('対象')).toBeInTheDocument()
  })

  it('label が空文字のとき表示されない', () => {
    const { container } = render(<CheckboxRenderer element={makeElement({ label: '' })} />)
    // label span が存在しないことを確認
    const spans = container.querySelectorAll('span')
    expect(spans).toHaveLength(0)
  })
})

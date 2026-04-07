import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EraSelectRenderer } from './Renderer'
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

describe('EraSelectRenderer — 5元号の表示', () => {
  it('明・大・昭・平・令 が全てレンダリングされる', () => {
    render(<EraSelectRenderer element={makeElement()} />)
    expect(screen.getByText(/明/)).toBeInTheDocument()
    expect(screen.getByText(/大/)).toBeInTheDocument()
    expect(screen.getByText(/昭/)).toBeInTheDocument()
    expect(screen.getByText(/平/)).toBeInTheDocument()
    expect(screen.getByText(/令/)).toBeInTheDocument()
  })
})

describe('EraSelectRenderer — dataSource 未設定', () => {
  it('全て ○ が表示される', () => {
    render(<EraSelectRenderer element={makeElement()} />)
    const circles = screen.getAllByText('○')
    expect(circles).toHaveLength(5)
  })

  it('● が表示されない', () => {
    render(<EraSelectRenderer element={makeElement()} />)
    expect(screen.queryByText('●')).not.toBeInTheDocument()
  })
})

describe('EraSelectRenderer — dataSource バインド', () => {
  it('dataSource が昭 に解決されると 昭 に ● が付く', () => {
    render(
      <EraSelectRenderer
        element={makeElement({ dataSource: 'employee.era' })}
        data={{ employee: { era: '昭' } }}
      />,
    )
    expect(screen.getByText('●')).toBeInTheDocument()
    const circles = screen.getAllByText('○')
    expect(circles).toHaveLength(4)
  })

  it('dataSource が令 に解決されると 令 に ● が付く', () => {
    render(
      <EraSelectRenderer
        element={makeElement({ dataSource: 'era' })}
        data={{ era: '令' }}
      />,
    )
    expect(screen.getByText('●')).toBeInTheDocument()
  })

  it('マッチしない値のとき全て ○', () => {
    render(
      <EraSelectRenderer
        element={makeElement({ dataSource: 'employee.era' })}
        data={{ employee: { era: '不明' } }}
      />,
    )
    expect(screen.queryByText('●')).not.toBeInTheDocument()
    expect(screen.getAllByText('○')).toHaveLength(5)
  })

  it('dataSource 指定・データ未存在のとき全て ○（エラーなし）', () => {
    render(
      <EraSelectRenderer
        element={makeElement({ dataSource: 'missing.era' })}
        data={{}}
      />,
    )
    expect(screen.queryByText('●')).not.toBeInTheDocument()
    expect(screen.getAllByText('○')).toHaveLength(5)
  })

  it('dataSource 空文字のとき全て ○', () => {
    render(
      <EraSelectRenderer
        element={makeElement({ dataSource: '' })}
        data={{ era: '昭' }}
      />,
    )
    expect(screen.queryByText('●')).not.toBeInTheDocument()
  })
})

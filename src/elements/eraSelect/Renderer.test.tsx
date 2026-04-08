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

describe('EraSelectRenderer — 最小フォントサイズ', () => {
  it('5mm 高要素でもフォントサイズが 2.0mm を下回らない', () => {
    const { container } = render(<EraSelectRenderer element={makeElement({ size: { width: 7, height: 5 } })} />)
    // 計算: (5/5)*0.75 = 0.75mm → Math.max(0.75, 2.0) = 2.0mm
    // fontSize は各元号行の div に設定される
    const eraRow = container.querySelector('div > div > div')
    expect(eraRow).toBeTruthy()
    expect((eraRow as HTMLElement).style.fontSize).toBe('2mm')
  })

  it('20mm 高要素では通常計算のフォントサイズが使われる', () => {
    const { container } = render(<EraSelectRenderer element={makeElement({ size: { width: 7, height: 20 } })} />)
    // 計算: (20/5)*0.75 = 3.0mm → Math.max(3.0, 2.0) = 3.0mm
    const eraRow = container.querySelector('div > div > div')
    expect(eraRow).toBeTruthy()
    expect((eraRow as HTMLElement).style.fontSize).toBe('3mm')
  })
})

describe('EraSelectRenderer — レイアウト', () => {
  it('layout=column（デフォルト）→ flex-direction: column', () => {
    const { container } = render(<EraSelectRenderer element={makeElement()} />)
    const outer = container.firstChild as HTMLElement
    expect(outer.style.flexDirection).toBe('column')
  })

  it('layout=row → flex-direction: row', () => {
    const { container } = render(<EraSelectRenderer element={makeElement({ layout: 'row' })} />)
    const outer = container.firstChild as HTMLElement
    expect(outer.style.flexDirection).toBe('row')
  })

  it('layout=grid-2col → display: grid + gridTemplateColumns', () => {
    const { container } = render(<EraSelectRenderer element={makeElement({ layout: 'grid-2col' })} />)
    const outer = container.firstChild as HTMLElement
    expect(outer.style.display).toBe('grid')
    expect(outer.style.gridTemplateColumns).toBe('1fr 1fr')
  })
})

describe('EraSelectRenderer — カスタム eras', () => {
  it('eras 指定時はその元号のみ表示', () => {
    render(<EraSelectRenderer element={makeElement({ eras: ['昭', '平', '令'] })} />)
    expect(screen.getByText(/昭/)).toBeInTheDocument()
    expect(screen.getByText(/平/)).toBeInTheDocument()
    expect(screen.getByText(/令/)).toBeInTheDocument()
    expect(screen.queryByText(/明/)).not.toBeInTheDocument()
    expect(screen.queryByText(/大/)).not.toBeInTheDocument()
  })

  it('eras=4元号 + layout=row → 4つ横並び', () => {
    const { container } = render(
      <EraSelectRenderer element={makeElement({ eras: ['大', '昭', '平', '令'], layout: 'row' })} />,
    )
    const outer = container.firstChild as HTMLElement
    expect(outer.style.flexDirection).toBe('row')
    expect(outer.children).toHaveLength(4)
  })

  it('eras=4元号 + dataSource で ● が正しく表示', () => {
    render(
      <EraSelectRenderer
        element={makeElement({ eras: ['大', '昭', '平', '令'], dataSource: 'era' })}
        data={{ era: '令' }}
      />,
    )
    expect(screen.getByText('●')).toBeInTheDocument()
    expect(screen.getAllByText('○')).toHaveLength(3)
  })
})

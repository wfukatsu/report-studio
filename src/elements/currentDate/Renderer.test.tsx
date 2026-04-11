import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CurrentDateRenderer } from './Renderer'
import type { CurrentDateElement } from '@/types'

function makeElement(overrides?: Partial<CurrentDateElement>): CurrentDateElement {
  return {
    id: 'cd-1',
    type: 'currentDate',
    position: { x: 0, y: 0 },
    size: { width: 40, height: 8 },
    zIndex: 1,
    visible: true,
    locked: false,
    format: 'yyyy/MM/dd',
    style: { fontSize: 3, textAlign: 'left' },
    ...overrides,
  }
}

describe('CurrentDateRenderer', () => {
  describe('デザインモード (resolveValues=false)', () => {
    it('yyyy/MM/dd フォーマットでプレースホルダーを表示する', () => {
      render(<CurrentDateRenderer element={makeElement({ format: 'yyyy/MM/dd' })} />)
      expect(screen.getByText('yyyy/MM/dd')).toBeInTheDocument()
    })

    it('yyyy年MM月dd日 フォーマットでプレースホルダーを表示する', () => {
      render(<CurrentDateRenderer element={makeElement({ format: 'yyyy年MM月dd日' })} />)
      expect(screen.getByText('yyyy年MM月dd日')).toBeInTheDocument()
    })

    it('wareki_full フォーマットでプレースホルダーを表示する', () => {
      render(<CurrentDateRenderer element={makeElement({ format: 'wareki_full' })} />)
      expect(screen.getByText(/元号/)).toBeInTheDocument()
    })

    it('custom フォーマットで customFormat 文字列を表示する', () => {
      render(
        <CurrentDateRenderer
          element={makeElement({ format: 'custom', customFormat: 'MM-dd' })}
        />,
      )
      expect(screen.getByText('MM-dd')).toBeInTheDocument()
    })

    it('custom フォーマットで customFormat が未設定なら「カスタム日付」を表示する', () => {
      render(<CurrentDateRenderer element={makeElement({ format: 'custom' })} />)
      expect(screen.getByText('カスタム日付')).toBeInTheDocument()
    })
  })

  describe('プレビューモード (resolveValues=true)', () => {
    it('resolveValues=true のとき実際の日付文字列を表示する（yyyy/MM/dd 形式）', () => {
      const { container } = render(
        <CurrentDateRenderer element={makeElement({ format: 'yyyy/MM/dd' })} resolveValues />,
      )
      // 実際の日付が表示される（YYYY/MM/DD 形式）
      const text = container.textContent ?? ''
      expect(text).toMatch(/\d{4}\/\d{2}\/\d{2}/)
    })

    it('resolveValues=true で custom フォーマットが適用される', () => {
      const { container } = render(
        <CurrentDateRenderer
          element={makeElement({ format: 'custom', customFormat: 'yyyy年MM月dd日' })}
          resolveValues
        />,
      )
      expect(container.textContent).toMatch(/\d{4}年\d{2}月\d{2}日/)
    })
  })
})

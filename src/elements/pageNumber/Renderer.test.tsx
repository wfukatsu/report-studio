import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageNumberRenderer } from './Renderer'
import type { PageNumberElement } from '@/types'

function makeElement(overrides?: Partial<PageNumberElement>): PageNumberElement {
  return {
    id: 'pn-1',
    type: 'pageNumber',
    position: { x: 0, y: 0 },
    size: { width: 30, height: 8 },
    zIndex: 1,
    visible: true,
    locked: false,
    format: '{{page}}',
    style: { fontSize: 3, textAlign: 'center' },
    ...overrides,
  }
}

describe('PageNumberRenderer', () => {
  describe('デザインモード (resolveValues=false)', () => {
    it('{{page}} フォーマットをそのまま表示する', () => {
      render(<PageNumberRenderer element={makeElement({ format: '{{page}}' })} />)
      expect(screen.getByText('{{page}}')).toBeInTheDocument()
    })

    it('{{page}} / {{pages}} フォーマットをそのまま表示する', () => {
      render(<PageNumberRenderer element={makeElement({ format: '{{page}} / {{pages}}' })} />)
      expect(screen.getByText('{{page}} / {{pages}}')).toBeInTheDocument()
    })

    it('custom フォーマットで customFormat 文字列を表示する', () => {
      render(
        <PageNumberRenderer
          element={makeElement({ format: 'custom', customFormat: 'p.{{page}}' })}
        />,
      )
      expect(screen.getByText('p.{{page}}')).toBeInTheDocument()
    })

    it('custom で customFormat 未設定なら {{page}} を表示する', () => {
      render(<PageNumberRenderer element={makeElement({ format: 'custom' })} />)
      expect(screen.getByText('{{page}}')).toBeInTheDocument()
    })
  })

  describe('プレビューモード (resolveValues=true)', () => {
    it('resolveValues=true のとき実際のページ番号を表示する', () => {
      render(
        <PageNumberRenderer
          element={makeElement({ format: '{{page}}' })}
          resolveValues
          pageIndex={3}
          totalPages={5}
        />,
      )
      expect(screen.getByText('3')).toBeInTheDocument()
    })

    it('{{page}} / {{pages}} で両方の数値が表示される', () => {
      render(
        <PageNumberRenderer
          element={makeElement({ format: '{{page}} / {{pages}}' })}
          resolveValues
          pageIndex={2}
          totalPages={10}
        />,
      )
      expect(screen.getByText('2 / 10')).toBeInTheDocument()
    })

    it('pageIndex と totalPages のデフォルト値が 1 になる', () => {
      render(
        <PageNumberRenderer
          element={makeElement({ format: '{{page}} / {{pages}}' })}
          resolveValues
        />,
      )
      expect(screen.getByText('1 / 1')).toBeInTheDocument()
    })
  })
})

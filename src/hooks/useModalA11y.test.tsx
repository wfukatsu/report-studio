/**
 * useModalA11y — focus trap / Esc / focus restore / modal stacking (#427).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useModalA11y } from './useModalA11y'

function TestModal({
  open,
  onClose,
  label,
}: {
  open: boolean
  onClose: () => void
  label: string
}) {
  const { dialogRef } = useModalA11y({ open, onClose })
  if (!open) return null
  return (
    <div ref={dialogRef} role="dialog" aria-label={label}>
      <button>{label}-first</button>
      <button>{label}-last</button>
    </div>
  )
}

const flushFocusRestore = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

describe('useModalA11y', () => {
  it('opens with focus on the first focusable element', () => {
    render(<TestModal open onClose={vi.fn()} label="m" />)
    expect(document.activeElement).toBe(screen.getByText('m-first'))
  })

  it('Esc で onClose が呼ばれる', () => {
    const onClose = vi.fn()
    render(<TestModal open onClose={onClose} label="m" />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Tab は末尾から先頭へ循環する（フォーカストラップ）', () => {
    render(<TestModal open onClose={vi.fn()} label="m" />)
    screen.getByText('m-last').focus()

    fireEvent.keyDown(document, { key: 'Tab' })

    expect(document.activeElement).toBe(screen.getByText('m-first'))
  })

  it('Shift+Tab は先頭から末尾へ循環する', () => {
    render(<TestModal open onClose={vi.fn()} label="m" />)
    screen.getByText('m-first').focus()

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })

    expect(document.activeElement).toBe(screen.getByText('m-last'))
  })

  it('閉じるとオープナー要素へフォーカスが戻る', async () => {
    const Host = ({ open }: { open: boolean }) => (
      <>
        <button>opener</button>
        <TestModal open={open} onClose={vi.fn()} label="m" />
      </>
    )
    const { rerender } = render(<Host open={false} />)
    screen.getByText('opener').focus()

    rerender(<Host open={true} />)
    expect(document.activeElement).toBe(screen.getByText('m-first'))

    rerender(<Host open={false} />)
    await flushFocusRestore()
    expect(document.activeElement).toBe(screen.getByText('opener'))
  })

  it('スタック時は最上位のモーダルだけが Esc に反応する', () => {
    const closeBottom = vi.fn()
    const closeTop = vi.fn()
    render(
      <>
        <TestModal open onClose={closeBottom} label="bottom" />
        <TestModal open onClose={closeTop} label="top" />
      </>,
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(closeTop).toHaveBeenCalledTimes(1)
    expect(closeBottom).not.toHaveBeenCalled()
  })

  it('最上位が閉じた後は下のモーダルが Esc に反応する', () => {
    const closeBottom = vi.fn()
    const Host = ({ topOpen }: { topOpen: boolean }) => (
      <>
        <TestModal open onClose={closeBottom} label="bottom" />
        <TestModal open={topOpen} onClose={vi.fn()} label="top" />
      </>
    )
    const { rerender } = render(<Host topOpen={true} />)
    rerender(<Host topOpen={false} />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(closeBottom).toHaveBeenCalledTimes(1)
  })
})

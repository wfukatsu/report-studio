import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TextInlineEditor } from './InlineEditor'
import type { TextElement } from '@/types'

function makeElement(overrides: Partial<TextElement> = {}): TextElement {
  return {
    id: 'el-1',
    type: 'text',
    position: { x: 0, y: 0 },
    size: { width: 60, height: 15 },
    zIndex: 1,
    visible: true,
    locked: false,
    content: 'Initial content',
    style: { fontSize: 3.5, fontWeight: 'normal', color: '#000000', textAlign: 'left' },
    ...overrides,
  } as TextElement
}

describe('TextInlineEditor', () => {
  let onCommit: ReturnType<typeof vi.fn>
  let onCancel: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onCommit = vi.fn()
    onCancel = vi.fn()
  })

  it('renders a contenteditable div', () => {
    render(<TextInlineEditor element={makeElement()} onCommit={onCommit} onCancel={onCancel} />)
    const editor = screen.getByRole('textbox')
    expect(editor).toBeInTheDocument()
  })

  it('calls onCancel when Escape is pressed', async () => {
    render(<TextInlineEditor element={makeElement()} onCommit={onCommit} onCancel={onCancel} />)
    const editor = screen.getByRole('textbox')
    editor.focus()
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('calls onCommit when Enter is pressed (without Shift)', async () => {
    render(<TextInlineEditor element={makeElement()} onCommit={onCommit} onCancel={onCancel} />)
    const editor = screen.getByRole('textbox')
    editor.focus()
    await userEvent.keyboard('{Enter}')
    expect(onCommit).toHaveBeenCalledOnce()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('does NOT call onCommit when Shift+Enter is pressed', async () => {
    render(<TextInlineEditor element={makeElement()} onCommit={onCommit} onCancel={onCancel} />)
    const editor = screen.getByRole('textbox')
    editor.focus()
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('calls onCommit on blur', () => {
    render(
      <div>
        <TextInlineEditor element={makeElement()} onCommit={onCommit} onCancel={onCancel} />
        <button>外部ボタン</button>
      </div>,
    )
    const editor = screen.getByRole('textbox')
    editor.focus()
    fireEvent.blur(editor)
    expect(onCommit).toHaveBeenCalledOnce()
  })

  it('does NOT call onCommit on blur after Escape', async () => {
    render(
      <div>
        <TextInlineEditor element={makeElement()} onCommit={onCommit} onCancel={onCancel} />
        <button>外部ボタン</button>
      </div>,
    )
    const editor = screen.getByRole('textbox')
    editor.focus()
    await userEvent.keyboard('{Escape}')
    // Escape already called onCancel — simulate blur after that
    fireEvent.blur(editor)
    expect(onCommit).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('does NOT intercept Enter during IME composition', async () => {
    render(<TextInlineEditor element={makeElement()} onCommit={onCommit} onCancel={onCancel} />)
    const editor = screen.getByRole('textbox')
    editor.focus()

    // Simulate compositionstart (IME begins)
    fireEvent.compositionStart(editor)

    // Fire Enter during composition — should NOT commit
    fireEvent.keyDown(editor, { key: 'Enter', code: 'Enter', bubbles: true })
    expect(onCommit).not.toHaveBeenCalled()

    // compositionend — IME finishes
    fireEvent.compositionEnd(editor)
  })

  it('does NOT intercept Escape during IME composition', () => {
    render(<TextInlineEditor element={makeElement()} onCommit={onCommit} onCancel={onCancel} />)
    const editor = screen.getByRole('textbox')
    editor.focus()

    fireEvent.compositionStart(editor)
    fireEvent.keyDown(editor, { key: 'Escape', code: 'Escape', bubbles: true })
    expect(onCancel).not.toHaveBeenCalled()

    fireEvent.compositionEnd(editor)
  })

  it('stops propagation of key events to prevent canvas handlers', async () => {
    const parentKeyDown = vi.fn()
    render(
      <div onKeyDown={parentKeyDown}>
        <TextInlineEditor element={makeElement()} onCommit={onCommit} onCancel={onCancel} />
      </div>,
    )
    const editor = screen.getByRole('textbox')
    editor.focus()

    // Non-Enter/Escape key — stopPropagation is called, parent does NOT receive it
    fireEvent.keyDown(editor, { key: 'a', code: 'KeyA', bubbles: true })
    expect(parentKeyDown).not.toHaveBeenCalled()
  })

  it('has correct ARIA attributes', () => {
    render(<TextInlineEditor element={makeElement()} onCommit={onCommit} onCancel={onCancel} />)
    const editor = screen.getByRole('textbox')
    expect(editor).toHaveAttribute('aria-label', 'テキスト編集')
    expect(editor).toHaveAttribute('aria-multiline', 'false')
  })

  it('truncates content to 10000 characters on commit', async () => {
    const longContent = 'a'.repeat(11_000)
    render(
      <TextInlineEditor
        element={makeElement({ content: '' })}
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    )
    const editor = screen.getByRole('textbox')
    editor.focus()
    // Simulate innerText having very long content
    Object.defineProperty(editor, 'innerText', { value: longContent, configurable: true })
    await userEvent.keyboard('{Enter}')
    expect(onCommit).toHaveBeenCalledWith(expect.stringMatching(/^a{10000}$/))
  })
})

describe('TextInlineEditor — style fallbacks', () => {
  it('uses default fontSize 3.5mm when style.fontSize is undefined', () => {
    render(
      <TextInlineEditor
        element={makeElement({ style: {} })}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const editor = screen.getByRole('textbox')
    expect(editor.style.fontSize).toBe('3.5mm')
  })

  it('uses default fontWeight normal when not set', () => {
    render(
      <TextInlineEditor
        element={makeElement({ style: {} })}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('textbox').style.fontWeight).toBe('normal')
  })

  it('uses default color #000000 when not set', () => {
    render(
      <TextInlineEditor
        element={makeElement({ style: {} })}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('textbox').style.color).toBe('rgb(0, 0, 0)')
  })

  it('uses break-all wordBreak for vertical writing mode', () => {
    render(
      <TextInlineEditor
        element={makeElement({ style: { writingMode: 'vertical-rl' } })}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('textbox').style.wordBreak).toBe('break-all')
  })

  it('uses break-word for horizontal writing mode', () => {
    render(
      <TextInlineEditor
        element={makeElement({ style: { writingMode: 'horizontal-tb' } })}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('textbox').style.wordBreak).toBe('break-word')
  })

  it('cancelledRef prevents commit on blur after Escape', async () => {
    const onCommit = vi.fn()
    const onCancel = vi.fn()
    render(
      <TextInlineEditor
        element={makeElement()}
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    )
    const editor = screen.getByRole('textbox')
    editor.focus()
    await userEvent.keyboard('{Escape}')
    // blur after escape should NOT commit
    fireEvent.blur(editor)
    expect(onCommit).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledOnce()
  })
})

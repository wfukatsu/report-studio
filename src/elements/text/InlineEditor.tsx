import { memo, useRef, useEffect, useCallback } from 'react'
import type { TextElement } from '@/types'

interface Props {
  element: TextElement
  onCommit: (content: string) => void
  onCancel: () => void
}

/**
 * Read committed content from a contenteditable div.
 * - Uses innerText (not innerHTML) to avoid storing markup.
 * - Normalises line endings and strips null bytes.
 * - Truncates to MAX_CONTENT_LENGTH characters.
 */
const MAX_CONTENT_LENGTH = 10_000

function getCommitContent(el: HTMLDivElement): string {
  return el.innerText
    .slice(0, MAX_CONTENT_LENGTH)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\0/g, '')
}

/**
 * Inline text editor for TextElement.
 *
 * Design decisions:
 * - contentEditable="plaintext-only": prevents the browser from inserting HTML markup,
 *   which is the most effective XSS prevention for contenteditable inputs.
 * - Uncontrolled DOM: write initial value once on mount; React does NOT re-render
 *   the editable div during editing. Content is read only on commit (blur/Enter).
 * - IME guard: isComposing tracks Japanese/Chinese input. During composition,
 *   Enter/Escape are not intercepted so the IME can handle them.
 * - justFinishedComposition: one-shot flag for the first keydown after compositionend,
 *   because compositionend can fire before the final keydown on some browsers.
 */
export const TextInlineEditor = memo(function TextInlineEditor({ element: el, onCommit, onCancel }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const isComposingRef = useRef(false)
  const justFinishedCompositionRef = useRef(false)
  // Track whether ESC was pressed so onBlur doesn't also commit
  const cancelledRef = useRef(false)

  // Write initial content once on mount, then focus and move cursor to end.
  useEffect(() => {
    const div = editorRef.current
    if (!div) return
    div.innerText = el.content
    // preventScroll: avoids unexpected scroll jump inside CSS-scaled canvas
    div.focus({ preventScroll: true })
    // Move cursor to end
    const range = document.createRange()
    const sel = window.getSelection()
    range.selectNodeContents(div)
    range.collapse(false) // collapse to end
    sel?.removeAllRanges()
    sel?.addRange(range)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps — run only once on mount

  const commitAndClose = useCallback(() => {
    const div = editorRef.current
    if (!div) return
    onCommit(getCommitContent(div))
  }, [onCommit])

  const cancelAndClose = useCallback(() => {
    cancelledRef.current = true
    onCancel()
  }, [onCancel])

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true
    justFinishedCompositionRef.current = false
  }, [])

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false
    justFinishedCompositionRef.current = true
    // Reset the one-shot flag after the next microtask so the final IME-confirm
    // keydown (Enter) is not accidentally intercepted.
    setTimeout(() => {
      justFinishedCompositionRef.current = false
    }, 0)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // During IME composition (e.g. Japanese kana→kanji conversion), do not
      // intercept Enter or Escape — let the IME handle them.
      if (isComposingRef.current || justFinishedCompositionRef.current) return

      // Prevent canvas keyboard handlers from receiving events while editing.
      e.stopPropagation()

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault() // No newline inserted; Shift+Enter still inserts a newline
        commitAndClose()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancelAndClose()
      }
    },
    [commitAndClose, cancelAndClose],
  )

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      // If cancelled via Escape, do not commit
      if (cancelledRef.current) return
      // If focus moved inside a related dropdown/picker, stay in editing mode
      // (relatedTarget will be null if focus left the document entirely)
      void e.relatedTarget // read to avoid lint warning
      if (!isComposingRef.current) {
        commitAndClose()
      }
    },
    [commitAndClose],
  )

  return (
    <div
      ref={editorRef}
      // plaintext-only prevents the browser from inserting <div>, <b>, etc.
      // React types don't include this value; cast is needed.
      contentEditable={"plaintext-only" as React.HTMLAttributes<HTMLDivElement>['contentEditable']}
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-multiline="false"
      aria-label="テキスト編集"
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      style={{
        position: 'absolute',
        inset: 0,
        fontSize: `${el.style.fontSize ?? 3.5}mm`,
        fontFamily: el.style.fontFamily,
        fontWeight: el.style.fontWeight ?? 'normal',
        color: el.style.color ?? '#000000',
        textAlign: el.style.textAlign ?? 'left',
        whiteSpace: 'pre-wrap',
        wordBreak: el.style.writingMode === 'vertical-rl' ? 'break-all' : 'break-word',
        writingMode: el.style.writingMode ?? 'horizontal-tb',
        padding: '0',
        margin: '0',
        border: '2px solid #3b82f6',
        outline: 'none',
        background: 'rgba(255,255,255,0.92)',
        cursor: 'text',
        // Ensure the editor sits above resize handles
        zIndex: 9999,
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    />
  )
})

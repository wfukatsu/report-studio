/**
 * useModalA11y — shared modal accessibility behavior (#427, Epic #430).
 *
 * Extracted from ConfirmDialog so every hand-rolled modal can get the same
 * three behaviors from one hook:
 *   1. Focus trap — Tab / Shift+Tab cycle inside the dialog only
 *   2. Esc — closes the modal (top-most only when modals are stacked)
 *   3. Focus restore — focus returns to the opener element on close
 *
 * Usage:
 *   const { dialogRef } = useModalA11y({ open, onClose })
 *   ...
 *   <div ref={dialogRef} role="dialog" aria-modal="true">...</div>
 *
 * The hook listens on `document`, so Esc works no matter where focus sits.
 * A module-level stack ensures that with nested modals (e.g. a ConfirmDialog
 * on top of a wizard) only the top-most one reacts to Esc / Tab.
 */
import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Stack of currently-open modal instances — last entry is top-most. */
const modalStack: symbol[] = []

interface UseModalA11yOptions {
  /** Whether the modal is currently open (hook is a no-op while false). */
  open: boolean
  /** Called when Esc is pressed while this modal is top-most. */
  onClose: () => void
  /**
   * Element to focus when the modal opens. Falls back to the first focusable
   * element inside `dialogRef` when omitted.
   */
  initialFocus?: RefObject<HTMLElement | null>
}

export function useModalA11y<T extends HTMLElement = HTMLDivElement>({
  open,
  onClose,
  initialFocus,
}: UseModalA11yOptions): { dialogRef: RefObject<T | null> } {
  const dialogRef = useRef<T | null>(null)

  // Keep the latest callbacks/refs without re-running the open effect
  const onCloseRef = useRef(onClose)
  const initialFocusRef = useRef(initialFocus)
  useEffect(() => {
    onCloseRef.current = onClose
    initialFocusRef.current = initialFocus
  }, [onClose, initialFocus])

  useEffect(() => {
    if (!open) return

    const instance = Symbol('modal')
    modalStack.push(instance)
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null

    // Initial focus: explicit target, else first focusable element in the dialog
    const target =
      initialFocusRef.current?.current ??
      dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
      null
    target?.focus()

    const isTopMost = () => modalStack[modalStack.length - 1] === instance

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isTopMost()) return

      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }

      if (e.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      const idx = modalStack.indexOf(instance)
      if (idx >= 0) modalStack.splice(idx, 1)
      // Restore focus to the opener after React finishes the close re-render —
      // covers every close path (confirm, cancel, Esc, X) uniformly.
      setTimeout(() => opener?.focus(), 0)
    }
  }, [open])

  return { dialogRef }
}

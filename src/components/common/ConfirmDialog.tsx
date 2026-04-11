import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  confirmVariant?: 'danger' | 'default'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '確認',
  confirmVariant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    // ダイアログを開いたトリガー要素を記録（閉じた後にフォーカスを戻す）
    openerRef.current = document.activeElement as HTMLElement

    // 確認ボタンに自動フォーカス
    confirmButtonRef.current?.focus()

    // フォーカストラップ — Tab/Shift+Tab をダイアログ内で循環させる
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
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
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  // ダイアログが閉じたらトリガー要素にフォーカスを戻す
  const handleClose = () => {
    onCancel()
    // setTimeout で React の state 更新後にフォーカスを戻す
    setTimeout(() => openerRef.current?.focus(), 0)
  }

  const handleConfirm = () => {
    onConfirm()
    setTimeout(() => openerRef.current?.focus(), 0)
  }

  if (!open) return null

  const confirmClass = confirmVariant === 'danger'
    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
    : 'bg-primary text-primary-foreground hover:bg-primary/90'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); handleClose() } }}
    >
      <div ref={dialogRef} className="bg-background rounded-lg shadow-xl w-80 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 border-b">
          <h2 id="confirm-dialog-title" className="text-sm font-semibold">{title}</h2>
          <button onClick={handleClose} className="rounded hover:bg-accent p-1" aria-label="閉じる">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground leading-relaxed">{message}</p>
        </div>
        <footer className="flex justify-end gap-2 px-4 py-3 border-t">
          <button
            onClick={handleClose}
            className="px-3 py-1.5 text-xs rounded-md hover:bg-accent border"
          >
            キャンセル
          </button>
          <button
            ref={confirmButtonRef}
            onClick={handleConfirm}
            className={`px-3 py-1.5 text-xs rounded-md ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  )
}

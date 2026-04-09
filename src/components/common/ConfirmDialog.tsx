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
  if (!open) return null

  const confirmClass = confirmVariant === 'danger'
    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
    : 'bg-primary text-primary-foreground hover:bg-primary/90'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      ref={(el) => el?.focus()}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }}
    >
      <div className="bg-background rounded-lg shadow-xl w-80 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onCancel} className="rounded hover:bg-accent p-1" aria-label="閉じる">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground leading-relaxed">{message}</p>
        </div>
        <footer className="flex justify-end gap-2 px-4 py-3 border-t">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded-md hover:bg-accent border"
          >
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            className={`px-3 py-1.5 text-xs rounded-md ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  )
}

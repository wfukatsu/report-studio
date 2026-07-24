import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { useModalA11y } from '@/hooks/useModalA11y'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  confirmVariant?: 'danger' | 'default'
  onConfirm: () => void
  onCancel: () => void
  /**
   * Optional non-destructive middle action, e.g. "保存して続行". When provided it
   * renders as the primary (autofocused) button and the destructive confirm is
   * demoted, so the safe path is the default choice (#160).
   */
  secondaryLabel?: string
  onSecondary?: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  confirmVariant = 'default',
  onConfirm,
  onCancel,
  secondaryLabel,
  onSecondary,
}: ConfirmDialogProps) {
  const { t } = useTranslation('components')
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  // #427: focus trap + Esc + opener focus restore now come from the shared hook
  const { dialogRef } = useModalA11y({ open, onClose: onCancel, initialFocus: confirmButtonRef })

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
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div ref={dialogRef} className="bg-background rounded-lg shadow-xl w-80 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 border-b">
          <h2 id="confirm-dialog-title" className="text-sm font-semibold">{title}</h2>
          <button onClick={onCancel} className="rounded hover:bg-accent p-1" aria-label={t('common.confirmDialog.close')}>
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
            {t('common.confirmDialog.cancel')}
          </button>
          <button
            ref={secondaryLabel ? undefined : confirmButtonRef}
            onClick={onConfirm}
            className={`px-3 py-1.5 text-xs rounded-md ${
              secondaryLabel
                // When a safe secondary action exists, demote the destructive
                // button to a quiet outline so it isn't the visual default (#160).
                ? 'border hover:bg-accent'
                : confirmClass
            }`}
          >
            {confirmLabel ?? t('common.confirmDialog.confirm')}
          </button>
          {secondaryLabel && (
            <button
              ref={secondaryLabel ? confirmButtonRef : undefined}
              onClick={onSecondary}
              className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {secondaryLabel}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

interface PromptDialogProps {
  open: boolean
  title: string
  /** Short helper text shown above the input. */
  message?: string
  placeholder?: string
  defaultValue?: string
  confirmLabel?: string
  /** Called with the trimmed, non-empty input value. */
  onSubmit: (value: string) => void
  onCancel: () => void
}

/**
 * Single-line text input dialog — the in-app replacement for
 * `window.prompt()` so text entry matches the app's modal UI and does not
 * block the browser event loop (issue #269).
 *
 * The content is mounted only while open, so the input state starts fresh
 * from `defaultValue` on every open without any reset effect.
 */
export function PromptDialog(props: PromptDialogProps) {
  if (!props.open) return null
  return <PromptDialogContent {...props} />
}

function PromptDialogContent({
  title,
  message,
  placeholder,
  defaultValue = '',
  confirmLabel,
  onSubmit,
  onCancel,
}: PromptDialogProps) {
  const { t } = useTranslation('components')
  const [value, setValue] = useState(defaultValue)
  const openerRef = useRef<HTMLElement | null>(null)

  // Remember the trigger element on mount to restore focus on close.
  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement
  }, [])

  const handleClose = () => {
    onCancel()
    setTimeout(() => openerRef.current?.focus(), 0)
  }

  const canSubmit = value.trim().length > 0

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit(value.trim())
    setTimeout(() => openerRef.current?.focus(), 0)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-dialog-title"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); handleClose() } }}
    >
      <div className="bg-background rounded-lg shadow-xl w-80 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 border-b">
          <h2 id="prompt-dialog-title" className="text-sm font-semibold">{title}</h2>
          <button onClick={handleClose} className="rounded hover:bg-accent p-1" aria-label={t('common.promptDialog.close')}>
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="px-4 py-3 space-y-2">
          {message && <p className="text-xs text-muted-foreground leading-relaxed">{message}</p>}
          <input
            type="text"
            className="w-full border rounded px-2 py-1.5 text-xs bg-background"
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return
              if (e.key === 'Enter') handleSubmit()
            }}
            autoFocus
          />
        </div>
        <footer className="flex justify-end gap-2 px-4 py-3 border-t">
          <button
            onClick={handleClose}
            className="px-3 py-1.5 text-xs rounded-md hover:bg-accent border"
          >
            {t('common.promptDialog.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {confirmLabel ?? t('common.promptDialog.confirm')}
          </button>
        </footer>
      </div>
    </div>
  )
}

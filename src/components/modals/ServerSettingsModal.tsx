import { useEffect, useRef } from 'react'
import { AccountTab } from './AccountTab'

interface ServerSettingsModalProps {
  open: boolean
  onClose: () => void
}

/**
 * アカウント設定モーダル。
 * 管理者向け機能（ユーザー管理・サーバー設定）は管理タブに移行済み。
 */
export function ServerSettingsModal({ open, onClose }: ServerSettingsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const modal = modalRef.current
      if (!modal) return
      const focusable = modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="server-settings-title"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div ref={modalRef} className="bg-background border border-border rounded-lg shadow-xl w-[480px] max-h-[80vh] flex flex-col mx-4">
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <h2 id="server-settings-title" className="text-sm font-semibold">アカウント設定</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xs px-2 py-1 rounded hover:bg-accent transition-colors"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <AccountTab />
        </div>
      </div>
    </div>
  )
}

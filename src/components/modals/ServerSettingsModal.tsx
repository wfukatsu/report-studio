import { useState, useCallback, useEffect, useRef } from 'react'
import { useReportStore } from '@/store/reportStore'
import { AccountTab } from './AccountTab'
import { AdminUsersTab } from './AdminUsersTab'
import { AdminServerTab } from './AdminServerTab'
import { cn } from '@/lib/utils'

type TabId = 'account' | 'users' | 'server'

interface ServerSettingsModalProps {
  open: boolean
  onClose: () => void
}

export function ServerSettingsModal({ open, onClose }: ServerSettingsModalProps) {
  const currentUser = useReportStore((s) => s.currentUser)
  const isAdmin = currentUser?.roles.includes('admin') ?? false

  const TABS: { id: TabId; label: string }[] = [
    { id: 'account', label: 'アカウント' },
    ...(isAdmin ? [
      { id: 'users' as TabId, label: 'ユーザー管理' },
      { id: 'server' as TabId, label: 'サーバー設定' },
    ] : []),
  ]

  const [activeTab, setActiveTab] = useState<TabId>('account')
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

  const handleTabKeyDown = useCallback((e: React.KeyboardEvent) => {
    const ids = TABS.map((t) => t.id)
    const current = ids.indexOf(activeTab)
    let next: number | null = null
    if (e.key === 'ArrowRight') next = (current + 1) % ids.length
    else if (e.key === 'ArrowLeft') next = (current - 1 + ids.length) % ids.length
    if (next !== null) { e.preventDefault(); setActiveTab(ids[next]) }
  }, [activeTab, TABS])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="server-settings-title"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
    >
      <div ref={modalRef} className="bg-background border border-border rounded-lg shadow-xl w-[600px] max-h-[80vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <h2 id="server-settings-title" className="text-sm font-semibold">設定</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xs px-2 py-1 rounded hover:bg-accent transition-colors"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        {/* Tab bar */}
        <div
          role="tablist"
          aria-label="設定タブ"
          className="flex border-b shrink-0 px-2"
          onKeyDown={handleTabKeyDown}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              id={`settings-tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`settings-tabpanel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2.5 text-xs font-medium transition-colors whitespace-nowrap',
                activeTab === tab.id
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div
          role="tabpanel"
          id={`settings-tabpanel-${activeTab}`}
          aria-labelledby={`settings-tab-${activeTab}`}
          className="flex-1 overflow-y-auto"
        >
          {activeTab === 'account' && <AccountTab />}
          {activeTab === 'users' && isAdmin && <AdminUsersTab />}
          {activeTab === 'server' && isAdmin && <AdminServerTab />}
        </div>
      </div>
    </div>
  )
}

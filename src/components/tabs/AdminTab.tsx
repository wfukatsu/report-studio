import { useState } from 'react'
import { useReportStore } from '@/store/reportStore'
import { cn } from '@/lib/utils'
import { UserManagement } from '@/components/admin/UserManagement'
import { ServerSettings } from '@/components/admin/ServerSettings'
import { TenantSettings } from '@/components/admin/TenantSettings'
import { TemplateManagementTab } from '@/components/tabs/TemplateManagementTab'

type AdminSection = 'users' | 'server' | 'tenant' | 'templates'

const SECTIONS: { id: AdminSection; label: string }[] = [
  { id: 'users',     label: 'ユーザー管理' },
  { id: 'server',    label: 'サーバー設定' },
  { id: 'tenant',    label: 'テナント情報' },
  { id: 'templates', label: 'テンプレート' },
]

export function AdminTab() {
  const currentUser = useReportStore((s) => s.currentUser)
  const isAdmin = currentUser?.roles.includes('admin') ?? false
  const [activeSection, setActiveSection] = useState<AdminSection>('users')

  // Self-defense check — AppShell's double guard is the primary line of defense
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center w-full text-muted-foreground text-sm">
        管理者権限が必要です。
      </div>
    )
  }

  return (
    <div className="flex w-full h-full overflow-hidden">
      {/* 左ナビ */}
      <nav
        aria-label="管理セクション"
        className="w-44 shrink-0 border-r bg-card flex flex-col py-2 overflow-y-auto"
      >
        {SECTIONS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveSection(id)}
            className={cn(
              'w-full text-left px-4 py-2 text-sm transition-colors border-l-2',
              activeSection === id
                ? 'border-primary text-primary bg-primary/10 font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* 右コンテンツ */}
      <div className="flex-1 overflow-y-auto">
        {activeSection === 'users'     && <div className="max-w-3xl"><UserManagement /></div>}
        {activeSection === 'server'    && <div className="max-w-3xl"><ServerSettings /></div>}
        {activeSection === 'tenant'    && <div className="max-w-3xl"><TenantSettings /></div>}
        {activeSection === 'templates' && <TemplateManagementTab />}
      </div>
    </div>
  )
}

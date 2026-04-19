import { type ComponentType, useState } from 'react'
import { useReportStore } from '@/store/reportStore'
import { cn } from '@/lib/utils'
import { UserManagement } from '@/components/admin/UserManagement'
import { ServerSettings } from '@/components/admin/ServerSettings'
import { TenantSettings } from '@/components/admin/TenantSettings'
import { DefaultStyleSettings } from '@/components/admin/DefaultStyleSettings'
import { TemplateManagementTab } from '@/components/tabs/TemplateManagementTab'

type AdminSection = 'users' | 'server' | 'tenant' | 'style' | 'templates'

interface SectionEntry {
  readonly id: AdminSection
  readonly label: string
  readonly component: ComponentType
  readonly fullWidth?: boolean
}

const SECTIONS: SectionEntry[] = [
  { id: 'users',     label: 'ユーザー管理', component: UserManagement },
  { id: 'server',    label: 'サーバー設定',  component: ServerSettings },
  { id: 'tenant',    label: 'テナント情報',  component: TenantSettings },
  { id: 'style',     label: 'デフォルトスタイル', component: DefaultStyleSettings },
  { id: 'templates', label: 'テンプレート',  component: TemplateManagementTab, fullWidth: true },
]

export function AdminTab() {
  const currentUser = useReportStore((s) => s.currentUser)
  const backendConnected = useReportStore((s) => s.backendConnected)
  const isAdmin = currentUser?.roles.includes('admin') ?? false
  const [activeSection, setActiveSection] = useState<AdminSection>('users')

  if (!backendConnected) {
    return (
      <div className="flex flex-col items-center justify-center w-full gap-3 text-muted-foreground">
        <p className="text-sm font-medium text-foreground">バックエンドに接続されていません</p>
        <p className="text-xs">以下のコマンドでバックエンドを起動してください:</p>
        <code className="text-xs bg-muted px-3 py-1.5 rounded font-mono">npm run dev:full</code>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center w-full gap-2 text-muted-foreground">
        <p className="text-sm font-medium text-foreground">管理者権限が必要です</p>
        <p className="text-xs">admin ロールを持つアカウントでログインしてください。</p>
      </div>
    )
  }

  const active = SECTIONS.find((s) => s.id === activeSection) ?? SECTIONS[0]
  const ActiveComponent = active.component

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
        {active.fullWidth
          ? <ActiveComponent />
          : <div className="max-w-3xl"><ActiveComponent /></div>
        }
      </div>
    </div>
  )
}

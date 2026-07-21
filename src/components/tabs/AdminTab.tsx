import { type ComponentType, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ParseKeys } from 'i18next'
import { useReportStore } from '@/store/reportStore'
import { cn } from '@/lib/utils'
import { UserManagement } from '@/components/admin/UserManagement'
import { ServerSettings } from '@/components/admin/ServerSettings'
import { TenantSettings } from '@/components/admin/TenantSettings'
import { DefaultStyleSettings } from '@/components/admin/DefaultStyleSettings'
import { ApiTokenSettings } from '@/components/admin/ApiTokenSettings'
import { TemplateManagementTab } from '@/components/tabs/TemplateManagementTab'

type AdminSection = 'users' | 'server' | 'tenant' | 'style' | 'tokens' | 'templates'

interface SectionEntry {
  readonly id: AdminSection
  readonly labelKey: ParseKeys<'components'>
  readonly component: ComponentType
  readonly fullWidth?: boolean
}

const SECTIONS: SectionEntry[] = [
  { id: 'users',     labelKey: 'tabs.adminTab.sectionUsers',     component: UserManagement },
  { id: 'server',    labelKey: 'tabs.adminTab.sectionServer',    component: ServerSettings },
  { id: 'tenant',    labelKey: 'tabs.adminTab.sectionTenant',    component: TenantSettings },
  { id: 'style',     labelKey: 'tabs.adminTab.sectionStyle',     component: DefaultStyleSettings },
  { id: 'tokens',    labelKey: 'tabs.adminTab.sectionTokens',    component: ApiTokenSettings },
  { id: 'templates', labelKey: 'tabs.adminTab.sectionTemplates', component: TemplateManagementTab, fullWidth: true },
]

export function AdminTab() {
  const { t } = useTranslation('components')
  const currentUser = useReportStore((s) => s.currentUser)
  const backendConnected = useReportStore((s) => s.backendConnected)
  const isAdmin = currentUser?.roles.includes('admin') ?? false
  const [activeSection, setActiveSection] = useState<AdminSection>('users')

  if (!backendConnected) {
    return (
      <div className="flex flex-col items-center justify-center w-full gap-3 text-muted-foreground">
        <p className="text-sm font-medium text-foreground">{t('tabs.adminTab.notConnectedTitle')}</p>
        <p className="text-xs">{t('tabs.adminTab.notConnectedHint')}</p>
        <code className="text-xs bg-muted px-3 py-1.5 rounded font-mono">npm run dev:full</code>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center w-full gap-2 text-muted-foreground">
        <p className="text-sm font-medium text-foreground">{t('tabs.adminTab.adminRequiredTitle')}</p>
        <p className="text-xs">{t('tabs.adminTab.adminRequiredHint')}</p>
      </div>
    )
  }

  const active = SECTIONS.find((s) => s.id === activeSection) ?? SECTIONS[0]
  const ActiveComponent = active.component

  return (
    <div className="flex w-full h-full overflow-hidden">
      {/* 左ナビ */}
      <nav
        aria-label={t('tabs.adminTab.navLabel')}
        className="w-44 shrink-0 border-r bg-card flex flex-col py-2 overflow-y-auto"
      >
        {SECTIONS.map(({ id, labelKey }) => (
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
            {t(labelKey)}
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

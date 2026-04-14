import { Activity } from 'react'
import { useReportStore } from '@/store/reportStore'
import { TopNavigation } from './TopNavigation'
import App from '@/App'
import { DataManagementTab } from '@/components/tabs/DataManagementTab'
import { TemplateManagementTab } from '@/components/tabs/TemplateManagementTab'
import { AdminTab } from '@/components/tabs/AdminTab'
import { useConnectionState } from '@/hooks/useConnectionState'
import type { AppTab } from '@/store/types'

const TABS: { id: AppTab; label: string }[] = [
  { id: 'design',    label: 'デザイン' },
  { id: 'data',      label: 'データ管理' },
  { id: 'templates', label: 'テンプレート管理' },
  { id: 'admin',     label: '管理' },
]

export function AppShell() {
  // Start backend health-check polling (sets backendConnected in store)
  // Placed here (outside <Activity>) so the 30-second interval fires regardless
  // of which tab is active, without being suppressed or re-triggered by Activity.
  useConnectionState()

  const activeTab = useReportStore((s) => s.activeTab)
  const setActiveTab = useReportStore((s) => s.setActiveTab)

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNavigation activeTab={activeTab} onTabChange={setActiveTab} tabs={TABS} />

      {/* Design tab: Activity でエフェクトを自動 pause/resume し、状態を保持 */}
      <Activity mode={activeTab === 'design' ? 'visible' : 'hidden'}>
        <div
          role="tabpanel"
          id="top-panel-design"
          aria-labelledby="top-tab-design"
          className="flex flex-col flex-1 overflow-hidden"
        >
          <App />
        </div>
      </Activity>

      {/* Data Management tab */}
      {activeTab === 'data' && (
        <div
          role="tabpanel"
          id="top-panel-data"
          aria-labelledby="top-tab-data"
          className="flex flex-1 overflow-hidden"
        >
          <DataManagementTab />
        </div>
      )}

      {/* Template Management tab */}
      {activeTab === 'templates' && (
        <div
          role="tabpanel"
          id="top-panel-templates"
          aria-labelledby="top-tab-templates"
          className="flex flex-1 overflow-hidden"
        >
          <TemplateManagementTab />
        </div>
      )}

      {/* Admin tab — content is protected inside AdminTab (login prompt / access denied) */}
      {activeTab === 'admin' && (
        <div
          role="tabpanel"
          id="top-panel-admin"
          aria-labelledby="top-tab-admin"
          className="flex flex-1 overflow-hidden"
        >
          <AdminTab />
        </div>
      )}
    </div>
  )
}

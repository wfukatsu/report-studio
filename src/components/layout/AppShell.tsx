import { Activity } from 'react'
import { useReportStore } from '@/store/reportStore'
import { TopNavigation } from './TopNavigation'
import App from '@/App'
import { DataManagementTab } from '@/components/tabs/DataManagementTab'
import { TemplateManagementTab } from '@/components/tabs/TemplateManagementTab'

export function AppShell() {
  const activeTab = useReportStore((s) => s.activeTab)
  const setActiveTab = useReportStore((s) => s.setActiveTab)

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNavigation activeTab={activeTab} onTabChange={setActiveTab} />

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

      {/* Data Management tab: 条件付きレンダリング（初回アクセス時にマウント） */}
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

      {/* Template Management tab: 条件付きレンダリング */}
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
    </div>
  )
}

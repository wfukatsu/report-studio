import { Activity } from 'react'
import { useReportStore } from '@/store/reportStore'
import { TopNavigation } from './TopNavigation'
import App from '@/App'
import { BindingEditor } from '@/components/bindingEditor/BindingEditor'
import { TemplateManagementTab } from '@/components/tabs/TemplateManagementTab'
import { ResponsesPanel } from '@/components/sidebar/ResponsesPanel'
import { IssuedDocumentsPanel } from '@/components/tabs/IssuedDocumentsPanel'
import { JobHistoryPanel } from '@/components/tabs/JobHistoryPanel'
import { DataSourceTree } from '@/components/dataBrowser/DataSourceTree'
import { DataGrid } from '@/components/dataBrowser/DataGrid'
import { EmptyState } from '@/components/dataBrowser/EmptyState'
import { AdminTab } from '@/components/tabs/AdminTab'
import { useConnectionState } from '@/hooks/useConnectionState'
import { useDataBrowserStore } from '@/store/dataBrowserStore'
import { TableProperties } from 'lucide-react'
import type { TopNavItem } from './TopNavigation'

// Visual grouping: editing surfaces (デザイン/バインド) — resource management
// (テンプレート管理/回答/データブラウザ) — system administration (管理).
// Separators are non-focusable and skipped by arrow-key navigation.
const TABS: readonly TopNavItem[] = [
  { id: 'design',    label: 'デザイン' },
  { id: 'binding',   label: 'バインド' },
  { kind: 'separator' },
  { id: 'templates', label: 'テンプレート管理' },
  { id: 'responses', label: '回答' },
  { id: 'documents', label: '発行済み帳票' },
  { id: 'databrowser', label: 'データブラウザ' },
  { id: 'jobs',      label: 'ジョブ' },
  { kind: 'separator' },
  { id: 'admin',     label: '管理' },
]

export function AppShell() {
  // Start backend health-check polling (sets backendConnected in store)
  // Placed here (outside <Activity>) so the 30-second interval fires regardless
  // of which tab is active, without being suppressed or re-triggered by Activity.
  useConnectionState()

  const activeTab = useReportStore((s) => s.activeTab)
  const setActiveTab = useReportStore((s) => s.setActiveTab)
  const selectedSource = useDataBrowserStore((s) => s.selectedSource)
  const setSource = useDataBrowserStore((s) => s.setSource)

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

      {/* Binding Editor tab (replaces old Data Management tab) */}
      {activeTab === 'binding' && (
        <div
          role="tabpanel"
          id="top-panel-binding"
          aria-labelledby="top-tab-binding"
          className="flex flex-1 overflow-hidden"
        >
          <BindingEditor />
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

      {/* Responses tab */}
      {activeTab === 'responses' && (
        <div
          role="tabpanel"
          id="top-panel-responses"
          aria-labelledby="top-tab-responses"
          className="flex flex-1 overflow-hidden"
        >
          <div className="max-w-3xl w-full">
            <ResponsesPanel />
          </div>
        </div>
      )}

      {/* Issued Documents tab (cross-template) */}
      {activeTab === 'documents' && (
        <div
          role="tabpanel"
          id="top-panel-documents"
          aria-labelledby="top-tab-documents"
          className="flex flex-1 overflow-hidden"
        >
          <IssuedDocumentsPanel />
        </div>
      )}

      {/* Job History tab */}
      {activeTab === 'jobs' && (
        <div
          role="tabpanel"
          id="top-panel-jobs"
          aria-labelledby="top-tab-jobs"
          className="flex flex-1 overflow-hidden"
        >
          <JobHistoryPanel />
        </div>
      )}

      {/* Data Browser tab */}
      {activeTab === 'databrowser' && (
        <div
          role="tabpanel"
          id="top-panel-databrowser"
          aria-labelledby="top-tab-databrowser"
          className="flex flex-1 overflow-hidden"
        >
          <aside className="w-60 shrink-0 border-r overflow-y-auto bg-muted/10" aria-label="データソース選択">
            <DataSourceTree onSelect={setSource} selected={selectedSource} />
          </aside>
          <main className="flex-1 overflow-hidden flex flex-col">
            {selectedSource ? (
              <DataGrid source={selectedSource} />
            ) : (
              <EmptyState
                icon={<TableProperties className="w-10 h-10" />}
                title="データソースを選択してください"
                description="左のツリーからデータソースを選択すると、ここにデータが表示されます"
              />
            )}
          </main>
        </div>
      )}

      {/* Admin tab */}
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

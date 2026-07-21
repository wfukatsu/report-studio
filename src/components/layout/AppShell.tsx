import { Activity, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useReportStore } from '@/store/reportStore'
import { TopNavigation } from './TopNavigation'
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher'
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

export function AppShell() {
  // Start backend health-check polling (sets backendConnected in store)
  // Placed here (outside <Activity>) so the 30-second interval fires regardless
  // of which tab is active, without being suppressed or re-triggered by Activity.
  useConnectionState()

  const { t, i18n } = useTranslation()
  const activeTab = useReportStore((s) => s.activeTab)
  const setActiveTab = useReportStore((s) => s.setActiveTab)
  const selectedSource = useDataBrowserStore((s) => s.selectedSource)
  const setSource = useDataBrowserStore((s) => s.setSource)

  // Visual grouping: editing surfaces (design/binding) — resource management
  // (templates/responses/documents/data browser/jobs) — administration (admin).
  // Separators are non-focusable and skipped by arrow-key navigation.
  // Rebuilt on language change so labels re-translate (dep: i18n.language).
  const tabs = useMemo<readonly TopNavItem[]>(
    () => [
      { id: 'design', label: t('nav.design') },
      { id: 'binding', label: t('nav.binding') },
      { kind: 'separator' },
      { id: 'templates', label: t('nav.templates') },
      { id: 'responses', label: t('nav.responses') },
      { id: 'documents', label: t('nav.documents') },
      { id: 'databrowser', label: t('nav.databrowser') },
      { id: 'jobs', label: t('nav.jobs') },
      { kind: 'separator' },
      { id: 'admin', label: t('nav.admin') },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t is stable; re-translate on language change
    [t, i18n.language],
  )

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="flex items-stretch shrink-0">
        <div className="flex-1 min-w-0">
          <TopNavigation activeTab={activeTab} onTabChange={setActiveTab} tabs={tabs} />
        </div>
        <div className="flex items-center border-b bg-card px-3">
          <LanguageSwitcher />
        </div>
      </div>

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

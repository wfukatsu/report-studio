import { cn } from '@/lib/utils'
import { SchemaPanel } from '@/components/sidebar/SchemaPanel'
import { DataSourcePanel } from '@/components/sidebar/DataSourcePanel'
import { ResponsesPanel } from '@/components/sidebar/ResponsesPanel'
// CalculationTab and ValidationTab are pure content components (no modal chrome).
// They live in modals/ for historical reasons; planned migration to features/ directory.
import { CalculationTab } from '@/components/modals/CalculationTab'
import { ValidationTab } from '@/components/modals/ValidationTab'
import { DataSourceTree } from '@/components/dataBrowser/DataSourceTree'
import { DataGrid } from '@/components/dataBrowser/DataGrid'
import { EmptyState } from '@/components/dataBrowser/EmptyState'
import { TableProperties } from 'lucide-react'

import { useReportStore } from '@/store/reportStore'
import { useDataBrowserStore } from '@/store/dataBrowserStore'
import type { DataSection } from '@/store/types'

const SECTIONS: { id: DataSection; label: string }[] = [
  { id: 'datasource', label: 'データソース' },
  { id: 'schema', label: 'スキーマ定義' },
  { id: 'calculation', label: '計算フィールド' },
  { id: 'validation', label: 'バリデーション' },
  { id: 'responses', label: '回答フィールド' },
  { id: 'databrowser', label: 'データブラウザ' },
]

export function DataManagementTab() {
  const activeSection = useReportStore((s) => s.dataActiveSection)
  const setActiveSection = useReportStore((s) => s.setDataActiveSection)
  const selectedSource = useDataBrowserStore((s) => s.selectedSource)
  const setSource = useDataBrowserStore((s) => s.setSource)

  return (
    <div className="flex w-full h-full overflow-hidden">
      {/* 左サイドナビ */}
      <nav
        aria-label="データ管理セクション"
        className="w-44 shrink-0 border-r bg-card flex flex-col py-2 overflow-y-auto"
      >
        {SECTIONS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveSection(id)}
            className={cn(
              'w-full text-left px-4 py-2 text-sm transition-colors border-l-2',
              activeSection === id
                ? 'border-primary text-primary bg-primary/5 font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            {label}
          </button>
        ))}

      </nav>

      {/* 右コンテンツエリア */}
      <div className="flex-1 overflow-y-auto">
        {activeSection === 'datasource' && <DataSourcePanel />}
        {activeSection === 'schema' && <SchemaPanel />}
        {activeSection === 'calculation' && (
          <div className="p-4">
            <h2 className="text-sm font-semibold mb-4 text-foreground">計算フィールド</h2>
            <CalculationTab />
          </div>
        )}
        {activeSection === 'validation' && (
          <div className="p-4">
            <h2 className="text-sm font-semibold mb-4 text-foreground">バリデーション</h2>
            <ValidationTab />
          </div>
        )}
        {activeSection === 'responses' && <ResponsesPanel />}
        {activeSection === 'databrowser' && (
          <div className="flex flex-1 overflow-hidden h-full">
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
      </div>
    </div>
  )
}

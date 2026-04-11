import { useState, useCallback } from 'react'
import { DataSourcePanel } from '@/components/sidebar/DataSourcePanel'
import { BindingPanel } from '@/components/sidebar/BindingPanel'
import { CalculationTab } from '@/components/modals/CalculationTab'
import { ValidationTab } from '@/components/modals/ValidationTab'
import { DbConnectionTab } from '@/components/modals/DbConnectionTab'
import { cn } from '@/lib/utils'

type TabId = 'datasource' | 'calculation' | 'validation' | 'dbconnection'

const TABS: { id: TabId; label: string }[] = [
  { id: 'datasource', label: 'サンプルデータ' },
  { id: 'calculation', label: '計算フィールド' },
  { id: 'validation', label: '入力検証' },
  { id: 'dbconnection', label: 'データ連携' },
]

interface DataBindingModalProps {
  open: boolean
  onClose: () => void
}

export function DataBindingModal({ open, onClose }: DataBindingModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('datasource')

  const handleTabKeyDown = useCallback((e: React.KeyboardEvent) => {
    const ids = TABS.map((t) => t.id)
    const current = ids.indexOf(activeTab)
    let next: number | null = null
    if (e.key === 'ArrowRight') next = (current + 1) % ids.length
    else if (e.key === 'ArrowLeft') next = (current - 1 + ids.length) % ids.length
    if (next !== null) {
      e.preventDefault()
      setActiveTab(ids[next])
      document.getElementById(`data-tab-${ids[next]}`)?.focus()
    }
  }, [activeTab])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-lg shadow-xl w-[75vw] max-w-5xl h-[80vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <h2 className="text-sm font-semibold">データ設定</h2>
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
          aria-label="データ設定タブ"
          className="flex border-b shrink-0 px-2"
          onKeyDown={handleTabKeyDown}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              id={`data-tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`data-tabpanel-${tab.id}`}
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
          id={`data-tabpanel-${activeTab}`}
          aria-labelledby={`data-tab-${activeTab}`}
          className="flex-1 overflow-y-auto"
        >
          {activeTab === 'datasource' && (
            <div className="flex flex-col gap-0 divide-y">
              <div className="p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  サンプルデータ
                </p>
                <p className="text-[10px] text-muted-foreground mb-3">
                  テンプレート設計用のサンプルデータ。{'{{fieldKey}}'}の参照に使用します。
                </p>
                <DataSourcePanel />
              </div>
              <div className="p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  プレビューデータ
                </p>
                <p className="text-[10px] text-muted-foreground mb-3">
                  プレビューモードで表示するデータ（省略時はサンプルデータを使用）
                </p>
                <BindingPanel />
              </div>
            </div>
          )}
          {activeTab === 'calculation' && <CalculationTab />}
          {activeTab === 'validation' && <ValidationTab />}
          {activeTab === 'dbconnection' && <DbConnectionTab />}
        </div>
      </div>
    </div>
  )
}


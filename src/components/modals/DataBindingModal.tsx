import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { DataSourcePanel } from '@/components/sidebar/DataSourcePanel'
import { BindingPanel } from '@/components/sidebar/BindingPanel'
import { CalculationTab } from '@/components/modals/CalculationTab'
import { ValidationTab } from '@/components/modals/ValidationTab'
import { TenantInfoTab } from '@/components/modals/TenantInfoTab'
import { ProductMasterTab } from '@/components/modals/ProductMasterTab'
import { WebhookTab } from '@/components/modals/WebhookTab'
import { cn } from '@/lib/utils'

// BindingMapperTab and DbConnectionTab removed — their functionality is now in BindingEditor.
type TabId = 'datasource' | 'calculation' | 'validation' | 'tenantinfo' | 'productmaster' | 'webhook'

// `as const satisfies` keeps `labelKey` as literal key types so `t(tab.labelKey)`
// type-checks against the typed i18next catalog (#329).
const TABS = [
  { id: 'datasource', labelKey: 'dataBindingModal.tabDatasource' },
  { id: 'calculation', labelKey: 'dataBindingModal.tabCalculation' },
  { id: 'validation', labelKey: 'dataBindingModal.tabValidation' },
  { id: 'tenantinfo', labelKey: 'dataBindingModal.tabTenantinfo' },
  { id: 'productmaster', labelKey: 'dataBindingModal.tabProductmaster' },
  { id: 'webhook', labelKey: 'dataBindingModal.tabWebhook' },
] as const satisfies readonly { id: TabId; labelKey: string }[]

interface DataBindingModalProps {
  open: boolean
  onClose: () => void
}

export function DataBindingModal({ open, onClose }: DataBindingModalProps) {
  const { t } = useTranslation('modals')
  const [activeTab, setActiveTab] = useState<TabId>('datasource')
  const modalRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    // 開いたトリガー要素を記録（閉じた後にフォーカスを戻す）
    openerRef.current = document.activeElement as HTMLElement

    // 最初のタブボタンにフォーカス（アニメーション完了後）
    const timer = setTimeout(() => {
      document.getElementById(`data-tab-${TABS[0].id}`)?.focus()
    }, 50)

    // フォーカストラップ — Tab/Shift+Tab をモーダル内で循環させる
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const modal = modalRef.current
      if (!modal) return
      const focusable = modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const handleClose = useCallback(() => {
    onClose()
    // モーダルを閉じたらトリガー要素にフォーカスを戻す
    setTimeout(() => openerRef.current?.focus(), 0)
  }, [onClose])

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="data-binding-modal-title"
      onKeyDown={(e) => { if (e.key === 'Escape') handleClose() }}
    >
      <div ref={modalRef} className="bg-background border border-border rounded-lg shadow-xl w-[75vw] max-w-5xl h-[80vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <h2 id="data-binding-modal-title" className="text-sm font-semibold">{t('dataBindingModal.title')}</h2>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground text-xs px-2 py-1 rounded hover:bg-accent transition-colors"
            aria-label={t('dataBindingModal.close')}
          >
            ✕
          </button>
        </div>

        {/* Tab bar */}
        <div
          role="tablist"
          aria-label={t('dataBindingModal.tablistLabel')}
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
              {t(tab.labelKey)}
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
                  {t('dataBindingModal.sampleData')}
                </p>
                <p className="text-[10px] text-muted-foreground mb-3">
                  {t('dataBindingModal.sampleDataHint', { token: '{{fieldKey}}' })}
                </p>
                <DataSourcePanel />
              </div>
              <div className="p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  {t('dataBindingModal.previewData')}
                </p>
                <p className="text-[10px] text-muted-foreground mb-3">
                  {t('dataBindingModal.previewDataHint')}
                </p>
                <BindingPanel />
              </div>
            </div>
          )}
          {activeTab === 'calculation' && <CalculationTab />}
          {activeTab === 'validation' && <ValidationTab />}
          {activeTab === 'tenantinfo' && <TenantInfoTab />}
          {activeTab === 'productmaster' && <ProductMasterTab />}
          {activeTab === 'webhook' && <WebhookTab />}
        </div>
      </div>
    </div>
  )
}

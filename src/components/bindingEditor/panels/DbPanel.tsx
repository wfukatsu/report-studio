/**
 * DbPanel — Right panel of the BindingEditor.
 *
 * Accordion-style panel showing ScalarDB table bindings for each schema group.
 * Reuses the existing DbConnectionTab's catalog fetch and GroupBindingSection.
 */

import { lazy, memo, Suspense, useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Database, RefreshCw, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useReportStore } from '@/store'
import { fetchScalarDbCatalogCached } from '@/api/reportApi'
import type { ScalarDbCatalog } from '@/api/reportApi'
import { GroupBindingSection } from '@/components/modals/dbConnection/GroupBindingSection'
import { classifyError, type UserFacingError } from '@/lib/userFacingError'
import { InlineErrorBanner } from '@/components/common/InlineErrorBanner'

const CreateTableForm = lazy(() =>
  import('@/components/modals/dbConnection/CreateTableForm').then((m) => ({
    default: m.CreateTableForm,
  })),
)

interface DbPanelProps {
  readonly collapsed: boolean
  readonly onToggle: () => void
}

export const DbPanel = memo(function DbPanel({
  collapsed,
  onToggle,
}: DbPanelProps) {
  const schema = useReportStore((s) => s.definition.schema)
  const groups = schema?.groups ?? []

  const [catalog, setCatalog] = useState<ScalarDbCatalog | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<UserFacingError | null>(null)
  const [fetchTick, setFetchTick] = useState(0)
  const [createFormGroupId, setCreateFormGroupId] = useState<string | null>(null)

  // Fetch catalog
  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    setIsLoading(true)
    setFetchError(null)
    fetchScalarDbCatalogCached(controller.signal, fetchTick > 0)
      .then((result) => {
        if (cancelled) return
        setCatalog(result)
        setIsLoading(false)
      })
      .catch((err) => {
        if (cancelled || controller.signal.aborted) return
        setFetchError(classifyError(err))
        setIsLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [fetchTick])

  const handleRefetch = useCallback(() => {
    setFetchTick((n) => n + 1)
  }, [])

  const handleCreateFormOpen = useCallback((groupId: string) => {
    setCreateFormGroupId(groupId)
  }, [])

  const handleCreateFormClose = useCallback(() => {
    setCreateFormGroupId(null)
    handleRefetch()
  }, [handleRefetch])

  // Collapsed strip
  if (collapsed) {
    return (
      <div
        className="flex flex-col items-center justify-center w-8 h-full border-l bg-muted/10 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-label="DBパネルを展開"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle() }}
      >
        <Database className="w-4 h-4 text-muted-foreground mb-1" />
        <span className="text-[9px] text-muted-foreground writing-mode-vertical">
          DB ({groups.filter((g) => g.tableMeta != null).length})
        </span>
        <ChevronLeft className="w-3 h-3 text-muted-foreground mt-1" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden border-l">
      {/* Header */}
      <div className="flex items-center gap-1 px-3 py-2 border-b bg-muted/30 shrink-0">
        <Database className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex-1">
          DB接続
        </p>
        <button
          className="text-muted-foreground hover:text-foreground p-0.5"
          onClick={handleRefetch}
          title="カタログを再取得"
          disabled={isLoading}
        >
          <RefreshCw className={cn('w-3 h-3', isLoading && 'animate-spin')} />
        </button>
        <button
          className="text-muted-foreground hover:text-foreground p-0.5"
          onClick={onToggle}
          aria-label="DBパネルを折りたたむ"
        >
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-20">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {fetchError && (
          <div className="px-3 py-2">
            <InlineErrorBanner error={fetchError} onRetry={handleRefetch} tone="destructive" />
          </div>
        )}

        {!isLoading && !fetchError && groups.length === 0 && (
          <div className="px-3 py-4 text-[10px] text-muted-foreground text-center">
            スキーマグループがありません。<br />
            中央パネルでグループを追加してください。
          </div>
        )}

        {!isLoading && !fetchError && catalog && groups.map((group) => (
          <div key={group.id} className="border-b last:border-b-0">
            <GroupBindingSection
              group={group}
              catalog={catalog}
              onShowCreate={() => handleCreateFormOpen(group.id)}
              showCreateForm={createFormGroupId === group.id}
              createFormSlot={
                createFormGroupId === group.id ? (
                  <Suspense
                    fallback={
                      <div className="px-3 py-2">
                        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                      </div>
                    }
                  >
                    <CreateTableForm
                      group={group}
                      namespaces={catalog.namespaces.map((ns) => ns.name)}
                      onSuccess={handleCreateFormClose}
                      onCancel={() => setCreateFormGroupId(null)}
                    />
                  </Suspense>
                ) : undefined
              }
            />
          </div>
        ))}
      </div>
    </div>
  )
})

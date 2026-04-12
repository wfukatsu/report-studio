import { useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowLeft, TableProperties } from 'lucide-react'
import { useReportStore } from '@/store'
import type { DataSourceNode } from '@/store/dataBrowserSlice'
import { DataSourceTree } from '@/components/dataBrowser/DataSourceTree'
import { DataGrid } from '@/components/dataBrowser/DataGrid'
import { EmptyState } from '@/components/dataBrowser/EmptyState'

export function DataBrowserPage() {
  const currentUser = useReportStore((s) => s.currentUser)
  const authLoading = useReportStore((s) => s.authLoading)
  const checkAuth = useReportStore((s) => s.checkAuth)
  const selectedSource = useReportStore((s) => s.dataBrowserSelectedSource)
  const setSource = useReportStore((s) => s.setDataBrowserSource)

  // Ensure auth state is initialized
  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Redirect to root if not authenticated
  if (!authLoading && !currentUser) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-2.5 border-b shrink-0 bg-background">
        <Link
          to="/"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          aria-label="デザイナーに戻る"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          デザイナーに戻る
        </Link>
        <div className="w-px h-4 bg-border" />
        <div className="flex items-center gap-2">
          <TableProperties className="w-4 h-4 text-primary" />
          <h1 className="text-sm font-semibold">データブラウザ</h1>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar: source tree */}
        <aside
          className="w-60 shrink-0 border-r overflow-y-auto bg-muted/10"
          aria-label="データソース選択"
        >
          <DataSourceTree
            onSelect={(node: DataSourceNode) => setSource(node)}
            selected={selectedSource}
          />
        </aside>

        {/* Right pane: data grid */}
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
    </div>
  )
}

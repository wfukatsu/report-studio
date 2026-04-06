import { Plus, Trash2 } from 'lucide-react'
import { useReportStore } from '@/store/reportStore'
import { cn } from '@/lib/utils'

export function PagePanel() {
  const pages = useReportStore((s) => s.definition.pages)
  const activePageId = useReportStore((s) => s.selection.activePageId)
  const addPage = useReportStore((s) => s.addPage)
  const removePage = useReportStore((s) => s.removePage)
  const setActivePage = useReportStore((s) => s.setActivePage)
  const renamePage = useReportStore((s) => s.renamePage)

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          ページ一覧
        </p>
        <button
          onClick={() => addPage()}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="ページを追加"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-1">
        {pages.map((page) => (
          <div
            key={page.id}
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer group transition-colors',
              page.id === activePageId
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent',
            )}
            onClick={() => setActivePage(page.id)}
          >
            <input
              type="text"
              className={cn(
                'flex-1 text-xs bg-transparent outline-none min-w-0 truncate',
                page.id === activePageId ? 'text-primary-foreground' : '',
              )}
              value={page.name}
              onChange={(e) => renamePage(page.id, e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
            {pages.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(`「${page.name}」を削除しますか？この操作は元に戻せません。`)) {
                    removePage(page.id)
                  }
                }}
                className={cn(
                  'opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity',
                  page.id === activePageId
                    ? 'text-primary-foreground hover:text-primary-foreground/70'
                    : 'text-muted-foreground hover:text-destructive',
                )}
                title="ページを削除"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

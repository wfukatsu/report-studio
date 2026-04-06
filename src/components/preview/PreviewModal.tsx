import { useReportStore } from '@/store/reportStore'
import { ReportCanvas } from '@/components/canvas/ReportCanvas'

export function LivePreviewPanel() {
  const pages = useReportStore((s) => s.definition.pages)
  const dataSource = useReportStore((s) => s.definition.dataSources[0] ?? null)
  const data = (dataSource?.fields as Record<string, unknown> | undefined) ?? {}

  return (
    <div className="flex flex-col items-center gap-8 p-8 bg-muted/30 overflow-auto h-full">
      <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold self-start">
        Preview — {pages.length} page{pages.length !== 1 ? 's' : ''}
      </p>
      {pages.map((page) => (
        <div key={page.id} className="flex flex-col items-center gap-2">
          <ReportCanvas readonly pageOverride={page} dataOverride={data} />
          <p className="text-xs text-muted-foreground">{page.name}</p>
        </div>
      ))}
    </div>
  )
}

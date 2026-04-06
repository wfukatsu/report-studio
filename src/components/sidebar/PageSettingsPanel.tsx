import { useReportStore, selectActivePage } from '@/store/reportStore'
import { PAPER_SIZES } from '@/lib/paperSizes'
import type { PaperSize } from '@/types'

interface PageSettingsPanelProps {
  onTemplateChange?: () => void
}

export function PageSettingsPanel({ onTemplateChange }: PageSettingsPanelProps) {
  const activePage = useReportStore(selectActivePage)
  const renamePage = useReportStore((s) => s.renamePage)
  const updatePageBackground = useReportStore((s) => s.updatePageBackground)
  const pageSettings = useReportStore((s) => s.definition.pageSettings)
  const updateSettings = useReportStore((s) => s.updateSettings)

  if (!activePage) {
    return <div className="p-4 text-xs text-muted-foreground">ページがありません。</div>
  }

  return (
    <div className="p-3 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        ページ設定
      </p>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">ページ名</label>
        <input
          className="w-full border rounded px-2 py-1 text-xs bg-background"
          value={activePage.name}
          onChange={(e) => renamePage(activePage.id, e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">用紙サイズ</label>
        <div className="flex items-center gap-2">
          <select
            className="flex-1 border rounded px-1.5 py-1 text-xs bg-background"
            value={pageSettings.paperSize}
            onChange={(e) => updateSettings({ paperSize: e.target.value as PaperSize })}
          >
            {Object.keys(PAPER_SIZES).filter((k) => k !== 'custom').map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {activePage.width}×{activePage.height}mm
          </span>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">用紙方向</label>
        <div className="flex gap-1">
          {(['portrait', 'landscape'] as const).map((ori) => (
            <button
              key={ori}
              className={`flex-1 px-2 py-1 text-xs rounded border transition-colors ${
                pageSettings.orientation === ori
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-accent'
              }`}
              onClick={() => updateSettings({ orientation: ori })}
            >
              {ori === 'portrait' ? '縦 (Portrait)' : '横 (Landscape)'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">余白 (mm)</label>
        <div className="grid grid-cols-2 gap-1">
          {([
            ['top', '上'],
            ['right', '右'],
            ['bottom', '下'],
            ['left', '左'],
          ] as const).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground w-4">{label}</span>
              <input
                type="number"
                min={0}
                step={1}
                className="w-12 border rounded px-1.5 py-1 text-xs bg-background"
                value={pageSettings.margins[key]}
                onChange={(e) =>
                  updateSettings({
                    margins: { ...pageSettings.margins, [key]: Number(e.target.value) },
                  })
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">背景色</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            className="w-8 h-7 rounded cursor-pointer border"
            value={activePage.background ?? '#ffffff'}
            onChange={(e) => updatePageBackground(activePage.id, e.target.value)}
          />
          <span className="text-xs text-muted-foreground">{activePage.background ?? '#ffffff'}</span>
        </div>
      </div>

      {onTemplateChange && (
        <div className="pt-2 border-t">
          <button
            onClick={onTemplateChange}
            className="w-full px-3 py-1.5 text-xs border rounded hover:bg-accent transition-colors"
          >
            テンプレートを変更...
          </button>
        </div>
      )}
    </div>
  )
}

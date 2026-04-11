import { useReportStore, selectActivePage } from '@/store/reportStore'
import { PAPER_SIZES, PAPER_SIZE_ORDER, getMarginPresets } from '@/lib/paperSizes'
import { BUILTIN_TEMPLATES } from '@/templates/builtinTemplates'
import { CategoryCombobox } from '@/components/common/CategoryCombobox'
import { TagInput } from '@/components/common/TagInput'
import type { PaperSize, Section } from '@/types'

interface PageSettingsPanelProps {
  onTemplateChange?: () => void
}

export function PageSettingsPanel({ onTemplateChange }: PageSettingsPanelProps) {
  const activePage = useReportStore(selectActivePage)
  const renamePage = useReportStore((s) => s.renamePage)
  const updatePageBackground = useReportStore((s) => s.updatePageBackground)
  const pageSettings = useReportStore((s) => s.definition.pageSettings)
  const updateSettings = useReportStore((s) => s.updateSettings)
  const metadata = useReportStore((s) => s.definition.metadata)
  const updateMetadata = useReportStore((s) => s.updateMetadata)
  const masterHeader = useReportStore((s) => s.definition.masterHeader) as Section | undefined
  const masterFooter = useReportStore((s) => s.definition.masterFooter) as Section | undefined
  const setMasterHeader = useReportStore((s) => s.setMasterHeader)
  const setMasterFooter = useReportStore((s) => s.setMasterFooter)

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
            {PAPER_SIZE_ORDER.map((size) => (
              <option key={size} value={size}>{PAPER_SIZES[size].label}</option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {activePage.width}×{activePage.height}mm
          </span>
        </div>
        {pageSettings.paperSize === 'custom' && (
          <div className="flex items-center gap-1 mt-1">
            <span className="text-xs text-muted-foreground w-4">幅</span>
            <input
              type="number"
              min={10}
              max={1000}
              step={1}
              className="w-16 border rounded px-1.5 py-1 text-xs bg-background"
              value={activePage.width}
              onChange={(e) => {
                const w = Number(e.target.value)
                if (w > 0) updateSettings({ customWidth: w })
              }}
            />
            <span className="text-xs text-muted-foreground w-4">高</span>
            <input
              type="number"
              min={10}
              max={1000}
              step={1}
              className="w-16 border rounded px-1.5 py-1 text-xs bg-background"
              value={activePage.height}
              onChange={(e) => {
                const h = Number(e.target.value)
                if (h > 0) updateSettings({ customHeight: h })
              }}
            />
            <span className="text-xs text-muted-foreground">mm</span>
          </div>
        )}
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
        <div className="flex gap-1 mb-1">
          {(() => {
            const presets = getMarginPresets(pageSettings.paperSize)
            return [
              ['標準', presets.standard],
              ['狭い', presets.narrow],
              ['最小', presets.minimum],
              ['なし', 0],
            ] as const
          })().map(([label, v]) => (
            <button
              key={label}
              className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                pageSettings.margins.top === v && pageSettings.margins.right === v &&
                pageSettings.margins.bottom === v && pageSettings.margins.left === v
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-accent border-border'
              }`}
              onClick={() => updateSettings({ margins: { top: v, right: v, bottom: v, left: v } })}
            >
              {label}
            </button>
          ))}
        </div>
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

      {(masterHeader || masterFooter) && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            {masterHeader && masterFooter ? 'ヘッダー/フッター' : masterHeader ? 'ヘッダー' : 'フッター'}高さ (mm)
          </label>
          <div className="grid grid-cols-2 gap-1">
            {masterHeader && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground w-10">ヘッダー</span>
                <input
                  type="number"
                  min={10}
                  max={100}
                  step={1}
                  className="w-14 border rounded px-1.5 py-1 text-xs bg-background"
                  value={masterHeader.height}
                  onChange={(e) => {
                    const h = Number(e.target.value)
                    if (h >= 10) setMasterHeader({ ...masterHeader, height: h })
                  }}
                />
              </div>
            )}
            {masterFooter && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground w-10">フッター</span>
                <input
                  type="number"
                  min={10}
                  max={100}
                  step={1}
                  className="w-14 border rounded px-1.5 py-1 text-xs bg-background"
                  value={masterFooter.height}
                  onChange={(e) => {
                    const h = Number(e.target.value)
                    if (h >= 10) setMasterFooter({ ...masterFooter, height: h })
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

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

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">カテゴリ</label>
        <CategoryCombobox
          value={metadata.category}
          options={[...new Set(BUILTIN_TEMPLATES.map((t) => t.category).filter(Boolean) as string[])]}
          onChange={(v) => updateMetadata({ category: v })}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">タグ</label>
        <TagInput
          value={metadata.tags ?? []}
          onChange={(tags) => updateMetadata({ tags })}
        />
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

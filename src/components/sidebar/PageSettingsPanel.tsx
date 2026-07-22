import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { useReportStore, selectActivePage } from '@/store/reportStore'
import { getSequenceConfig, updateSequenceConfig } from '@/api/reportApi'
import type { SequenceConfig } from '@/api/reportApi'
import { InlineErrorBanner } from '@/components/common/InlineErrorBanner'
import { classifyError, type UserFacingError } from '@/lib/userFacingError'
import { getErrorCopy } from '@/lib/userFacingErrorMessages'
import { PAPER_SIZES, PAPER_SIZE_ORDER, getMarginPresets } from '@/lib/paperSizes'
import { CategoryCombobox } from '@/components/common/CategoryCombobox'
import { TagInput } from '@/components/common/TagInput'
import type { PaperSize, Section } from '@/types'

interface PageSettingsPanelProps {
  onTemplateChange?: () => void
}

export function PageSettingsPanel({ onTemplateChange }: PageSettingsPanelProps) {
  const { t } = useTranslation('components')
  const { t: tErr } = useTranslation('serverErrors')
  const [metaOpen, setMetaOpen] = useState(false)
  const [seqOpen, setSeqOpen] = useState(false)
  const [seqConfig, setSeqConfig] = useState<SequenceConfig | null>(null)
  const [seqSaving, setSeqSaving] = useState(false)
  const [seqLoadError, setSeqLoadError] = useState<UserFacingError | null>(null)
  const activePage = useReportStore(selectActivePage)
  const currentTemplateId = useReportStore((s) => s.currentTemplateId)

  // Retry handler (event) — clears the error immediately for instant feedback.
  const loadSeqConfig = useCallback(async () => {
    if (!currentTemplateId) return
    setSeqLoadError(null)
    try {
      setSeqConfig(await getSequenceConfig(currentTemplateId))
    } catch (err) {
      setSeqLoadError(classifyError(err))
    }
  }, [currentTemplateId])

  // Fetch when the section opens — state updates happen only in the promise
  // callbacks so the effect body performs no synchronous setState.
  useEffect(() => {
    if (!seqOpen || !currentTemplateId) return
    getSequenceConfig(currentTemplateId)
      .then((cfg) => {
        setSeqConfig(cfg)
        setSeqLoadError(null)
      })
      .catch((err) => setSeqLoadError(classifyError(err)))
  }, [seqOpen, currentTemplateId])

  const handleSeqSave = async () => {
    if (!currentTemplateId || !seqConfig || seqSaving) return
    setSeqSaving(true)
    try {
      const updated = await updateSequenceConfig(currentTemplateId, seqConfig)
      setSeqConfig(updated)
    } catch (err) {
      const copy = getErrorCopy(classifyError(err).code, tErr)
      toast.error(t('sidebar.pageSettingsPanel.seqSaveFailed'), { description: copy.hint, duration: 6000 })
    }
    finally { setSeqSaving(false) }
  }
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
    return <div className="p-4 text-xs text-muted-foreground">{t('sidebar.pageSettingsPanel.noPage')}</div>
  }

  return (
    <div className="p-3 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {t('sidebar.pageSettingsPanel.heading')}
      </p>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{t('sidebar.pageSettingsPanel.pageName')}</label>
        <input
          className="w-full border rounded px-2 py-1 text-xs bg-background"
          value={activePage.name}
          onChange={(e) => renamePage(activePage.id, e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{t('sidebar.pageSettingsPanel.paperSize')}</label>
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
            <span className="text-xs text-muted-foreground w-4">{t('sidebar.pageSettingsPanel.customWidth')}</span>
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
            <span className="text-xs text-muted-foreground w-4">{t('sidebar.pageSettingsPanel.customHeight')}</span>
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
        <label className="text-xs text-muted-foreground">{t('sidebar.pageSettingsPanel.orientation')}</label>
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
              {ori === 'portrait' ? t('sidebar.pageSettingsPanel.orientationPortrait') : t('sidebar.pageSettingsPanel.orientationLandscape')}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{t('sidebar.pageSettingsPanel.margins')}</label>
        <div className="flex gap-1 mb-1">
          {(() => {
            const presets = getMarginPresets(pageSettings.paperSize)
            return [
              ['sidebar.pageSettingsPanel.marginStandard', presets.standard],
              ['sidebar.pageSettingsPanel.marginNarrow', presets.narrow],
              ['sidebar.pageSettingsPanel.marginMinimum', presets.minimum],
              ['sidebar.pageSettingsPanel.marginNone', 0],
            ] as const
          })().map(([labelKey, v]) => (
            <button
              key={labelKey}
              className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                pageSettings.margins.top === v && pageSettings.margins.right === v &&
                pageSettings.margins.bottom === v && pageSettings.margins.left === v
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-accent border-border'
              }`}
              onClick={() => updateSettings({ margins: { top: v, right: v, bottom: v, left: v } })}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1">
          {([
            ['top', 'sidebar.pageSettingsPanel.marginTop'],
            ['right', 'sidebar.pageSettingsPanel.marginRight'],
            ['bottom', 'sidebar.pageSettingsPanel.marginBottom'],
            ['left', 'sidebar.pageSettingsPanel.marginLeft'],
          ] as const).map(([key, labelKey]) => (
            <div key={key} className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground w-4">{t(labelKey)}</span>
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
            {masterHeader && masterFooter ? t('sidebar.pageSettingsPanel.hfHeaderFooter') : masterHeader ? t('sidebar.pageSettingsPanel.hfHeader') : t('sidebar.pageSettingsPanel.hfFooter')}{t('sidebar.pageSettingsPanel.heightSuffix')}
          </label>
          <div className="grid grid-cols-2 gap-1">
            {masterHeader && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground w-10">{t('sidebar.pageSettingsPanel.hfHeader')}</span>
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
                <span className="text-xs text-muted-foreground w-10">{t('sidebar.pageSettingsPanel.hfFooter')}</span>
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
        <label className="text-xs text-muted-foreground">{t('sidebar.pageSettingsPanel.background')}</label>
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

      {/* Metadata section — collapsible */}
      <div className="border rounded">
        <button
          type="button"
          onClick={() => setMetaOpen((v) => !v)}
          aria-expanded={metaOpen}
          className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
        >
          {metaOpen
            ? <ChevronDown className="w-3 h-3 shrink-0" />
            : <ChevronRight className="w-3 h-3 shrink-0" />}
          {t('sidebar.pageSettingsPanel.metadata')}
        </button>

        {metaOpen && (
          <div className="px-2 pb-2 space-y-2 border-t pt-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t('sidebar.pageSettingsPanel.version')}</label>
              <input
                className="w-full border rounded px-2 py-1 text-xs bg-background"
                value={metadata.version ?? ''}
                placeholder={t('sidebar.pageSettingsPanel.versionPlaceholder')}
                onChange={(e) => updateMetadata({ version: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t('sidebar.pageSettingsPanel.reportType')}</label>
              <input
                className="w-full border rounded px-2 py-1 text-xs bg-background"
                value={metadata.reportType ?? ''}
                placeholder={t('sidebar.pageSettingsPanel.reportTypePlaceholder')}
                onChange={(e) => updateMetadata({ reportType: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t('sidebar.pageSettingsPanel.description')}</label>
              <textarea
                className="w-full border rounded px-2 py-1 text-xs bg-background resize-none"
                rows={2}
                value={metadata.description ?? ''}
                onChange={(e) => updateMetadata({ description: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t('sidebar.pageSettingsPanel.applicableRegulation')}</label>
              <input
                className="w-full border rounded px-2 py-1 text-xs bg-background"
                value={metadata.applicableRegulation ?? ''}
                onChange={(e) => updateMetadata({ applicableRegulation: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-1">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t('sidebar.pageSettingsPanel.effectiveFrom')}</label>
                <input
                  type="date"
                  className="w-full border rounded px-1.5 py-1 text-xs bg-background"
                  value={metadata.effectiveFrom ?? ''}
                  onChange={(e) => updateMetadata({ effectiveFrom: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t('sidebar.pageSettingsPanel.effectiveTo')}</label>
                <input
                  type="date"
                  className="w-full border rounded px-1.5 py-1 text-xs bg-background"
                  value={metadata.effectiveTo ?? ''}
                  onChange={(e) => updateMetadata({ effectiveTo: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t('sidebar.pageSettingsPanel.category')}</label>
              <CategoryCombobox
                value={metadata.category}
                options={[]}
                onChange={(v) => updateMetadata({ category: v })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t('sidebar.pageSettingsPanel.tags')}</label>
              <TagInput
                value={metadata.tags ?? []}
                onChange={(tags) => updateMetadata({ tags })}
              />
            </div>
          </div>
        )}
      </div>

      {/* Sequence numbering section */}
      {currentTemplateId && (
        <div className="border rounded">
          <button type="button" onClick={() => setSeqOpen(v => !v)} aria-expanded={seqOpen}
            className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors">
            {seqOpen ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
            {t('sidebar.pageSettingsPanel.sequence')}
          </button>
          {seqOpen && (
            <div className="px-2 pb-2 space-y-2 border-t pt-2">
              <p className="text-[10px] text-muted-foreground">
                {t('sidebar.pageSettingsPanel.seqHintBefore')}<code className="bg-muted px-0.5 rounded">{`{{documentNumber}}`}</code>{t('sidebar.pageSettingsPanel.seqHintAfter')}
              </p>
              {seqLoadError && (
                <InlineErrorBanner error={seqLoadError} onRetry={loadSeqConfig} />
              )}
              {seqConfig && (
                <>
                  <div className="grid grid-cols-3 gap-1">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-muted-foreground">{t('sidebar.pageSettingsPanel.seqPrefix')}</label>
                      <input value={seqConfig.prefix ?? ''} onChange={e => setSeqConfig(s => s ? {...s, prefix: e.target.value} : s)}
                        placeholder="QUO-" className="border rounded px-1.5 py-1 text-xs bg-background" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-muted-foreground">{t('sidebar.pageSettingsPanel.seqDigits')}</label>
                      <input type="number" min={1} max={10} value={seqConfig.digits ?? 4}
                        onChange={e => setSeqConfig(s => s ? {...s, digits: parseInt(e.target.value)||4} : s)}
                        className="border rounded px-1.5 py-1 text-xs bg-background" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-muted-foreground">{t('sidebar.pageSettingsPanel.seqSuffix')}</label>
                      <input value={seqConfig.suffix ?? ''} onChange={e => setSeqConfig(s => s ? {...s, suffix: e.target.value} : s)}
                        className="border rounded px-1.5 py-1 text-xs bg-background" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">{t('sidebar.pageSettingsPanel.seqYearlyReset')}</label>
                    <input type="checkbox" checked={seqConfig.resetOn === 'year'}
                      onChange={e => setSeqConfig(s => s ? {...s, resetOn: e.target.checked ? 'year' : null} : s)} />
                    <span className="text-[10px] text-muted-foreground">{t('sidebar.pageSettingsPanel.seqYearlyResetHint')}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {t('sidebar.pageSettingsPanel.seqNextNumber')}<code className="bg-muted px-1 rounded">{(seqConfig.prefix ?? '') + String(((seqConfig.counter ?? 0) + 1)).padStart(seqConfig.digits ?? 4, '0') + (seqConfig.suffix ?? '')}</code>
                  </p>
                  <button onClick={handleSeqSave} disabled={seqSaving}
                    className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-60">
                    {seqSaving ? t('sidebar.pageSettingsPanel.seqSaving') : t('sidebar.pageSettingsPanel.seqSave')}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {onTemplateChange && (
        <div className="pt-2 border-t">
          <button
            onClick={onTemplateChange}
            className="w-full px-3 py-1.5 text-xs border rounded hover:bg-accent transition-colors"
          >
            {t('sidebar.pageSettingsPanel.changeTemplate')}
          </button>
        </div>
      )}
    </div>
  )
}

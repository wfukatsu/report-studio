import { useTranslation } from 'react-i18next'
import type { RepeatingBandField } from '@/types'

// ---------------------------------------------------------------------------
// Interactive column context menu for design preview
// ---------------------------------------------------------------------------

export interface ColumnMenuState {
  x: number
  y: number
  colIndex: number
}

const INLINE_FORMAT_OPTIONS = [
  { value: '', labelKey: 'repeatingBand.inlineFormat.none' },
  { value: 'integer', labelKey: 'repeatingBand.inlineFormat.integer' },
  { value: 'comma', labelKey: 'repeatingBand.inlineFormat.comma' },
  { value: 'currency_jpy', labelKey: 'repeatingBand.inlineFormat.currencyJpy' },
  { value: 'percent', labelKey: 'repeatingBand.inlineFormat.percent' },
] as const satisfies readonly { value: string; labelKey: string }[]

/**
 * ColumnEditor — Floating panel for editing a selected column's properties.
 * Opened by clicking a header cell. Edit label, key, width, align, format.
 * Move, insert, and delete via action buttons at the bottom.
 */
export function ColumnEditor({
  menu, fields, onFieldsChange, onClose,
}: {
  menu: ColumnMenuState
  fields: RepeatingBandField[]
  onFieldsChange: (fields: RepeatingBandField[]) => void
  onClose: () => void
}) {
  const { t } = useTranslation('elements')
  const { colIndex } = menu
  const field = fields[colIndex]
  if (!field) return null

  const canMoveLeft = colIndex > 0
  const canMoveRight = colIndex < fields.length - 1

  function update(patch: Partial<RepeatingBandField>) {
    const next = fields.map((f, i): RepeatingBandField =>
      i === colIndex ? { ...f, ...patch } : f,
    )
    onFieldsChange(next)
  }

  function swap(i: number, j: number) {
    const next = [...fields]
    const tmp = next[i]
    next[i] = next[j]
    next[j] = tmp
    onFieldsChange(next)
  }

  // Clamp position to viewport
  const panelW = 220
  const panelH = 340
  const left = Math.max(8, Math.min(menu.x, window.innerWidth - panelW - 8))
  const top = Math.max(8, Math.min(menu.y + 4, window.innerHeight - panelH - 8))

  return (
    <>
      {/* Invisible backdrop to close on outside click */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={onClose} />
      <div
        style={{ position: 'fixed', left, top, zIndex: 9999 }}
        className="bg-background border rounded-lg shadow-xl p-3 text-xs w-[220px] space-y-2"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-foreground">{t('repeatingBand.editColumn', { n: colIndex + 1 })}</span>
        <button className="text-muted-foreground hover:text-foreground text-sm leading-none" onClick={onClose}>✕</button>
      </div>

      <label className="flex flex-col gap-0.5">
        <span className="text-muted-foreground">{t('repeatingBand.headerLabel')}</span>
        <input type="text" className="border rounded px-2 py-1 text-xs bg-background" value={field.label} onChange={(e) => update({ label: e.target.value })} autoFocus />
      </label>

      <label className="flex flex-col gap-0.5">
        <span className="text-muted-foreground">{t('repeatingBand.fieldKey')}</span>
        <input type="text" className="border rounded px-2 py-1 text-xs bg-background font-mono" value={field.key} onChange={(e) => update({ key: e.target.value })} />
      </label>

      <div className="grid grid-cols-2 gap-1.5">
        <label className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">{t('repeatingBand.widthMm')}</span>
          <input type="number" min={5} step={1} className="border rounded px-2 py-1 text-xs bg-background" value={field.width} onChange={(e) => update({ width: Number(e.target.value) })} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">{t('repeatingBand.align')}</span>
          <select className="border rounded px-1 py-1 text-xs bg-background" value={field.align ?? 'left'} onChange={(e) => update({ align: e.target.value as 'left' | 'center' | 'right' })}>
            <option value="left">{t('repeatingBand.alignLeft')}</option>
            <option value="center">{t('repeatingBand.alignCenter')}</option>
            <option value="right">{t('repeatingBand.alignRight')}</option>
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-0.5">
        <span className="text-muted-foreground">{t('repeatingBand.format')}</span>
        <select
          className="border rounded px-1 py-1 text-xs bg-background"
          value={field.format?.type ?? ''}
          onChange={(e) => {
            const v = e.target.value
            update({ format: v ? { type: v } as RepeatingBandField['format'] : undefined })
          }}
        >
          {INLINE_FORMAT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-1 pt-1 border-t">
        <button className="px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded disabled:opacity-30" disabled={!canMoveLeft} onClick={() => swap(colIndex, colIndex - 1)} title={t('repeatingBand.moveLeft')}>←</button>
        <button className="px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded disabled:opacity-30" disabled={!canMoveRight} onClick={() => swap(colIndex, colIndex + 1)} title={t('repeatingBand.moveRight')}>→</button>
        <button
          className="px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
          onClick={() => {
            const next = [...fields]
            next.splice(colIndex + 1, 0, { key: 'new_field', label: t('repeatingBand.newColumnLabel'), width: 20, align: 'left' })
            onFieldsChange(next)
          }}
          title={t('repeatingBand.addColumnRight')}
        >+</button>
        <div className="flex-1" />
        {fields.length > 1 && (
          <button className="px-2 py-1 text-destructive hover:bg-destructive/10 rounded" onClick={() => { onFieldsChange(fields.filter((_, i) => i !== colIndex)); onClose() }} title={t('repeatingBand.deleteThisColumn')}>{t('repeatingBand.delete')}</button>
        )}
      </div>
    </div>
    </>
  )
}

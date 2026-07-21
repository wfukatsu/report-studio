import { useTranslation } from 'react-i18next'
import type { ApprovalStampRowElement } from '@/types'
import { PropSection, PropRow, NumInput, ColorInput, SelectInput } from '@/elements/_base/sharedUI'
import { FieldKeyInput } from '@/components/common/FieldKeyInput'

interface Props {
  el: ApprovalStampRowElement
  onChange: (patch: Partial<ApprovalStampRowElement>) => void
}

export function ApprovalStampRowPropertiesPanel({ el, onChange }: Props) {
  const { t } = useTranslation('elements')
  return (
    <PropSection title={t('approvalStampRow.title')}>
      <PropRow label={t('approvalStampRow.labelPosition')}>
        <SelectInput value={el.labelPosition} onChange={(v) => onChange({ labelPosition: v as ApprovalStampRowElement['labelPosition'] })} options={[{ value: 'top', label: t('approvalStampRow.top') }, { value: 'bottom', label: t('approvalStampRow.bottom') }]} />
      </PropRow>
      <PropRow label={t('approvalStampRow.borderColor')}><ColorInput value={el.borderColor} onChange={(v) => onChange({ borderColor: v })} /></PropRow>
      <PropRow label={t('approvalStampRow.borderWidth')}><NumInput value={el.borderWidth} onChange={(v) => onChange({ borderWidth: v })} min={0} step={0.1} unit="mm" /></PropRow>
      <div>
        <span className="text-[10px] text-muted-foreground">{t('approvalStampRow.cellsLabel')}</span>
        <div className="mt-1 space-y-2">
          {el.cells.map((cell, i) => (
            <div key={i} className="border rounded p-1.5 space-y-1">
              <div className="flex gap-1 items-center">
                <input type="text" className="border rounded px-1.5 py-0.5 text-xs flex-1 min-w-0 bg-background" placeholder={t('approvalStampRow.rolePlaceholder')} value={cell.role} onChange={(e) => { const cells = el.cells.map((c, ci) => ci === i ? { ...c, role: e.target.value } : c); onChange({ cells }) }} />
                <div className="w-24 shrink-0">
                  <NumInput value={cell.width} onChange={(v) => { const cells = el.cells.map((c, ci) => ci === i ? { ...c, width: v } : c); onChange({ cells, size: { ...el.size, width: cells.reduce((s, c) => s + c.width, 0) } }) }} min={5} unit="mm" />
                </div>
                <button className="text-xs text-destructive px-1 shrink-0" onClick={() => { const cells = el.cells.filter((_, ci) => ci !== i); onChange({ cells, size: { ...el.size, width: cells.reduce((s, c) => s + c.width, 0) } }) }}>×</button>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block mb-0.5">{t('approvalStampRow.stampSrcLabel')}</span>
                <FieldKeyInput
                  value={cell.stampSrc ?? ''}
                  onChange={(v) => { const cells = el.cells.map((c, ci) => ci === i ? { ...c, stampSrc: v || undefined } : c); onChange({ cells }) }}
                  placeholder={t('approvalStampRow.stampSrcPlaceholder')}
                />
              </div>
            </div>
          ))}
          <button className="text-xs text-primary hover:underline" onClick={() => { const cells = [...el.cells, { role: '', width: 15 }]; onChange({ cells, size: { ...el.size, width: cells.reduce((s, c) => s + c.width, 0) } }) }}>{t('approvalStampRow.addCell')}</button>
        </div>
      </div>
    </PropSection>
  )
}

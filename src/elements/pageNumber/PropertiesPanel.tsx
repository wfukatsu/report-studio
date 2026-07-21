import { AlignLeft, AlignCenter, AlignRight, Bold, Italic } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PageNumberElement, PageNumberFormat } from '@/types'
import { PropSection, PropRow, NumInput, ColorInput, IconToggle } from '@/elements/_base/sharedUI'
import { FONT_FAMILIES, FONT_FAMILY_LABELS } from '@/elements/_blocks/constants'

// `as const satisfies` keeps `labelKey`/`exampleKey` as literal key types so
// `t(...)` type-checks against the typed i18next catalog (#329). `value` stays
// the raw PageNumberFormat enum (not translated).
const FORMAT_OPTIONS = [
  { value: '{{page}}',                   labelKey: 'pageNumber.optPageOnly',        exampleKey: 'pageNumber.exPageOnly' },
  { value: '{{page}} / {{pages}}',       labelKey: 'pageNumber.optPageSlashTotalSp', exampleKey: 'pageNumber.exPageSlashTotalSp' },
  { value: '{{page}}/{{pages}}',         labelKey: 'pageNumber.optPageSlashTotal',  exampleKey: 'pageNumber.exPageSlashTotal' },
  { value: 'Page {{page}} of {{pages}}', labelKey: 'pageNumber.optPageOfTotal',     exampleKey: 'pageNumber.exPageOfTotal' },
  { value: '{{page}}ページ',              labelKey: 'pageNumber.optPageJa',          exampleKey: 'pageNumber.exPageJa' },
  { value: 'custom',                     labelKey: 'pageNumber.optCustom',          exampleKey: null },
] as const satisfies readonly { value: PageNumberFormat; labelKey: string; exampleKey: string | null }[]

interface Props {
  el: PageNumberElement
  onChange: (patch: Partial<PageNumberElement>) => void
}

export function PageNumberPropertiesPanel({ el, onChange }: Props) {
  const { t } = useTranslation('elements')
  const style = el.style
  const onStyle = (s: Partial<typeof style>) => onChange({ style: { ...style, ...s } })

  return (
    <>
      <PropSection title={t('pageNumber.section')}>
        <PropRow label={t('pageNumber.format')}>
          <select
            className="border rounded px-2 py-1 text-xs w-full bg-background"
            value={el.format}
            onChange={(e) => onChange({ format: e.target.value as PageNumberFormat })}
          >
            {FORMAT_OPTIONS.map((opt) => {
              const example = opt.exampleKey ? t(opt.exampleKey) : ''
              return (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}{example ? ` (${example})` : ''}
                </option>
              )
            })}
          </select>
        </PropRow>
        {el.format === 'custom' && (
          <PropRow label={t('pageNumber.customFormat')}>
            <input
              type="text"
              className="border rounded px-2 py-1 text-xs w-full bg-background"
              value={el.customFormat ?? ''}
              placeholder={t('pageNumber.customPlaceholder', { pageToken: '{{page}}', pagesToken: '{{pages}}' })}
              onChange={(e) => onChange({ customFormat: e.target.value })}
            />
          </PropRow>
        )}
      </PropSection>
      <PropSection title={t('pageNumber.styleSection')}>
        <PropRow label={t('pageNumber.font')}>
          <select className="border rounded px-2 py-1 text-xs w-full bg-background" value={style.fontFamily ?? 'sans-serif'} onChange={(e) => onStyle({ fontFamily: e.target.value })}>
            {FONT_FAMILIES.map((f) => <option key={f} value={f}>{FONT_FAMILY_LABELS[f] ?? f}</option>)}
          </select>
        </PropRow>
        <PropRow label={t('pageNumber.size')}>
          <NumInput value={style.fontSize ?? 10} onChange={(v) => onStyle({ fontSize: v })} min={1} step={0.5} unit="pt" />
        </PropRow>
        <div>
          <span className="text-[10px] text-muted-foreground">{t('pageNumber.styleSection')}</span>
          <div className="flex gap-1 mt-1">
            <IconToggle active={style.fontWeight === 'bold'} onClick={() => onStyle({ fontWeight: style.fontWeight === 'bold' ? 'normal' : 'bold' })} title={t('pageNumber.bold')}><Bold className="w-3.5 h-3.5" /></IconToggle>
            <IconToggle active={style.fontStyle === 'italic'} onClick={() => onStyle({ fontStyle: style.fontStyle === 'italic' ? 'normal' : 'italic' })} title={t('pageNumber.italic')}><Italic className="w-3.5 h-3.5" /></IconToggle>
          </div>
        </div>
        <PropRow label={t('pageNumber.textColor')}>
          <ColorInput value={style.color ?? '#666666'} onChange={(v) => onStyle({ color: v })} />
        </PropRow>
        <div>
          <span className="text-[10px] text-muted-foreground">{t('pageNumber.horizontalAlign')}</span>
          <div className="flex gap-1 mt-1">
            {(['left', 'center', 'right'] as const).map((a) => (
              <IconToggle key={a} active={style.textAlign === a} onClick={() => onStyle({ textAlign: a })} title={a}>
                {a === 'left' && <AlignLeft className="w-3.5 h-3.5" />}
                {a === 'center' && <AlignCenter className="w-3.5 h-3.5" />}
                {a === 'right' && <AlignRight className="w-3.5 h-3.5" />}
              </IconToggle>
            ))}
          </div>
        </div>
      </PropSection>
    </>
  )
}

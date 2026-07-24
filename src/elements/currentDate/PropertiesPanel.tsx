import { AlignLeft, AlignCenter, AlignRight, Bold, Italic } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CurrentDateElement, CurrentDateFormat } from '@/types'
import { PropSection, PropRow, NumInput, ColorInput, IconToggle } from '@/elements/_base/sharedUI'
import { formatCurrentDate } from './format'
import { FONT_FAMILIES, FONT_FAMILY_LABEL_KEYS } from '@/elements/_blocks/constants'

// `as const satisfies` keeps `labelKey` as a literal key type so `t(...)`
// type-checks against the typed i18next catalog (#329). `value` stays the raw
// CurrentDateFormat enum (not translated).
const FORMAT_OPTIONS = [
  { value: 'yyyy/MM/dd',           labelKey: 'currentDate.optYmdSlash' },
  { value: 'yyyy年MM月dd日',        labelKey: 'currentDate.optYmdJa' },
  { value: 'yyyy-MM-dd',           labelKey: 'currentDate.optYmdDash' },
  { value: 'MM/dd/yyyy',           labelKey: 'currentDate.optMdy' },
  { value: 'wareki_full',          labelKey: 'currentDate.optWarekiFull' },
  { value: 'wareki_short',         labelKey: 'currentDate.optWarekiShort' },
  { value: 'yyyy年MM月dd日 (ddd)',  labelKey: 'currentDate.optYmdJaWeekday' },
  { value: 'custom',               labelKey: 'currentDate.optCustom' },
] as const satisfies readonly { value: CurrentDateFormat; labelKey: string }[]

interface Props {
  el: CurrentDateElement
  onChange: (patch: Partial<CurrentDateElement>) => void
}

export function CurrentDatePropertiesPanel({ el, onChange }: Props) {
  const { t } = useTranslation('elements')
  const style = el.style
  const onStyle = (s: Partial<typeof style>) => onChange({ style: { ...style, ...s } })
  const preview = formatCurrentDate(el.format, el.customFormat)

  return (
    <>
      <PropSection title={t('currentDate.dateSection')}>
        <PropRow label={t('currentDate.format')}>
          <select
            className="border rounded px-2 py-1 text-xs w-full bg-background"
            value={el.format}
            onChange={(e) => onChange({ format: e.target.value as CurrentDateFormat })}
          >
            {FORMAT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
            ))}
          </select>
        </PropRow>
        {el.format === 'custom' && (
          <PropRow label={t('currentDate.customFormat')}>
            <input
              type="text"
              className="border rounded px-2 py-1 text-xs w-full bg-background"
              value={el.customFormat ?? ''}
              placeholder={t('currentDate.customPlaceholder')}
              onChange={(e) => onChange({ customFormat: e.target.value })}
            />
          </PropRow>
        )}
        <div className="text-xs text-muted-foreground bg-muted rounded px-2 py-1">
          {t('currentDate.previewLabel', { value: preview })}
        </div>
      </PropSection>
      <PropSection title={t('currentDate.styleSection')}>
        <PropRow label={t('currentDate.font')}>
          <select className="border rounded px-2 py-1 text-xs w-full bg-background" value={style.fontFamily ?? 'sans-serif'} onChange={(e) => onStyle({ fontFamily: e.target.value })}>
            {FONT_FAMILIES.map((f) => <option key={f} value={f}>{t(FONT_FAMILY_LABEL_KEYS[f])}</option>)}
          </select>
        </PropRow>
        <PropRow label={t('currentDate.size')}>
          <NumInput value={style.fontSize ?? 10} onChange={(v) => onStyle({ fontSize: v })} min={1} step={0.5} unit="pt" />
        </PropRow>
        <div>
          <span className="text-[10px] text-muted-foreground">{t('currentDate.styleSection')}</span>
          <div className="flex gap-1 mt-1">
            <IconToggle active={style.fontWeight === 'bold'} onClick={() => onStyle({ fontWeight: style.fontWeight === 'bold' ? 'normal' : 'bold' })} title={t('currentDate.bold')}><Bold className="w-3.5 h-3.5" /></IconToggle>
            <IconToggle active={style.fontStyle === 'italic'} onClick={() => onStyle({ fontStyle: style.fontStyle === 'italic' ? 'normal' : 'italic' })} title={t('currentDate.italic')}><Italic className="w-3.5 h-3.5" /></IconToggle>
          </div>
        </div>
        <PropRow label={t('currentDate.textColor')}>
          <ColorInput value={style.color ?? '#000000'} onChange={(v) => onStyle({ color: v })} />
        </PropRow>
        <div>
          <span className="text-[10px] text-muted-foreground">{t('currentDate.horizontalAlign')}</span>
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

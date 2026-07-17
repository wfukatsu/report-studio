import { AlignLeft, AlignCenter, AlignRight, Bold, Italic } from 'lucide-react'
import type { CurrentDateElement, CurrentDateFormat } from '@/types'
import { PropSection, PropRow, NumInput, ColorInput, IconToggle } from '@/elements/_base/sharedUI'
import { formatCurrentDate } from './format'
import { FONT_FAMILIES, FONT_FAMILY_LABELS } from '@/elements/_blocks/constants'

const FORMAT_OPTIONS: { value: CurrentDateFormat; label: string }[] = [
  { value: 'yyyy/MM/dd',             label: 'yyyy/MM/dd' },
  { value: 'yyyy年MM月dd日',          label: 'yyyy年MM月dd日' },
  { value: 'yyyy-MM-dd',             label: 'yyyy-MM-dd' },
  { value: 'MM/dd/yyyy',             label: 'MM/dd/yyyy' },
  { value: 'wareki_full',            label: '和暦（令和X年M月D日）' },
  { value: 'wareki_short',           label: '和暦略（R8.04.10）' },
  { value: 'yyyy年MM月dd日 (ddd)',    label: 'yyyy年MM月dd日 (曜日)' },
  { value: 'custom',                 label: 'カスタム' },
]

interface Props {
  el: CurrentDateElement
  onChange: (patch: Partial<CurrentDateElement>) => void
}

export function CurrentDatePropertiesPanel({ el, onChange }: Props) {
  const style = el.style
  const onStyle = (s: Partial<typeof style>) => onChange({ style: { ...style, ...s } })
  const preview = formatCurrentDate(el.format, el.customFormat)

  return (
    <>
      <PropSection title="日付">
        <PropRow label="書式">
          <select
            className="border rounded px-2 py-1 text-xs w-full bg-background"
            value={el.format}
            onChange={(e) => onChange({ format: e.target.value as CurrentDateFormat })}
          >
            {FORMAT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </PropRow>
        {el.format === 'custom' && (
          <PropRow label="カスタム書式">
            <input
              type="text"
              className="border rounded px-2 py-1 text-xs w-full bg-background"
              value={el.customFormat ?? ''}
              placeholder="yyyy/MM/dd (ddd)"
              onChange={(e) => onChange({ customFormat: e.target.value })}
            />
          </PropRow>
        )}
        <div className="text-xs text-muted-foreground bg-muted rounded px-2 py-1">
          プレビュー: {preview}
        </div>
      </PropSection>
      <PropSection title="スタイル">
        <PropRow label="フォント">
          <select className="border rounded px-2 py-1 text-xs w-full bg-background" value={style.fontFamily ?? 'sans-serif'} onChange={(e) => onStyle({ fontFamily: e.target.value })}>
            {FONT_FAMILIES.map((f) => <option key={f} value={f}>{FONT_FAMILY_LABELS[f] ?? f}</option>)}
          </select>
        </PropRow>
        <PropRow label="サイズ">
          <NumInput value={style.fontSize ?? 10} onChange={(v) => onStyle({ fontSize: v })} min={1} step={0.5} unit="pt" />
        </PropRow>
        <div>
          <span className="text-[10px] text-muted-foreground">スタイル</span>
          <div className="flex gap-1 mt-1">
            <IconToggle active={style.fontWeight === 'bold'} onClick={() => onStyle({ fontWeight: style.fontWeight === 'bold' ? 'normal' : 'bold' })} title="太字"><Bold className="w-3.5 h-3.5" /></IconToggle>
            <IconToggle active={style.fontStyle === 'italic'} onClick={() => onStyle({ fontStyle: style.fontStyle === 'italic' ? 'normal' : 'italic' })} title="斜体"><Italic className="w-3.5 h-3.5" /></IconToggle>
          </div>
        </div>
        <PropRow label="文字色">
          <ColorInput value={style.color ?? '#000000'} onChange={(v) => onStyle({ color: v })} />
        </PropRow>
        <div>
          <span className="text-[10px] text-muted-foreground">横揃え</span>
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

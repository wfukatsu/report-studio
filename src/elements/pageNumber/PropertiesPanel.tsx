import { AlignLeft, AlignCenter, AlignRight, Bold, Italic } from 'lucide-react'
import type { PageNumberElement, PageNumberFormat } from '@/types'
import { PropSection, PropRow, NumInput, ColorInput, IconToggle } from '@/elements/_base/sharedUI'
import { FONT_FAMILIES, FONT_FAMILY_LABELS } from '@/elements/_blocks/constants'

const FORMAT_OPTIONS: { value: PageNumberFormat; label: string; example: string }[] = [
  { value: '{{page}}',                      label: 'ページ番号のみ',   example: '1' },
  { value: '{{page}} / {{pages}}',          label: 'ページ / 総ページ', example: '1 / 3' },
  { value: '{{page}}/{{pages}}',            label: 'ページ/総ページ',  example: '1/3' },
  { value: 'Page {{page}} of {{pages}}',    label: 'Page X of Y',     example: 'Page 1 of 3' },
  { value: '{{page}}ページ',                 label: 'Xページ',          example: '1ページ' },
  { value: 'custom',                         label: 'カスタム',         example: '' },
]

interface Props {
  el: PageNumberElement
  onChange: (patch: Partial<PageNumberElement>) => void
}

export function PageNumberPropertiesPanel({ el, onChange }: Props) {
  const style = el.style
  const onStyle = (s: Partial<typeof style>) => onChange({ style: { ...style, ...s } })

  return (
    <>
      <PropSection title="ページ番号">
        <PropRow label="書式">
          <select
            className="border rounded px-2 py-1 text-xs w-full bg-background"
            value={el.format}
            onChange={(e) => onChange({ format: e.target.value as PageNumberFormat })}
          >
            {FORMAT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}{opt.example ? ` (${opt.example})` : ''}
              </option>
            ))}
          </select>
        </PropRow>
        {el.format === 'custom' && (
          <PropRow label="カスタム書式">
            <input
              type="text"
              className="border rounded px-2 py-1 text-xs w-full bg-background"
              value={el.customFormat ?? ''}
              placeholder="{{page}} / {{pages}}"
              onChange={(e) => onChange({ customFormat: e.target.value })}
            />
          </PropRow>
        )}
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
          <ColorInput value={style.color ?? '#666666'} onChange={(v) => onStyle({ color: v })} />
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

import {
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Bold, Italic, Underline, Strikethrough,
} from 'lucide-react'
import type { LabelElement } from '@/types'
import { PropSection, PropRow, NumInput, ColorInput, SelectInput, IconToggle } from '@/elements/_base/sharedUI'

const FONT_FAMILIES = [
  'sans-serif', 'serif', 'monospace',
  'Noto Sans JP', 'Noto Serif JP', 'BIZ UDPGothic', 'BIZ UDPMincho',
  'Meiryo', 'MS Gothic', 'MS Mincho', 'Yu Gothic', 'Yu Mincho',
]

interface Props {
  el: LabelElement
  onChange: (patch: Partial<LabelElement>) => void
}

export function LabelPropertiesPanel({ el, onChange }: Props) {
  const style = el.style
  const onStyle = (s: Partial<typeof style>) => onChange({ style: { ...style, ...s } })

  return (
    <>
      <PropSection title="テキストスタイル">
        <PropRow label="フォント">
          <select className="border rounded px-2 py-1 text-xs w-full bg-background" value={style.fontFamily ?? 'sans-serif'} onChange={(e) => onStyle({ fontFamily: e.target.value })}>
            {FONT_FAMILIES.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
          </select>
        </PropRow>
        <PropRow label="フォントサイズ">
          <NumInput value={style.fontSize ?? 3.5} onChange={(v) => onStyle({ fontSize: v })} min={1} step={0.5} unit="mm" />
        </PropRow>
        <div>
          <span className="text-[10px] text-muted-foreground">スタイル</span>
          <div className="flex gap-1 mt-1">
            <IconToggle active={style.fontWeight === 'bold'} onClick={() => onStyle({ fontWeight: style.fontWeight === 'bold' ? 'normal' : 'bold' })} title="太字"><Bold className="w-3.5 h-3.5" /></IconToggle>
            <IconToggle active={style.fontStyle === 'italic'} onClick={() => onStyle({ fontStyle: style.fontStyle === 'italic' ? 'normal' : 'italic' })} title="斜体"><Italic className="w-3.5 h-3.5" /></IconToggle>
            <IconToggle active={style.textDecoration === 'underline'} onClick={() => onStyle({ textDecoration: style.textDecoration === 'underline' ? 'none' : 'underline' })} title="下線"><Underline className="w-3.5 h-3.5" /></IconToggle>
            <IconToggle active={style.textDecoration === 'line-through'} onClick={() => onStyle({ textDecoration: style.textDecoration === 'line-through' ? 'none' : 'line-through' })} title="打ち消し線"><Strikethrough className="w-3.5 h-3.5" /></IconToggle>
          </div>
        </div>
        <PropRow label="文字色"><ColorInput value={style.color ?? '#000000'} onChange={(v) => onStyle({ color: v })} /></PropRow>
        <div>
          <span className="text-[10px] text-muted-foreground">横揃え</span>
          <div className="flex gap-1 mt-1">
            {(['left', 'center', 'right', 'justify'] as const).map((a) => (
              <IconToggle key={a} active={style.textAlign === a} onClick={() => onStyle({ textAlign: a })} title={a}>
                {a === 'left' && <AlignLeft className="w-3.5 h-3.5" />}
                {a === 'center' && <AlignCenter className="w-3.5 h-3.5" />}
                {a === 'right' && <AlignRight className="w-3.5 h-3.5" />}
                {a === 'justify' && <AlignJustify className="w-3.5 h-3.5" />}
              </IconToggle>
            ))}
          </div>
        </div>
        <PropRow label="文字方向">
          <SelectInput value={style.writingMode ?? 'horizontal-tb'} onChange={(v) => onStyle({ writingMode: v as typeof style.writingMode })} options={[{ value: 'horizontal-tb', label: '横書き' }, { value: 'vertical-rl', label: '縦書き' }]} />
        </PropRow>
      </PropSection>
      <PropSection title="コンテンツ">
        <PropRow label="テキスト">
          <textarea className="border rounded px-2 py-1 text-xs w-full bg-background resize-y" rows={3} value={el.text} onChange={(e) => onChange({ text: e.target.value })} />
        </PropRow>
      </PropSection>
    </>
  )
}

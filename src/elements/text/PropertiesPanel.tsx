import {
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  Bold, Italic, Underline, Strikethrough,
} from 'lucide-react'
import type { TextElement } from '@/types'
import { PropSection, PropRow, NumInput, ColorInput, SelectInput, IconToggle } from '@/elements/_base/sharedUI'
import { TokenInput } from '@/components/common/TokenInput'

const FONT_FAMILIES = [
  'sans-serif', 'serif', 'monospace',
  'Noto Sans JP', 'Noto Serif JP', 'BIZ UDPGothic', 'BIZ UDPMincho',
  'Meiryo', 'MS Gothic', 'MS Mincho', 'Yu Gothic', 'Yu Mincho',
]

interface Props {
  el: TextElement
  onChange: (patch: Partial<TextElement>) => void
}

export function TextPropertiesPanel({ el, onChange }: Props) {
  const style = el.style
  const onStyle = (s: Partial<typeof style>) => onChange({ style: { ...style, ...s } })

  return (
    <>
      <PropSection title="テキストスタイル">
        <PropRow label="フォント">
          <select
            className="border rounded px-2 py-1 text-xs w-full bg-background"
            value={style.fontFamily ?? 'sans-serif'}
            onChange={(e) => onStyle({ fontFamily: e.target.value })}
          >
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
        <PropRow label="背景色"><ColorInput value={style.backgroundColor ?? '#ffffff'} onChange={(v) => onStyle({ backgroundColor: v })} /></PropRow>
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
        <div>
          <span className="text-[10px] text-muted-foreground">縦揃え</span>
          <div className="flex gap-1 mt-1">
            {(['top', 'middle', 'bottom'] as const).map((va) => (
              <IconToggle key={va} active={style.verticalAlign === va} onClick={() => onStyle({ verticalAlign: va })} title={va}>
                {va === 'top' && <AlignStartVertical className="w-3.5 h-3.5" />}
                {va === 'middle' && <AlignCenterVertical className="w-3.5 h-3.5" />}
                {va === 'bottom' && <AlignEndVertical className="w-3.5 h-3.5" />}
              </IconToggle>
            ))}
          </div>
        </div>
        <PropRow label="行間"><NumInput value={style.lineHeight ?? 1.4} onChange={(v) => onStyle({ lineHeight: v })} min={0.5} max={5} step={0.1} /></PropRow>
        <PropRow label="文字間隔"><NumInput value={style.letterSpacing ?? 0} onChange={(v) => onStyle({ letterSpacing: v })} min={-0.2} max={2} step={0.05} unit="em" /></PropRow>
        <PropRow label="文字方向">
          <SelectInput value={style.writingMode ?? 'horizontal-tb'} onChange={(v) => onStyle({ writingMode: v as typeof style.writingMode })} options={[{ value: 'horizontal-tb', label: '横書き' }, { value: 'vertical-rl', label: '縦書き' }]} />
        </PropRow>
      </PropSection>
      <PropSection title="コンテンツ">
        <TokenInput
          value={el.content}
          onChange={(v) => onChange({ content: v })}
          rows={4}
          placeholder={'テキスト内容（{{フィールドキー}} でデータ参照）'}
        />
        <PropRow label="ふりがな">
          <input type="text" className="border rounded px-2 py-1 text-xs w-full bg-background" value={el.furigana ?? ''} placeholder="ふりがな" onChange={(e) => onChange({ furigana: e.target.value || undefined })} />
        </PropRow>
      </PropSection>
    </>
  )
}

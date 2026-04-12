import { AlignLeft, AlignCenter, AlignRight, Bold, Italic } from 'lucide-react'
import type { TenantCustomElement } from '@/types'
import { PropSection, PropRow, NumInput, ColorInput, IconToggle } from '@/elements/_base/sharedUI'

const FONT_FAMILIES = [
  'sans-serif', 'serif', 'monospace',
  'Noto Sans JP', 'Noto Serif JP', 'BIZ UDPGothic', 'BIZ UDPMincho',
]

interface Props {
  el: TenantCustomElement
  onChange: (patch: Partial<TenantCustomElement>) => void
}

export function TenantCustomPropertiesPanel({ el, onChange }: Props) {
  const style = el.style
  const onStyle = (s: Partial<typeof style>) => onChange({ style: { ...style, ...s } })

  return (
    <>
      <PropSection title="カスタムフィールド">
        <PropRow label="フィールドキー">
          <input
            type="text"
            className="border rounded px-2 py-1 text-xs w-full bg-background font-mono"
            value={el.fieldKey}
            placeholder="例: taxRegistrationNumber"
            onChange={(e) => onChange({ fieldKey: e.target.value })}
          />
        </PropRow>
        <div className="text-[10px] text-muted-foreground">
          テナント情報のカスタムフィールドキーを入力してください。
        </div>
        <PropRow label="未設定時テキスト">
          <input
            type="text"
            className="border rounded px-2 py-1 text-xs w-full bg-background"
            value={el.fallback ?? ''}
            placeholder="（未設定）"
            onChange={(e) => onChange({ fallback: e.target.value || undefined })}
          />
        </PropRow>
      </PropSection>
      <PropSection title="スタイル">
        <PropRow label="フォント">
          <select className="border rounded px-2 py-1 text-xs w-full bg-background" value={style.fontFamily ?? 'sans-serif'} onChange={(e) => onStyle({ fontFamily: e.target.value })}>
            {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </PropRow>
        <PropRow label="サイズ">
          <NumInput value={style.fontSize ?? 3} onChange={(v) => onStyle({ fontSize: v })} min={1} step={0.5} unit="mm" />
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

import type { ImageElement } from '@/types'
import { PropSection, PropRow, SelectInput } from '@/elements/_base/sharedUI'

interface Props {
  el: ImageElement
  onChange: (patch: Partial<ImageElement>) => void
}

export function ImagePropertiesPanel({ el, onChange }: Props) {
  return (
    <PropSection title="画像">
      <PropRow label="URL / パス">
        <input type="text" className="border rounded px-2 py-1 text-xs w-full bg-background" value={el.src} placeholder="https://..." onChange={(e) => onChange({ src: e.target.value })} />
      </PropRow>
      <PropRow label="alt テキスト">
        <input type="text" className="border rounded px-2 py-1 text-xs w-full bg-background" value={el.alt} onChange={(e) => onChange({ alt: e.target.value })} />
      </PropRow>
      <PropRow label="フィット">
        <SelectInput value={el.objectFit} onChange={(v) => onChange({ objectFit: v as ImageElement['objectFit'] })} options={[{ value: 'contain', label: 'Contain（全体を収める）' }, { value: 'cover', label: 'Cover（領域を埋める）' }, { value: 'fill', label: 'Fill（伸縮して埋める）' }, { value: 'none', label: 'None（原寸）' }]} />
      </PropRow>
      <PropRow label="不透明度">
        <div className="flex items-center gap-2">
          <input type="range" min={0} max={1} step={0.05} className="flex-1" value={el.opacity ?? 1} onChange={(e) => onChange({ opacity: Number(e.target.value) })} />
          <span className="text-xs text-muted-foreground w-8 text-right">{Math.round((el.opacity ?? 1) * 100)}%</span>
        </div>
      </PropRow>
    </PropSection>
  )
}

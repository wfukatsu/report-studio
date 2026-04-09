import type { DividerElement, DividerDirection } from '@/types'
import { PropSection, PropRow, NumInput, ColorInput } from '@/elements/_base/sharedUI'

interface Props {
  el: DividerElement
  onChange: (patch: Partial<DividerElement>) => void
}

export function DividerPropertiesPanel({ el, onChange }: Props) {
  return (
    <PropSection title="区切り線">
      <PropRow label="方向">
        <select
          className="border rounded px-2 py-1 text-xs w-full bg-background"
          value={el.direction}
          onChange={(e) => {
            const next = e.target.value as DividerDirection
            if (next !== el.direction) {
              // Swap width and height when direction changes
              onChange({
                direction: next,
                size: { width: el.size.height, height: el.size.width },
              })
            }
          }}
        >
          <option value="horizontal">水平</option>
          <option value="vertical">垂直</option>
        </select>
      </PropRow>
      <PropRow label="色">
        <ColorInput value={el.color} onChange={(v) => onChange({ color: v })} />
      </PropRow>
      <PropRow label="太さ">
        <NumInput value={el.thickness} onChange={(v) => onChange({ thickness: Math.max(0.1, Math.min(5, v)) })} min={0.1} max={5} step={0.1} unit="mm" />
      </PropRow>
      <PropRow label="線種">
        <select
          className="border rounded px-2 py-1 text-xs w-full bg-background"
          value={el.dashStyle}
          onChange={(e) => onChange({ dashStyle: e.target.value as 'solid' | 'dashed' | 'dotted' })}
        >
          <option value="solid">実線</option>
          <option value="dashed">破線</option>
          <option value="dotted">点線</option>
        </select>
      </PropRow>
    </PropSection>
  )
}

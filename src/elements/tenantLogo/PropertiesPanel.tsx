import type { TenantLogoElement } from '@/types'
import { PropSection, PropRow, SelectInput } from '@/elements/_base/sharedUI'

interface Props {
  el: TenantLogoElement
  onChange: (patch: Partial<TenantLogoElement>) => void
}

export function TenantLogoPropertiesPanel({ el, onChange }: Props) {
  return (
    <PropSection title="ロゴ">
      <div className="text-[10px] text-muted-foreground mb-2">
        ロゴ画像はデータ設定の「テナント情報」タブで変更できます。
      </div>
      <PropRow label="フィット">
        <SelectInput
          value={el.objectFit}
          onChange={(v) => onChange({ objectFit: v as TenantLogoElement['objectFit'] })}
          options={[
            { value: 'contain', label: 'Contain（全体を収める）' },
            { value: 'cover',   label: 'Cover（領域を埋める）' },
            { value: 'fill',    label: 'Fill（伸縮して埋める）' },
            { value: 'none',    label: 'None（原寸）' },
          ]}
        />
      </PropRow>
      <PropRow label="不透明度">
        <div className="flex items-center gap-2">
          <input
            type="range" min={0} max={1} step={0.05}
            className="flex-1"
            value={el.opacity ?? 1}
            onChange={(e) => onChange({ opacity: Number(e.target.value) })}
          />
          <span className="text-xs text-muted-foreground w-8 text-right">
            {Math.round((el.opacity ?? 1) * 100)}%
          </span>
        </div>
      </PropRow>
    </PropSection>
  )
}

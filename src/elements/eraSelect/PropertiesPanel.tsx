import { Rows3, Columns3, LayoutGrid } from 'lucide-react'
import type { EraSelectElement, EraSelectLayout } from '@/types'
import { PropSection, PropRow, IconToggle } from '@/elements/_base/sharedUI'
import { DEFAULT_ERAS } from './constants'

interface Props {
  el: EraSelectElement
  onChange: (patch: Partial<EraSelectElement>) => void
}

export function EraSelectPropertiesPanel({ el, onChange }: Props) {
  const currentEras = el.eras ?? DEFAULT_ERAS
  const layout = el.layout ?? 'column'

  const toggleEra = (era: string) => {
    const isActive = currentEras.includes(era)
    if (isActive && currentEras.length <= 1) return // 最低1つ必須
    const next = isActive
      ? currentEras.filter((e) => e !== era)
      : [...currentEras, era].sort((a, b) => DEFAULT_ERAS.indexOf(a) - DEFAULT_ERAS.indexOf(b))
    onChange({ eras: next })
  }

  const setLayout = (l: EraSelectLayout) => onChange({ layout: l })

  return (
    <PropSection title="元号選択">
      <PropRow label="データバインド">
          <input
            type="text"
            className="border rounded px-2 py-1 text-xs w-full bg-background font-mono"
            value={el.dataSource ?? ''}
            placeholder="例: employee.era"
            onChange={(e) => onChange({ dataSource: e.target.value || undefined })}
          />
        </PropRow>
        <div>
          <span className="text-[10px] text-muted-foreground">レイアウト</span>
          <div className="flex gap-1 mt-1">
            <IconToggle active={layout === 'column'} onClick={() => setLayout('column')} title="縦1列">
              <Rows3 className="w-3.5 h-3.5" />
            </IconToggle>
            <IconToggle active={layout === 'row'} onClick={() => setLayout('row')} title="横1行">
              <Columns3 className="w-3.5 h-3.5" />
            </IconToggle>
            <IconToggle active={layout === 'grid-2col'} onClick={() => setLayout('grid-2col')} title="2列グリッド">
              <LayoutGrid className="w-3.5 h-3.5" />
            </IconToggle>
          </div>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground">表示元号</span>
          <div className="flex gap-1 mt-1 flex-wrap">
            {DEFAULT_ERAS.map((era) => (
              <button
                key={era}
                onClick={() => toggleEra(era)}
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                  currentEras.includes(era)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:bg-accent'
                }`}
              >
                {era}
              </button>
            ))}
          </div>
        </div>
    </PropSection>
  )
}

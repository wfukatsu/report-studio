import { useRef } from 'react'
import type { ImageElement } from '@/types'
import { PropSection, PropRow, SelectInput } from '@/elements/_base/sharedUI'

const ACCEPTED_IMAGE_TYPES = '.png,.jpg,.jpeg,.gif,.webp,.svg'
const MAX_RASTER_SIZE = 2 * 1024 * 1024  // 2 MB
const MAX_SVG_SIZE = 512 * 1024           // 512 KB

interface Props {
  el: ImageElement
  onChange: (patch: Partial<ImageElement>) => void
}

export function ImagePropertiesPanel({ el, onChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')
    const maxSize = isSvg ? MAX_SVG_SIZE : MAX_RASTER_SIZE

    if (file.size > maxSize) {
      const limitLabel = isSvg ? '512KB' : '2MB'
      alert(`ファイルサイズが${limitLabel}を超えています。`)
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      onChange({ src: dataUrl })
    }
    reader.readAsDataURL(file)

    // Reset input so the same file can be re-selected
    e.target.value = ''
  }

  return (
    <PropSection title="画像">
      <PropRow label="画像ファイル">
        <div className="flex gap-1">
          <button
            type="button"
            className="flex-1 py-1 text-xs text-blue-600 hover:text-blue-800 border border-dashed rounded hover:bg-blue-50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            ファイルを選択...
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES}
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>
      </PropRow>
      <PropRow label="URL / パス">
        <input type="text" className="border rounded px-2 py-1 text-xs w-full bg-background" value={el.src} placeholder="https://..." onChange={(e) => onChange({ src: e.target.value })} />
      </PropRow>
      {el.src && (
        <div className="border rounded p-1 bg-muted/30">
          <img src={el.src} alt={el.alt} className="w-full h-auto max-h-20 object-contain" />
        </div>
      )}
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

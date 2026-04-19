import { useShallow } from 'zustand/shallow'
import { useReportStore } from '@/store/reportStore'
import type { TextStyle } from '@/types'
import { TextStyleSection } from '@/elements/_blocks/panels/TextStyleSection'

export function DefaultStyleSettings() {
  const defaultTextStyle = useReportStore(useShallow((s): TextStyle => s.definition.defaultTextStyle))
  const updateDefaultTextStyle = useReportStore((s) => s.updateDefaultTextStyle)

  return (
    <div className="p-4 flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">デフォルトスタイル</h2>
        <p className="text-xs text-muted-foreground mt-1">
          新規要素に適用されるテキストスタイルの初期値を設定します。要素ごとに個別に上書きできます。
        </p>
      </div>

      <div className="max-w-xs">
        <TextStyleSection
          style={defaultTextStyle}
          onStyleChange={(patch) => updateDefaultTextStyle(patch)}
        />
      </div>
    </div>
  )
}

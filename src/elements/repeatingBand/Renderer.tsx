import { memo } from 'react'
import type { RepeatingBandElement, RepeatingBandField } from '@/types'
import { RepeatingBandDesignPreview } from './DesignPreview'
import { FlatBandRenderer } from './FlatBandRenderer'
import { GroupedBandRenderer } from './GroupedBandRenderer'
import { isGroupedElement } from './bandStyles'

// ---------------------------------------------------------------------------
// Public dispatcher
//
// The implementation is split by concern (#276):
// - bandStyles.ts          — style constants, border/layout math, sort/format helpers
// - BandParts.tsx          — shared sub-components (HeaderRow/DataRow/FooterRow/…)
// - ColumnEditor.tsx       — floating column-edit panel (design mode)
// - DesignPreview.tsx      — design-mode mock rows + interactive column editing
// - FlatBandRenderer.tsx   — live renderer, flat path (no groupBy)
// - GroupedBandRenderer.tsx — live renderer, grouped path (groupBy set)
// ---------------------------------------------------------------------------

interface Props {
  element: RepeatingBandElement
  /** Live Preview 時に渡す配列データ。undefined = デザインプレビュー表示 */
  records?: Record<string, unknown>[]
  /** デザインモード時にフィールド変更を通知するコールバック */
  onFieldsChange?: (fields: RepeatingBandField[]) => void
}

export const RepeatingBandRenderer = memo(function RepeatingBandRenderer({ element, records, onFieldsChange }: Props) {
  if (records === undefined) {
    return <RepeatingBandDesignPreview element={element} onFieldsChange={onFieldsChange} />
  }
  if (isGroupedElement(element)) {
    return <GroupedBandRenderer el={element} records={records} />
  }
  return <FlatBandRenderer el={element} records={records} />
})

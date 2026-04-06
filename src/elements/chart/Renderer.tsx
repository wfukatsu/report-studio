import { memo } from 'react'
import type { ChartElement } from '@/types'

interface Props {
  element: ChartElement
}

export const ChartRenderer = memo(function ChartRenderer({ element }: Props) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', border: '1px dashed #d1d5db', fontSize: '3mm', color: '#6b7280' }}>
      [{element.chartType} chart]
    </div>
  )
})

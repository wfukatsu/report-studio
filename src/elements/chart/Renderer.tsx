import { memo, useMemo } from 'react'
import type { ChartElement } from '@/types'
import { ChartContent } from '@/elements/_blocks/renderers/ChartContent'

interface Props {
  element: ChartElement
  data?: Record<string, unknown>
}

/** Sample data shown in design mode when no dataBinding is set */
const SAMPLE_DATA = [
  { name: 'A', value: 40 },
  { name: 'B', value: 30 },
  { name: 'C', value: 20 },
  { name: 'D', value: 10 },
]

export const ChartRenderer = memo(function ChartRenderer({ element: el, data = {} }: Props) {
  const records = useMemo(() => {
    if (el.dataBinding) {
      const bound = data[el.dataBinding]
      // Validate that the bound value is an array of plain objects before
      // passing to Recharts — an array of primitives would produce malformed
      // data keys and silent rendering errors.
      if (
        Array.isArray(bound) &&
        bound.length > 0 &&
        typeof bound[0] === 'object' &&
        bound[0] !== null &&
        !Array.isArray(bound[0])
      ) {
        return bound as Record<string, unknown>[]
      }
      // Fall back to sample data if the binding resolves to a non-record array
      if (Array.isArray(bound) && bound.length === 0) {
        return bound as Record<string, unknown>[]
      }
    }
    return SAMPLE_DATA
  }, [el.dataBinding, data])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {el.title && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          textAlign: 'center', fontSize: '3mm', fontWeight: 'bold',
          padding: '1mm 0', zIndex: 1,
        }}>
          {el.title}
        </div>
      )}
      <ChartContent
        chartType={el.chartType}
        data={records}
        xAxisKey={el.xAxisKey}
        yAxisKeys={el.yAxisKeys}
        colors={el.colors}
        showLegend={el.showLegend}
        showGrid={el.showGrid}
      />
    </div>
  )
})

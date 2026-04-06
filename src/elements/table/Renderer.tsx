import { memo } from 'react'
import type { TableElement } from '@/types'

function isStringMatrix(value: unknown): value is string[][] {
  return Array.isArray(value) && value.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === 'string'))
}

interface Props {
  element: TableElement
  data?: Record<string, unknown>
}

export const TableRenderer = memo(function TableRenderer({ element: el, data = {} }: Props) {
  const rawData = el.dataBinding ? data[el.dataBinding] : undefined
  const resolvedData: string[][] = isStringMatrix(rawData) ? rawData : el.data
  return (
    <table style={{ width: '100%', height: '100%', borderCollapse: 'collapse', fontSize: '3mm', tableLayout: 'fixed' }}>
      <tbody>
        {resolvedData.map((row, rowIdx) => (
          <tr key={rowIdx}>
            {row.map((cell, colIdx) => {
              const Tag = el.headerRow && rowIdx === 0 ? 'th' : 'td'
              const taxRate = el.columnTaxRates?.[colIdx]
              const marker = taxRate === 8 ? ' ※' : ''
              return (
                <Tag key={colIdx} style={{ border: '1px solid #000000', padding: '1mm 2mm', fontWeight: el.headerRow && rowIdx === 0 ? 'bold' : 'normal', background: el.headerRow && rowIdx === 0 ? '#f3f4f6' : 'transparent', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
                  {cell}{marker}
                </Tag>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
})

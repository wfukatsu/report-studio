import { memo } from 'react'
import type { ApprovalStampRowElement } from '@/types'
import { isSafeImageSrc } from '@/lib/exportUtils'

interface Props {
  element: ApprovalStampRowElement
}

export const ApprovalStampRowRenderer = memo(function ApprovalStampRowRenderer({ element: el }: Props) {
  const bw = `${el.borderWidth}mm`
  const labelH = '4mm'
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', border: `${bw} solid ${el.borderColor}`, boxSizing: 'border-box' }}>
      {el.cells.map((cell, i) => (
        <div key={i} style={{ flex: `0 0 ${cell.width}mm`, display: 'flex', flexDirection: 'column', borderRight: i < el.cells.length - 1 ? `${bw} solid ${el.borderColor}` : undefined, overflow: 'hidden' }}>
          {el.labelPosition === 'top' && (
            <div style={{ height: labelH, fontSize: '2.5mm', textAlign: 'center', borderBottom: `${bw} solid ${el.borderColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#374151' }}>
              {cell.role}
            </div>
          )}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* Decorative: the role label is rendered as adjacent text */}
            {cell.stampSrc && isSafeImageSrc(cell.stampSrc) && <img src={cell.stampSrc} alt="" style={{ maxWidth: '80%', maxHeight: '80%', opacity: 0.85 }} draggable={false} />}
          </div>
          {el.labelPosition === 'bottom' && (
            <div style={{ height: labelH, fontSize: '2.5mm', textAlign: 'center', borderTop: `${bw} solid ${el.borderColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#374151' }}>
              {cell.role}
            </div>
          )}
        </div>
      ))}
    </div>
  )
})

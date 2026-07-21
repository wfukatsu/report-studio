import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { RevenueStampElement } from '@/types'

interface Props {
  element: RevenueStampElement
}

export const RevenueStampRenderer = memo(function RevenueStampRenderer({ element: el }: Props) {
  const { t } = useTranslation('elements')
  const bw = `${el.borderWidth}mm`
  return (
    <div style={{ width: '100%', height: '100%', border: `${bw} solid ${el.borderColor}`, position: 'relative', backgroundColor: '#fafafa', boxSizing: 'border-box' }}>
      {el.showLabel && <span style={{ position: 'absolute', top: '1mm', left: '1.5mm', fontSize: '2.5mm', color: '#6b7280', letterSpacing: '0.05em', userSelect: 'none' }}>{t('revenueStamp.label')}</span>}
      {el.amount && <span style={{ position: 'absolute', bottom: '1mm', right: '1.5mm', fontSize: '2.5mm', color: '#9ca3af', userSelect: 'none' }}>{el.amount}</span>}
      {el.showCancellationGuide && (
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <line x1="50%" y1="0" x2="50%" y2="100%" stroke="#e5e7eb" strokeWidth="0.5" strokeDasharray="3 2" />
        </svg>
      )}
    </div>
  )
})

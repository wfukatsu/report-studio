import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ImageElement } from '@/types'
import { isSafeImageSrc } from '@/lib/exportUtils'

interface Props {
  element: ImageElement
}

export const ImageRenderer = memo(function ImageRenderer({ element: el }: Props) {
  const { t } = useTranslation('elements')
  const safeSrc = isSafeImageSrc(el.src) ? el.src : ''
  if (!safeSrc) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', border: '1px dashed #d1d5db', color: '#9ca3af', fontSize: '10px' }}>
        {t('image.placeholder')}
      </div>
    )
  }
  return (
    <img src={safeSrc} alt={el.alt} style={{ width: '100%', height: '100%', objectFit: el.objectFit as React.CSSProperties['objectFit'], opacity: el.opacity ?? 1, display: 'block' }} draggable={false} />
  )
})

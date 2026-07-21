import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { TenantLogoElement } from '@/types'
import { useReportStore } from '@/store/reportStore'
import { isSafeImageSrc } from '@/lib/exportUtils'

interface Props {
  element: TenantLogoElement
}

export const TenantLogoRenderer = memo(function TenantLogoRenderer({ element: el }: Props) {
  const { t } = useTranslation('elements')
  const logoBase64 = useReportStore((s) => s.tenantInfo?.logoBase64)

  const safeSrc = logoBase64 && isSafeImageSrc(logoBase64) ? logoBase64 : ''

  if (!safeSrc) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f3f4f6',
          border: '1px dashed #d1d5db',
          color: '#9ca3af',
          fontSize: '10px',
          userSelect: 'none',
        }}
      >
        {t('tenantLogo.notSet')}
      </div>
    )
  }

  return (
    <img
      src={safeSrc}
      alt={t('tenantLogo.alt')}
      style={{
        width: '100%',
        height: '100%',
        objectFit: el.objectFit as React.CSSProperties['objectFit'],
        opacity: el.opacity ?? 1,
        display: 'block',
      }}
      draggable={false}
    />
  )
})

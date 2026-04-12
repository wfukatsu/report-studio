import { memo } from 'react'
import type { TenantCompanyNameElement } from '@/types'
import { useReportStore } from '@/store/reportStore'
import { toFlexAlign } from '@/elements/_base/styleUtils'

interface Props {
  element: TenantCompanyNameElement
  resolveValues?: boolean
}

export const TenantCompanyNameRenderer = memo(function TenantCompanyNameRenderer({
  element: el,
  resolveValues = false,
}: Props) {
  const companyName = useReportStore((s) => s.tenantInfo?.companyName)
  const value = resolveValues
    ? (companyName ?? el.fallback ?? '（会社名未設定）')
    : '{{会社名}}'
  const style = el.style

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: toFlexAlign(style.verticalAlign),
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          fontSize: style.fontSize ? `${style.fontSize}mm` : '3mm',
          fontWeight: style.fontWeight ?? 'normal',
          fontStyle: style.fontStyle ?? 'normal',
          color: style.color ?? '#000000',
          fontFamily: style.fontFamily,
          textAlign: style.textAlign ?? 'left',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {value}
      </div>
    </div>
  )
})

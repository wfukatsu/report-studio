import { memo } from 'react'
import type { TenantAddressElement } from '@/types'
import { useReportStore } from '@/store/reportStore'
import { toFlexAlign } from '@/elements/_base/styleUtils'

interface Props {
  element: TenantAddressElement
  resolveValues?: boolean
}

export const TenantAddressRenderer = memo(function TenantAddressRenderer({ element: el, resolveValues = false }: Props) {
  const address = useReportStore((s) => s.tenantInfo?.address)
  const postalCode = useReportStore((s) => s.tenantInfo?.postalCode)
  const value = resolveValues
    ? (postalCode && address ? `〒${postalCode} ${address}` : (address ?? el.fallback ?? '（住所未設定）'))
    : '{{住所}}'
  const style = el.style
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: toFlexAlign(style.verticalAlign), overflow: 'hidden', userSelect: 'none' }}>
      <div style={{ fontSize: style.fontSize ? `${style.fontSize}mm` : '3mm', fontWeight: style.fontWeight ?? 'normal', fontStyle: style.fontStyle ?? 'normal', color: style.color ?? '#000000', fontFamily: style.fontFamily, textAlign: style.textAlign ?? 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {value}
      </div>
    </div>
  )
})

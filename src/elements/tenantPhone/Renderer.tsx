import { memo } from 'react'
import type { TenantPhoneElement } from '@/types'
import { useReportStore } from '@/store/reportStore'
import { toFlexAlign } from '@/elements/_base/styleUtils'

interface Props { element: TenantPhoneElement; resolveValues?: boolean }

export const TenantPhoneRenderer = memo(function TenantPhoneRenderer({ element: el, resolveValues = false }: Props) {
  const phone = useReportStore((s) => s.tenantInfo?.phone)
  const value = resolveValues ? (phone ?? el.fallback ?? '（電話番号未設定）') : '{{電話番号}}'
  const style = el.style
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: toFlexAlign(style.verticalAlign), overflow: 'hidden', userSelect: 'none' }}>
      <div style={{ fontSize: style.fontSize ? `${style.fontSize}mm` : '3mm', fontWeight: style.fontWeight ?? 'normal', fontStyle: style.fontStyle ?? 'normal', color: style.color ?? '#000000', fontFamily: style.fontFamily, textAlign: style.textAlign ?? 'left', whiteSpace: 'nowrap' }}>
        {value}
      </div>
    </div>
  )
})

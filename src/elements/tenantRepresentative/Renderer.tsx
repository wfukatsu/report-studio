import { memo } from 'react'
import type { TenantRepresentativeElement } from '@/types'
import { useReportStore } from '@/store/reportStore'
import { toFlexAlign } from '@/elements/_base/styleUtils'

interface Props { element: TenantRepresentativeElement; resolveValues?: boolean }

export const TenantRepresentativeRenderer = memo(function TenantRepresentativeRenderer({ element: el, resolveValues = false }: Props) {
  const representative = useReportStore((s) => s.tenantInfo?.representativeName)
  const value = resolveValues ? (representative ?? el.fallback ?? '（代表者名未設定）') : '{{代表者名}}'
  const style = el.style
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: toFlexAlign(style.verticalAlign), overflow: 'hidden', userSelect: 'none' }}>
      <div style={{ fontSize: style.fontSize ? `${style.fontSize}mm` : '3mm', fontWeight: style.fontWeight ?? 'normal', fontStyle: style.fontStyle ?? 'normal', color: style.color ?? '#000000', fontFamily: style.fontFamily, textAlign: style.textAlign ?? 'left', whiteSpace: 'nowrap' }}>
        {value}
      </div>
    </div>
  )
})

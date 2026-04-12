import { memo } from 'react'
import type { TenantCustomElement } from '@/types'
import { useReportStore } from '@/store/reportStore'
import { toFlexAlign } from '@/elements/_base/styleUtils'

interface Props {
  element: TenantCustomElement
  resolveValues?: boolean
}

export const TenantCustomRenderer = memo(function TenantCustomRenderer({
  element: el,
  resolveValues = false,
}: Props) {
  const fieldValue = useReportStore((s) => s.tenantInfo?.custom?.[el.fieldKey])
  const value = resolveValues
    ? (fieldValue ?? el.fallback ?? (el.fieldKey ? `（${el.fieldKey} 未設定）` : '（キー未設定）'))
    : `{{${el.fieldKey || 'fieldKey'}}}`
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

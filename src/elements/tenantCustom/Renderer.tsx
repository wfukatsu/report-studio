import { memo } from 'react'
import type { TenantCustomElement, TextStyle } from '@/types'
import { useReportStore } from '@/store/reportStore'
import { TextContent } from '@/elements/_blocks/renderers/TextContent'
import { resolveStyle } from '@/lib/styleUtils'

interface Props {
  element: TenantCustomElement
  resolveValues?: boolean
  defaultStyle?: TextStyle
}

export const TenantCustomRenderer = memo(function TenantCustomRenderer({
  element: el,
  resolveValues = false,
  defaultStyle,
}: Props) {
  const fieldValue = useReportStore((s) => s.tenantInfo?.custom?.[el.fieldKey])
  const value = resolveValues
    ? (fieldValue ?? el.fallback ?? (el.fieldKey ? `（${el.fieldKey} 未設定）` : '（キー未設定）'))
    : `{{${el.fieldKey || 'fieldKey'}}}`

  return <TextContent text={value} style={resolveStyle(el.style, defaultStyle ?? {})} />
})

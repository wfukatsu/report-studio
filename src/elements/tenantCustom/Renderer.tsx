import { memo } from 'react'
import type { TenantCustomElement, TextStyle } from '@/types'
import { useReportStore } from '@/store/reportStore'
import { TextContent } from '@/elements/_blocks/renderers/TextContent'
import { resolveStyle } from '@/lib/styleUtils'
import { FIELD_PLACEHOLDER_STYLE } from '@/elements/_blocks/constants'

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
  // Preview/export: unset renders nothing, matching the server PDF (#315)
  const resolved = fieldValue ?? el.fallback
  if (resolveValues && !resolved) return null
  const value = resolveValues ? resolved! : `{{${el.fieldKey || 'fieldKey'}}}`

  const resolvedStyle = resolveStyle(el.style, defaultStyle ?? {})
  return <TextContent text={value} style={resolveValues ? resolvedStyle : { ...resolvedStyle, ...FIELD_PLACEHOLDER_STYLE }} />
})

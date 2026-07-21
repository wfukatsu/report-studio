import { memo } from 'react'
import type { TenantCompanyNameElement, TextStyle } from '@/types'
import { useReportStore } from '@/store/reportStore'
import { TextContent } from '@/elements/_blocks/renderers/TextContent'
import { resolveStyle } from '@/lib/styleUtils'
import { FIELD_PLACEHOLDER_STYLE } from '@/elements/_blocks/constants'

interface Props {
  element: TenantCompanyNameElement
  resolveValues?: boolean
  defaultStyle?: TextStyle
}

export const TenantCompanyNameRenderer = memo(function TenantCompanyNameRenderer({
  element: el,
  resolveValues = false,
  defaultStyle,
}: Props) {
  const companyName = useReportStore((s) => s.tenantInfo?.companyName)
  // Preview/export: unset tenant info renders nothing — matching the server PDF,
  // which omits the element entirely (#315). The designer keeps its token.
  const resolved = companyName ?? el.fallback
  if (resolveValues && !resolved) return null
  const value = resolveValues ? resolved! : '{{会社名}}'

  const resolvedStyle = resolveStyle(el.style, defaultStyle ?? {})
  return <TextContent text={value} style={resolveValues ? resolvedStyle : { ...resolvedStyle, ...FIELD_PLACEHOLDER_STYLE }} />
})

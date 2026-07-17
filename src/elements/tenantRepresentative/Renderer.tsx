import { memo } from 'react'
import type { TenantRepresentativeElement, TextStyle } from '@/types'
import { useReportStore } from '@/store/reportStore'
import { TextContent } from '@/elements/_blocks/renderers/TextContent'
import { resolveStyle } from '@/lib/styleUtils'
import { FIELD_PLACEHOLDER_STYLE } from '@/elements/_blocks/constants'

interface Props { element: TenantRepresentativeElement; resolveValues?: boolean; defaultStyle?: TextStyle }

export const TenantRepresentativeRenderer = memo(function TenantRepresentativeRenderer({ element: el, resolveValues = false, defaultStyle }: Props) {
  const representative = useReportStore((s) => s.tenantInfo?.representativeName)
  const value = resolveValues ? (representative ?? el.fallback ?? '（代表者名未設定）') : '{{代表者名}}'

  const resolvedStyle = resolveStyle(el.style, defaultStyle ?? {})
  return <TextContent text={value} style={resolveValues ? resolvedStyle : { ...resolvedStyle, ...FIELD_PLACEHOLDER_STYLE }} />
})

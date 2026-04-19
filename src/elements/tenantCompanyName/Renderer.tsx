import { memo } from 'react'
import type { TenantCompanyNameElement, TextStyle } from '@/types'
import { useReportStore } from '@/store/reportStore'
import { TextContent } from '@/elements/_blocks/renderers/TextContent'
import { resolveStyle } from '@/lib/styleUtils'

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
  const value = resolveValues
    ? (companyName ?? el.fallback ?? '（会社名未設定）')
    : '{{会社名}}'

  return <TextContent text={value} style={resolveStyle(el.style, defaultStyle ?? {})} />
})

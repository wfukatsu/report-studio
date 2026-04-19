import { memo } from 'react'
import type { TenantRepresentativeElement, TextStyle } from '@/types'
import { useReportStore } from '@/store/reportStore'
import { TextContent } from '@/elements/_blocks/renderers/TextContent'
import { resolveStyle } from '@/lib/styleUtils'

interface Props { element: TenantRepresentativeElement; resolveValues?: boolean; defaultStyle?: TextStyle }

export const TenantRepresentativeRenderer = memo(function TenantRepresentativeRenderer({ element: el, resolveValues = false, defaultStyle }: Props) {
  const representative = useReportStore((s) => s.tenantInfo?.representativeName)
  const value = resolveValues ? (representative ?? el.fallback ?? '（代表者名未設定）') : '{{代表者名}}'

  return <TextContent text={value} style={resolveStyle(el.style, defaultStyle ?? {})} />
})

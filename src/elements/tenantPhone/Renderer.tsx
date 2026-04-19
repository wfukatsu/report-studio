import { memo } from 'react'
import type { TenantPhoneElement, TextStyle } from '@/types'
import { useReportStore } from '@/store/reportStore'
import { TextContent } from '@/elements/_blocks/renderers/TextContent'
import { resolveStyle } from '@/lib/styleUtils'

interface Props { element: TenantPhoneElement; resolveValues?: boolean; defaultStyle?: TextStyle }

export const TenantPhoneRenderer = memo(function TenantPhoneRenderer({ element: el, resolveValues = false, defaultStyle }: Props) {
  const phone = useReportStore((s) => s.tenantInfo?.phone)
  const value = resolveValues ? (phone ?? el.fallback ?? '（電話番号未設定）') : '{{電話番号}}'

  return <TextContent text={value} style={resolveStyle(el.style, defaultStyle ?? {})} />
})

import { memo } from 'react'
import type { TenantAddressElement, TextStyle } from '@/types'
import { useReportStore } from '@/store/reportStore'
import { TextContent } from '@/elements/_blocks/renderers/TextContent'
import { resolveStyle } from '@/lib/styleUtils'
import { FIELD_PLACEHOLDER_STYLE } from '@/elements/_blocks/constants'
import { formatAddress } from '@/elements/_blocks/formatAddress'

interface Props {
  element: TenantAddressElement
  resolveValues?: boolean
  defaultStyle?: TextStyle
}

export const TenantAddressRenderer = memo(function TenantAddressRenderer({ element: el, resolveValues = false, defaultStyle }: Props) {
  const tenantInfo = useReportStore((s) => s.tenantInfo)
  const mode = el.displayMode ?? 'single'

  const value = resolveValues
    ? (formatAddress({
        postalCode: tenantInfo?.postalCode,
        address1: tenantInfo?.address1,
        address2: tenantInfo?.address2,
        address: tenantInfo?.address,
      }, mode) || el.fallback || '（住所未設定）')
    : '{{住所}}'

  const resolvedStyle = resolveStyle(el.style, defaultStyle ?? {})
  return <TextContent text={value} style={resolveValues ? resolvedStyle : { ...resolvedStyle, ...FIELD_PLACEHOLDER_STYLE }} />
})

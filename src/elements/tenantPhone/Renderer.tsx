import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { TenantPhoneElement, TextStyle } from '@/types'
import { useReportStore } from '@/store/reportStore'
import { TextContent } from '@/elements/_blocks/renderers/TextContent'
import { resolveStyle } from '@/lib/styleUtils'
import { FIELD_PLACEHOLDER_STYLE } from '@/elements/_blocks/constants'

interface Props { element: TenantPhoneElement; resolveValues?: boolean; defaultStyle?: TextStyle }

export const TenantPhoneRenderer = memo(function TenantPhoneRenderer({ element: el, resolveValues = false, defaultStyle }: Props) {
  const { t } = useTranslation('elements')
  const phone = useReportStore((s) => s.tenantInfo?.phone)
  // Preview/export: unset renders nothing, matching the server PDF (#315)
  const resolved = phone ?? el.fallback
  if (resolveValues && !resolved) return null
  const value = resolveValues ? resolved! : t('tenantPhone.placeholder', { token: `{{${t('tenantPhone.tokenName')}}}` })

  const resolvedStyle = resolveStyle(el.style, defaultStyle ?? {})
  return <TextContent text={value} style={resolveValues ? resolvedStyle : { ...resolvedStyle, ...FIELD_PLACEHOLDER_STYLE }} />
})

import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { CurrentDateElement, CurrentDateFormat } from '@/types'
import { toFlexAlign } from '@/elements/_base/styleUtils'
import { formatCurrentDate } from './format'
import { DEFAULT_FONT_SIZE } from '@/elements/_blocks/constants'
import { resolveFontFamily } from '@/lib/styleUtils'

/**
 * i18n keys for the human-readable placeholder labels shown in the editor
 * instead of resolved values. Keys map the raw CurrentDateFormat enum; the
 * wareki entries carry an era token (`currentDate.eraTokenName`, wrapped in
 * `{{ }}`) via interpolation.
 */
const FORMAT_PLACEHOLDER_KEYS = {
  'yyyy/MM/dd':            'currentDate.placeholderYmdSlash',
  'yyyy年MM月dd日':         'currentDate.placeholderYmdJa',
  'yyyy-MM-dd':            'currentDate.placeholderYmdDash',
  'MM/dd/yyyy':            'currentDate.placeholderMdy',
  'wareki_full':           'currentDate.placeholderWarekiFull',
  'wareki_short':          'currentDate.placeholderWarekiShort',
  'yyyy年MM月dd日 (ddd)':  'currentDate.placeholderYmdJaWeekday',
  'custom':                'currentDate.placeholderCustom',
} as const satisfies Record<CurrentDateFormat, string>

interface Props {
  element: CurrentDateElement
  /** When true, resolve actual date instead of showing placeholder */
  resolveValues?: boolean
}

export const CurrentDateRenderer = memo(function CurrentDateRenderer({
  element: el,
  resolveValues = false,
}: Props) {
  const { t } = useTranslation('elements')
  const style = el.style
  const text = useMemo(() => {
    if (resolveValues) {
      return formatCurrentDate(el.format, el.customFormat)
    }
    if (el.format === 'custom') {
      return el.customFormat ?? t('currentDate.placeholderCustom')
    }
    if (el.format === 'wareki_full' || el.format === 'wareki_short') {
      return t(FORMAT_PLACEHOLDER_KEYS[el.format], { eraToken: `{{${t('currentDate.eraTokenName')}}}` })
    }
    return t(FORMAT_PLACEHOLDER_KEYS[el.format])
  }, [el.format, el.customFormat, resolveValues, t])

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
          fontSize: `${style.fontSize ?? DEFAULT_FONT_SIZE}pt`,
          fontWeight: style.fontWeight ?? 'normal',
          fontStyle: style.fontStyle ?? 'normal',
          color: style.color ?? '#000000',
          fontFamily: resolveFontFamily(style.fontFamily),
          textAlign: style.textAlign ?? 'left',
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </div>
    </div>
  )
})

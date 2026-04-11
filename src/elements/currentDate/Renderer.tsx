import { memo, useMemo } from 'react'
import type { CurrentDateElement, CurrentDateFormat } from '@/types'
import { toFlexAlign } from '@/elements/_base/styleUtils'
import { formatCurrentDate } from './format'

/** Human-readable placeholder labels shown in the editor instead of resolved values. */
const FORMAT_PLACEHOLDERS: Record<CurrentDateFormat, string> = {
  'yyyy/MM/dd':            'yyyy/MM/dd',
  'yyyy年MM月dd日':         'yyyy年MM月dd日',
  'yyyy-MM-dd':            'yyyy-MM-dd',
  'MM/dd/yyyy':            'MM/dd/yyyy',
  'wareki_full':           '{{元号}}X年MM月dd日',
  'wareki_short':          '{{元号}}X.MM.dd',
  'yyyy年MM月dd日 (ddd)':  'yyyy年MM月dd日 (曜日)',
  'custom':                'カスタム日付',
}

interface Props {
  element: CurrentDateElement
  /** When true, resolve actual date instead of showing placeholder */
  resolveValues?: boolean
}

export const CurrentDateRenderer = memo(function CurrentDateRenderer({
  element: el,
  resolveValues = false,
}: Props) {
  const style = el.style
  const text = useMemo(() => {
    if (resolveValues) {
      return formatCurrentDate(el.format, el.customFormat)
    }
    if (el.format === 'custom') {
      return el.customFormat ?? 'カスタム日付'
    }
    return FORMAT_PLACEHOLDERS[el.format]
  }, [el.format, el.customFormat, resolveValues])

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
          fontSize: style.fontSize ? `${style.fontSize}mm` : '3mm',
          fontWeight: style.fontWeight ?? 'normal',
          fontStyle: style.fontStyle ?? 'normal',
          color: style.color ?? '#000000',
          fontFamily: style.fontFamily,
          textAlign: style.textAlign ?? 'left',
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </div>
    </div>
  )
})

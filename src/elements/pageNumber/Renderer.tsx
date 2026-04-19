import { memo } from 'react'
import type { PageNumberElement } from '@/types'
import { toFlexAlign } from '@/elements/_base/styleUtils'
import { formatPageNumber } from './format'
import { DEFAULT_FONT_SIZE } from '@/elements/_blocks/constants'

interface Props {
  element: PageNumberElement
  /** When true, resolve actual page numbers instead of showing template tokens */
  resolveValues?: boolean
  /** Current page index (1-based) — used only when resolveValues=true */
  pageIndex?: number
  /** Total page count — used only when resolveValues=true */
  totalPages?: number
}

export const PageNumberRenderer = memo(function PageNumberRenderer({
  element: el,
  resolveValues = false,
  pageIndex = 1,
  totalPages = 1,
}: Props) {
  const style = el.style
  const template = el.format === 'custom' ? (el.customFormat ?? '{{page}}') : el.format
  const text = resolveValues
    ? formatPageNumber(el.format, el.customFormat, pageIndex, totalPages)
    : template

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
          color: style.color ?? '#666666',
          fontFamily: style.fontFamily,
          textAlign: style.textAlign ?? 'center',
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </div>
    </div>
  )
})

import { memo } from 'react'
import type { BarcodeElement } from '@/types'
import { interpolate } from '@/lib/dataBinding'
import { BarcodeContent } from '@/elements/_blocks/renderers/BarcodeContent'

interface Props {
  element: BarcodeElement
  data?: Record<string, unknown>
}

export const BarcodeRenderer = memo(function BarcodeRenderer({ element: el, data = {} }: Props) {
  const resolvedValue = interpolate(el.value, data)

  return (
    <BarcodeContent
      kind={el.kind}
      value={resolvedValue}
      width={el.size.width}
      height={el.size.height}
      errorCorrection={el.errorCorrection}
      darkColor={el.darkColor}
      lightColor={el.lightColor}
      showText={el.showText}
    />
  )
})

import { memo } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import Barcode from 'react-barcode'
import type { BarcodeElement } from '@/types'
import { interpolate } from '@/lib/dataBinding'

interface Props {
  element: BarcodeElement
  data?: Record<string, unknown>
}

export const BarcodeRenderer = memo(function BarcodeRenderer({ element: el, data = {} }: Props) {
  const resolvedValue = interpolate(el.value, data)

  if (el.kind === 'qr') {
    const size = Math.min(parseFloat(String(el.size.width)) || 30, parseFloat(String(el.size.height)) || 30)
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <QRCodeSVG value={resolvedValue || ' '} size={size * 3.78} fgColor={el.darkColor ?? '#000000'} bgColor={el.lightColor ?? '#ffffff'} level={el.errorCorrection ?? 'M'} />
      </div>
    )
  }

  if (el.kind === 'code128') {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <Barcode value={resolvedValue || '0000000000'} format="CODE128" width={1.2} height={(el.size.height * 3.78) * 0.75} displayValue={el.showText ?? true} lineColor={el.darkColor ?? '#000000'} background={el.lightColor ?? '#ffffff'} margin={2} fontSize={8} />
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #d1d5db', fontSize: '2.5mm', color: '#9ca3af' }}>
      [{el.kind}]
    </div>
  )
})

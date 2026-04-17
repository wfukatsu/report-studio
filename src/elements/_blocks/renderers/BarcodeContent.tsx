import { memo } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import ReactBarcode from 'react-barcode'
import { MM_TO_PX } from '../constants'
<<<<<<< HEAD
import type { BarcodeKind } from '@/types'
=======

type BarcodeKind = 'qr' | 'code128' | 'code39' | 'jan13'
>>>>>>> feat/formtable-excel-editing

/** JsBarcode format mapping — JAN13 is EAN-13 in Japanese naming */
const FORMAT_MAP: Record<Exclude<BarcodeKind, 'qr'>, string> = {
  code128: 'CODE128',
  code39: 'CODE39',
  jan13: 'EAN13',
}

/** Default placeholder values per barcode kind */
const DEFAULT_VALUES: Record<BarcodeKind, string> = {
  qr: 'https://example.com',
  code128: '0000000000',
  code39: 'HELLO',
  jan13: '4902778913406',
}

<<<<<<< HEAD
/**
 * CODE39 allows only: A-Z, 0-9, space, and: - . $ / + %
 * JsBarcode throws a native Error for any other character.
 * Sanitise by uppercasing and stripping disallowed characters.
 */
const CODE39_ALLOWED = /[^A-Z0-9 \-.$/+%]/g
function sanitizeCode39(value: string): string {
  return value.toUpperCase().replace(CODE39_ALLOWED, '')
}

/**
 * EAN-13 / JAN-13 requires exactly 12–13 digit characters.
 * Return the placeholder if the value is clearly invalid.
 */
function sanitizeJan13(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 12 || digits.length > 13) return DEFAULT_VALUES.jan13
  return digits.slice(0, 13)
}

=======
>>>>>>> feat/formtable-excel-editing
interface BarcodeContentProps {
  kind: BarcodeKind
  value: string
  width: number
  height: number
  errorCorrection?: 'L' | 'M' | 'Q' | 'H'
  darkColor?: string
  lightColor?: string
  showText?: boolean
}

export const BarcodeContent = memo(function BarcodeContent({
  kind,
  value,
  width,
  height,
  errorCorrection = 'M',
  darkColor = '#000000',
  lightColor = '#ffffff',
  showText = true,
}: BarcodeContentProps) {
<<<<<<< HEAD
  // Sanitise the value per barcode format — JsBarcode throws a native Error for
  // invalid characters, and that error is not catchable by React error boundaries
  // unless the component is wrapped in one. Sanitising here prevents hard crashes.
  let displayValue = value || DEFAULT_VALUES[kind]
  if (kind === 'code39') displayValue = sanitizeCode39(displayValue) || DEFAULT_VALUES.code39
  if (kind === 'jan13') displayValue = sanitizeJan13(displayValue)
=======
  const displayValue = value || DEFAULT_VALUES[kind]
>>>>>>> feat/formtable-excel-editing

  if (kind === 'qr') {
    const size = Math.min(width, height) * MM_TO_PX
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <QRCodeSVG
          value={displayValue}
          size={size}
          fgColor={darkColor}
          bgColor={lightColor}
          level={errorCorrection}
        />
      </div>
    )
  }

  // CODE128, CODE39, EAN13 (JAN13) — unified through react-barcode / JsBarcode
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <ReactBarcode
        value={displayValue}
        format={FORMAT_MAP[kind]}
        width={1.2}
        height={height * MM_TO_PX * 0.75}
        displayValue={showText}
        lineColor={darkColor}
        background={lightColor}
        margin={2}
        fontSize={8}
      />
    </div>
  )
})

import type { CalculationFormat, NumberFormatType, DateFormatType, AddressFormatType } from '@/types'
import { formatAddress } from '@/elements/_blocks/formatAddress'

// ---------------------------------------------------------------------------
// 和暦変換テーブル
// ---------------------------------------------------------------------------

interface EraEntry {
  name: string
  abbr: string
  // Era boundary as a civil (calendar) date. Comparing civil components — not
  // `Date` instants — keeps 和暦 timezone-independent so it matches the server
  // `ValueFormatter` (LocalDate) at boundary days like 2019-05-01 (令和元年).
  // Using `new Date('2019-05-01')` (UTC midnight) here mis-classified that day
  // as 平成 on +09:00 (JST) machines (#329 Phase 4).
  startY: number
  startM: number
  startD: number
}

const ERA_TABLE: EraEntry[] = [
  { name: '令和', abbr: 'R', startY: 2019, startM: 5, startD: 1 },
  { name: '平成', abbr: 'H', startY: 1989, startM: 1, startD: 8 },
  { name: '昭和', abbr: 'S', startY: 1926, startM: 12, startD: 25 },
  { name: '大正', abbr: 'T', startY: 1912, startM: 7, startD: 30 },
  { name: '明治', abbr: 'M', startY: 1868, startM: 1, startD: 25 },
]

function getEra(date: Date): { era: EraEntry; year: number } | null {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  for (const era of ERA_TABLE) {
    const onOrAfter =
      y > era.startY ||
      (y === era.startY && (m > era.startM || (m === era.startM && d >= era.startD)))
    if (onOrAfter) {
      return { era, year: y - era.startY + 1 }
    }
  }
  return null
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatWareki(date: Date, fmt: DateFormatType): string {
  const result = getEra(date)
  if (!result) return date.toLocaleDateString('ja-JP')

  const { era, year } = result
  const y = year === 1 ? '元' : String(year)
  const m = date.getMonth() + 1
  const d = date.getDate()

  if (fmt === 'wareki_full') return `${era.name}${y}年${m}月${d}日`
  if (fmt === 'wareki_short') return `${era.abbr}${String(year).padStart(2, '0')}.${pad2(m)}.${pad2(d)}`
  return `${era.name}${y}年${m}月${d}日`
}

// ---------------------------------------------------------------------------
// 大字 (漢数字) 変換
// ---------------------------------------------------------------------------

const DAIJI_DIGITS = ['', '壱', '弐', '参', '四', '伍', '六', '七', '八', '九']
const DAIJI_SMALL_UNITS = ['', '拾', '百', '千']
const DAIJI_BIG_UNITS = ['', '万', '億', '兆']

function groupToKanji(n: number): string {
  if (n === 0) return ''
  let result = ''
  const digits = String(n).split('').reverse()
  for (let i = 0; i < digits.length; i++) {
    const d = parseInt(digits[i], 10)
    if (d === 0) continue
    const unit = DAIJI_SMALL_UNITS[i] ?? ''
    const digit = i === 0 ? DAIJI_DIGITS[d] : (d === 1 ? '' : DAIJI_DIGITS[d])
    result = digit + unit + result
  }
  return result
}

export function toKanjiNumeral(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return String(amount)
  const int = Math.floor(amount)
  if (int === 0) return '金零円也'

  const groups: number[] = []
  let remaining = int
  while (remaining > 0) {
    groups.push(remaining % 10000)
    remaining = Math.floor(remaining / 10000)
  }

  let result = ''
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]
    if (g === 0) continue
    result += groupToKanji(g) + (DAIJI_BIG_UNITS[i] ?? '')
  }

  return `金${result}円也`
}

// ---------------------------------------------------------------------------
// 数値フォーマット
// ---------------------------------------------------------------------------

// Explicit Intl.NumberFormat instances (Phase 4, #329) replacing ad-hoc
// `Number.prototype.toLocaleString`. Same locale + options as before, so output
// is byte-identical; the server `ValueFormatter` mirrors these (grouping "," /
// decimal ".") and the shared golden fixture (numberFormatter.parity.test.ts /
// ValueFormatterParityTest) pins the front↔server contract.
const NF_CURRENCY_JPY = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })
const NF_CURRENCY_USD = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const NF_COMMA = new Intl.NumberFormat('ja-JP')

export function formatNumber(value: number, format: CalculationFormat): string {
  const { type, decimalPlaces = 0, customPattern } = format

  switch (type as NumberFormatType) {
    case 'integer':
      return String(Math.round(value))
    case 'decimal':
      return value.toFixed(decimalPlaces)
    case 'currency_jpy':
      return `¥${NF_CURRENCY_JPY.format(value)}`
    case 'currency_usd':
      return `$${NF_CURRENCY_USD.format(value)}`
    case 'percent':
      return `${(value * 100).toFixed(decimalPlaces)}%`
    case 'comma':
      return NF_COMMA.format(value)
    case 'kanji_numeral':
      return toKanjiNumeral(value)
    case 'custom':
      if (customPattern) return applyCustomPattern(value, customPattern)
      return String(value)
    default:
      return String(value)
  }
}

// ---------------------------------------------------------------------------
// 日付フォーマット
// ---------------------------------------------------------------------------

/**
 * Parse a formatter input into a Date using **civil** (calendar) semantics for
 * date-only strings, so date/和暦 output is timezone-independent and matches the
 * server `ValueFormatter` (which parses with `LocalDate`). `new Date('2026-04-01')`
 * parses as UTC midnight and shifts the day west of UTC; `new Date(y, m-1, d)`
 * builds a local civil date that yields the same Y/M/D in every timezone (#329
 * Phase 4). Strings carrying an explicit time/offset fall through to `new Date`.
 */
function toCivilDate(value: Date | string): Date {
  if (value instanceof Date) return value
  const s = String(value).trim()
  const m = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(s)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return new Date(s)
}

export function formatDate(value: Date | string, format: CalculationFormat): string {
  const date = toCivilDate(value)
  if (isNaN(date.getTime())) return String(value)

  const { type, customPattern } = format
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()

  switch (type as DateFormatType) {
    case 'yyyy/MM/dd':
      return `${y}/${pad2(m)}/${pad2(d)}`
    case 'yyyy年MM月dd日':
      return `${y}年${m}月${d}日`
    case 'MM/dd/yyyy':
      return `${pad2(m)}/${pad2(d)}/${y}`
    case 'wareki_full':
      return formatWareki(date, 'wareki_full')
    case 'wareki_short':
      return formatWareki(date, 'wareki_short')
    case 'custom':
      if (customPattern) return applyDatePattern(date, customPattern)
      return date.toLocaleDateString('ja-JP')
    default:
      return date.toLocaleDateString('ja-JP')
  }
}

// ---------------------------------------------------------------------------
// 汎用フォーマット (値の型に応じて数値/日付を自動判定)
// ---------------------------------------------------------------------------

/**
 * 汎用フォーマット。
 *
 * @param value      フォーマット対象の値
 * @param format     書式定義
 * @param context    住所フォーマット用: { data, fieldKey } を渡すと同一グループの
 *                   postalCode/address1/address2 を自動取得して formatAddress() を呼ぶ
 */
export function applyFormat(
  value: unknown,
  format: CalculationFormat,
  context?: { data: Record<string, unknown>; fieldKey: string },
): string {
  if (value === null || value === undefined) return ''

  // 住所フォーマット
  const addressTypes: AddressFormatType[] = ['address_single', 'address_multiline']
  if (addressTypes.includes(format.type as AddressFormatType)) {
    return applyAddressFormat(value, format.type as AddressFormatType, context)
  }

  // 日付フォーマット指定の場合
  const dateTypes: string[] = ['yyyy/MM/dd', 'yyyy年MM月dd日', 'MM/dd/yyyy', 'wareki_full', 'wareki_short']
  if (dateTypes.includes(format.type)) {
    return formatDate(value as Date | string, format)
  }

  // 数値フォーマット
  const num = typeof value === 'number' ? value : parseFloat(String(value))
  if (!isNaN(num)) return formatNumber(num, format)

  return String(value)
}

function applyAddressFormat(
  value: unknown,
  type: AddressFormatType,
  context?: { data: Record<string, unknown>; fieldKey: string },
): string {
  const mode = type === 'address_multiline' ? 'multiLine' : 'single'

  // 値がオブジェクトの場合 (グループキーでバインドされたケース)
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    return formatAddress({
      postalCode: obj.postalCode != null ? String(obj.postalCode) : undefined,
      address1: obj.address1 != null ? String(obj.address1) : undefined,
      address2: obj.address2 != null ? String(obj.address2) : undefined,
      address: obj.address != null ? String(obj.address) : undefined,
    }, mode)
  }

  // context があれば同一グループのフィールドを自動取得
  if (context) {
    const { data, fieldKey } = context
    const dotIdx = fieldKey.lastIndexOf('.')
    if (dotIdx >= 0) {
      const prefix = fieldKey.substring(0, dotIdx)
      const resolve = (subKey: string): string | undefined => {
        const v = data[`${prefix}.${subKey}`]
        return v != null ? String(v) : undefined
      }
      return formatAddress({
        postalCode: resolve('postalCode'),
        address1: resolve('address1'),
        address2: resolve('address2'),
        address: resolve('address'),
      }, mode)
    }
  }

  // 単純な文字列値の場合はそのまま返す
  return String(value)
}

// ---------------------------------------------------------------------------
// カスタムパターン適用 (簡易実装)
// ---------------------------------------------------------------------------

function applyCustomPattern(value: number, pattern: string): string {
  // '#,##0.00' 形式のパターンを簡易サポート
  const hasComma = pattern.includes(',')
  const decimals = (pattern.split('.')[1] ?? '').replace(/[^0#]/g, '').length
  let result = hasComma
    ? new Intl.NumberFormat('ja-JP', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value)
    : value.toFixed(decimals)
  if (pattern.startsWith('¥') || pattern.startsWith('$')) result = pattern[0] + result
  return result
}

function applyDatePattern(date: Date, pattern: string): string {
  return pattern
    .replace('yyyy', String(date.getFullYear()))
    .replace('MM', pad2(date.getMonth() + 1))
    .replace('dd', pad2(date.getDate()))
    .replace('HH', pad2(date.getHours()))
    .replace('mm', pad2(date.getMinutes()))
}

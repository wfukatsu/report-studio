import type { CurrentDateFormat } from '@/types'

const DAY_NAMES_JA = ['日', '月', '火', '水', '木', '金', '土']

/** Era table for wareki conversion (newest first). */
const ERAS = [
  { name: '令和', abbr: 'R', start: new Date(2019, 4, 1) },
  { name: '平成', abbr: 'H', start: new Date(1989, 0, 8) },
  { name: '昭和', abbr: 'S', start: new Date(1926, 11, 25) },
  { name: '大正', abbr: 'T', start: new Date(1912, 6, 30) },
  { name: '明治', abbr: 'M', start: new Date(1868, 0, 25) },
]

function toWareki(date: Date): { eraName: string; abbr: string; year: number } {
  for (const era of ERAS) {
    if (date >= era.start) {
      const year = date.getFullYear() - era.start.getFullYear() + 1
      return { eraName: era.name, abbr: era.abbr, year }
    }
  }
  return { eraName: '西暦', abbr: '', year: date.getFullYear() }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Format the current date according to the given format type.
 */
export function formatCurrentDate(
  format: CurrentDateFormat,
  customFormat?: string,
  now?: Date,
): string {
  const d = now ?? new Date()
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()

  switch (format) {
    case 'yyyy/MM/dd':
      return `${y}/${pad2(m)}/${pad2(day)}`
    case 'yyyy年MM月dd日':
      return `${y}年${pad2(m)}月${pad2(day)}日`
    case 'yyyy-MM-dd':
      return `${y}-${pad2(m)}-${pad2(day)}`
    case 'MM/dd/yyyy':
      return `${pad2(m)}/${pad2(day)}/${y}`
    case 'wareki_full': {
      const w = toWareki(d)
      return `${w.eraName}${w.year}年${pad2(m)}月${pad2(day)}日`
    }
    case 'wareki_short': {
      const w = toWareki(d)
      return `${w.abbr}${w.year}.${pad2(m)}.${pad2(day)}`
    }
    case 'yyyy年MM月dd日 (ddd)':
      return `${y}年${pad2(m)}月${pad2(day)}日 (${DAY_NAMES_JA[d.getDay()]})`
    case 'custom':
      return (customFormat ?? 'yyyy/MM/dd')
        .replace(/yyyy/g, String(y))
        .replace(/MM/g, pad2(m))
        .replace(/ddd/g, DAY_NAMES_JA[d.getDay()])
        .replace(/dd/g, pad2(day))
    default:
      return `${y}/${pad2(m)}/${pad2(day)}`
  }
}

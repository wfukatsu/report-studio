import { downloadBlob } from '@/api/client'

/** Escape + join rows into RFC4180-ish CSV and trigger a download. */
export function exportToCsv(
  columns: string[],
  rows: Record<string, unknown>[],
  filename: string,
) {
  const escape = (v: unknown): string => {
    const s = v == null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const header = columns.map(escape).join(',')
  const body = rows.map((row) => columns.map((col) => escape(row[col])).join(',')).join('\n')
  const csv = header + '\n' + body
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename)
}

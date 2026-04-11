import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import type { ReportDefinition } from '@/types'
import { generateStatelessPdf } from '@/api/reportApi'
import { downloadBlob } from '@/api/client'
import { formatPageNumber } from '@/elements/pageNumber/format'
import { formatCurrentDate } from '@/elements/currentDate/format'
import type { PageNumberFormat, CurrentDateFormat } from '@/types'

const EXPORT_SCALE = 2

/** 1mm = 2.8346pt (used for jsPDF mm-unit mode) */
export const MM_TO_PT = 2.8346

// ---------------------------------------------------------------------------
// JSON export / import
// ---------------------------------------------------------------------------

export const SCHEMA_VERSION = 'report-definition/v1' as const

/**
 * Serialize a ReportDefinition to a JSON string with `$schema` marker.
 * Uses JSON.parse/stringify to strip any immer Proxy objects safely.
 */
export function exportToJSON(definition: ReportDefinition): string {
  const exportable = {
    $schema: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    ...JSON.parse(JSON.stringify(definition)),
  }
  return JSON.stringify(exportable, null, 2)
}

/** Allowed raster data: URI prefixes */
const SAFE_RASTER_PREFIXES = [
  'data:image/png',
  'data:image/jpeg',
  'data:image/gif',
  'data:image/webp',
]

/**
 * Dangerous SVG elements/attributes that can execute scripts.
 * Matched case-insensitively against decoded SVG content.
 */
const SVG_DANGEROUS_PATTERNS = [
  /<script[\s>]/i,
  /\bon\w+\s*=/i,                    // onclick=, onload=, onerror=, etc.
  /javascript\s*:/i,
  /<iframe[\s>]/i,
  /<embed[\s>]/i,
  /<object[\s>]/i,
  /<foreignObject[\s>]/i,
  // Defence-in-depth: block external resource loading and dynamic attribute rewriting
  /xlink:href\s*=/i,                 // legacy xlink:href (block entirely — fragment refs rare, external common)
  /href\s*=\s*["'][^"'#]/i,          // href pointing to non-fragment URL (allows href="#id")
  // CSS style attribute with url() can load external resources or execute javascript:
  /style\s*=\s*["'][^"']*url\s*\(/i, // style="...url(...)..." — blocks data-fetch vectors
]

/**
 * Check whether a data:image/svg+xml URI contains only safe SVG content.
 * Decodes both base64 and URL-encoded payloads, then rejects if any
 * script-capable element or attribute is found.
 */
function isSafeSvgDataUri(src: string): boolean {
  const lower = src.toLowerCase().trim()
  if (!lower.startsWith('data:image/svg+xml')) return false
  if (src.length > 512 * 1024) return false  // 512 KB limit for SVG

  try {
    const commaIdx = src.indexOf(',')
    if (commaIdx === -1) return false
    const header = src.slice(0, commaIdx).toLowerCase()
    const payload = src.slice(commaIdx + 1)

    const rawDecoded = header.includes('base64')
      ? atob(payload)
      : decodeURIComponent(payload)

    // Decode HTML numeric character references (e.g. &#106; → 'j', &#x6A; → 'j')
    // before running pattern matching — SVG parsers resolve these before execution
    // so `&#106;avascript:` must be caught the same as `javascript:`.
    const decoded = rawDecoded
      .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))

    return !SVG_DANGEROUS_PATTERNS.some((p) => p.test(decoded))
  } catch {
    return false
  }
}

/**
 * Return true only for safe image src values.
 * - Empty string → false (prevents self-requests)
 * - data: URIs → raster formats (png/jpeg/gif/webp) up to 2 MB
 * - data:image/svg+xml → allowed only if content passes script-free check
 * - URLs → https:// only (http:// blocked: mixed-content + privacy)
 */
export function isSafeImageSrc(src: string): boolean {
  if (!src) return false
  const lower = src.toLowerCase().trim()
  if (lower.startsWith('data:image/svg+xml')) {
    return isSafeSvgDataUri(src)
  }
  if (lower.startsWith('data:')) {
    return (
      src.length <= 2 * 1024 * 1024 &&
      SAFE_RASTER_PREFIXES.some((p) => lower.startsWith(p))
    )
  }
  return lower.startsWith('https://')
}

// ---------------------------------------------------------------------------
// Auto-field resolution for export (pageNumber / currentDate)
// ---------------------------------------------------------------------------

interface AutoFieldSnapshot { node: HTMLElement; original: string }

/**
 * Resolve auto-field elements (pageNumber, currentDate) within a container
 * to their actual values. Returns snapshots to restore later.
 */
function resolveAutoFields(
  container: HTMLElement,
  pageIndex: number,
  totalPages: number,
): AutoFieldSnapshot[] {
  const snapshots: AutoFieldSnapshot[] = []

  // pageNumber elements
  container.querySelectorAll<HTMLElement>('[data-element-type="pageNumber"]').forEach((el) => {
    const textNode = el.querySelector('div div') as HTMLElement | null
    if (!textNode) return
    snapshots.push({ node: textNode, original: textNode.textContent ?? '' })
    const template = textNode.textContent ?? ''
    // Detect format from template content
    const format = template as PageNumberFormat
    textNode.textContent = formatPageNumber(format, template, pageIndex, totalPages)
  })

  // currentDate elements
  container.querySelectorAll<HTMLElement>('[data-element-type="currentDate"]').forEach((el) => {
    const textNode = el.querySelector('div div') as HTMLElement | null
    if (!textNode) return
    snapshots.push({ node: textNode, original: textNode.textContent ?? '' })
    const template = textNode.textContent ?? ''
    // Map placeholder back to format key
    const formatMap: Record<string, CurrentDateFormat> = {
      'yyyy/MM/dd': 'yyyy/MM/dd',
      'yyyy年MM月dd日': 'yyyy年MM月dd日',
      'yyyy-MM-dd': 'yyyy-MM-dd',
      'MM/dd/yyyy': 'MM/dd/yyyy',
      '{{元号}}X年MM月dd日': 'wareki_full',
      '{{元号}}X.MM.dd': 'wareki_short',
      'yyyy年MM月dd日 (曜日)': 'yyyy年MM月dd日 (ddd)',
    }
    const format = formatMap[template] ?? 'custom'
    textNode.textContent = formatCurrentDate(format, format === 'custom' ? template : undefined)
  })

  return snapshots
}

function restoreAutoFields(snapshots: AutoFieldSnapshot[]): void {
  for (const s of snapshots) {
    s.node.textContent = s.original
  }
}

export async function exportPageToPng(
  canvasEl: HTMLElement,
  fileName = 'report.png',
  pageIndex = 1,
  totalPages = 1,
): Promise<void> {
  const snapshots = resolveAutoFields(canvasEl, pageIndex, totalPages)
  try {
    const canvas = await html2canvas(canvasEl, { useCORS: true, scale: EXPORT_SCALE })
    const link = document.createElement('a')
    link.download = fileName
    link.href = canvas.toDataURL('image/png')
    link.click()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`PNG export failed: ${message}`)
  } finally {
    restoreAutoFields(snapshots)
  }
}

/**
 * Export via server-side PDF generation (high quality, vector text).
 * Falls back to client-side html2canvas if the backend is unavailable.
 */
export async function exportToServerPdf(
  definition: ReportDefinition,
  testData: Record<string, unknown> | null,
  filename = 'report.pdf',
): Promise<void> {
  const defJson = JSON.parse(JSON.stringify(definition)) as Record<string, unknown>
  const dataJson = (testData ?? {}) as Record<string, unknown>
  const blob = await generateStatelessPdf(defJson, dataJson)
  downloadBlob(blob, filename)
}

export async function exportReportToPdf(
  pageEls: HTMLElement[],
  fileName = 'report.pdf',
): Promise<void> {
  if (pageEls.length === 0) return

  const totalPages = pageEls.length
  const allSnapshots = pageEls.map((el, i) => resolveAutoFields(el, i + 1, totalPages))
  try {
    // Render all pages in parallel — avoids double-rendering page 0 and speeds up multi-page export
    const canvases = await Promise.all(
      pageEls.map((el) => html2canvas(el, { useCORS: true, scale: EXPORT_SCALE })),
    )

    const pdfWidth = canvases[0].width / EXPORT_SCALE
    const pdfHeight = canvases[0].height / EXPORT_SCALE

    const pdf = new jsPDF({
      orientation: pdfWidth > pdfHeight ? 'landscape' : 'portrait',
      unit: 'px',
      format: [pdfWidth, pdfHeight],
    })

    for (let i = 0; i < canvases.length; i++) {
      if (i > 0) pdf.addPage()
      const imgData = canvases[i].toDataURL('image/png')
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
    }

    pdf.save(fileName)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`PDF export failed: ${message}`)
  } finally {
    for (const snapshots of allSnapshots) restoreAutoFields(snapshots)
  }
}

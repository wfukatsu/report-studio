import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { FORMAT_VERSION } from './formatVersion'
import type { ReportDefinition } from '@/types'
import { formatPageNumber } from '@/elements/pageNumber/format'
import { formatCurrentDate } from '@/elements/currentDate/format'
import type { PageNumberElement, CurrentDateElement } from '@/types'

const EXPORT_SCALE = 2

// ---------------------------------------------------------------------------
// JSON export / import
// ---------------------------------------------------------------------------

// Version constants live in formatVersion.ts (single source; re-exported here
// for backwards compatibility with existing importers).
export { SCHEMA_VERSION, FORMAT_VERSION } from './formatVersion'

/**
 * Serialize a ReportDefinition to a JSON string in formatVersion: 2 envelope.
 * Uses JSON.parse/stringify to strip any immer Proxy objects safely.
 */
export function exportToJSON(definition: ReportDefinition): string {
  const envelope = {
    formatVersion: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    definition: JSON.parse(JSON.stringify(definition)),
  }
  return JSON.stringify(envelope, null, 2)
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

/** Model lookup for auto-field elements, keyed by element id. */
export type AutoFieldModels = Map<string, PageNumberElement | CurrentDateElement>

/**
 * Resolve auto-field elements (pageNumber, currentDate) within a container to
 * their actual values, reading the format from the element MODEL rather than
 * reverse-mapping the rendered placeholder text (issue #61). Returns snapshots
 * to restore later. Without a model map, the nodes are left untouched.
 */
function resolveAutoFields(
  container: HTMLElement,
  models: AutoFieldModels | undefined,
  pageIndex: number,
  totalPages: number,
): AutoFieldSnapshot[] {
  const snapshots: AutoFieldSnapshot[] = []
  if (!models) return snapshots

  const resolve = (type: string, compute: (el: PageNumberElement | CurrentDateElement) => string) => {
    container.querySelectorAll<HTMLElement>(`[data-element-type="${type}"]`).forEach((node) => {
      const id = node.getAttribute('data-element-id')
      const model = id ? models.get(id) : undefined
      if (!model) return
      const textNode = node.querySelector('div div') as HTMLElement | null
      if (!textNode) return
      snapshots.push({ node: textNode, original: textNode.textContent ?? '' })
      textNode.textContent = compute(model)
    })
  }

  resolve('pageNumber', (el) => {
    const pn = el as PageNumberElement
    return formatPageNumber(pn.format, pn.customFormat, pageIndex, totalPages)
  })
  resolve('currentDate', (el) => {
    const cd = el as CurrentDateElement
    return formatCurrentDate(cd.format, cd.customFormat)
  })

  return snapshots
}

/** Build an id→element lookup of the pageNumber/currentDate elements across pages. */
export function collectAutoFieldModels(definition: ReportDefinition): AutoFieldModels {
  const map: AutoFieldModels = new Map()
  for (const page of definition.pages) {
    for (const section of page.sections) {
      for (const el of section.elements) {
        if (el.type === 'pageNumber' || el.type === 'currentDate') map.set(el.id, el)
      }
    }
  }
  return map
}

function restoreAutoFields(snapshots: AutoFieldSnapshot[]): void {
  for (const s of snapshots) {
    s.node.textContent = s.original
  }
}


/** Web フォント（Noto Sans/Serif JP、#317）のロード完了を待ってからキャプチャする */
async function waitForFonts(): Promise<void> {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await document.fonts.ready
    } catch {
      // フォントロード失敗時もエクスポート自体は続行（fallback フォントで描画）
    }
  }
}

export async function exportPageToPng(
  canvasEl: HTMLElement,
  fileName = 'report.png',
  pageIndex = 1,
  totalPages = 1,
  models?: AutoFieldModels,
): Promise<void> {
  await waitForFonts()
  const snapshots = resolveAutoFields(canvasEl, models, pageIndex, totalPages)
  try {
    const canvas = await html2canvas(canvasEl, { useCORS: true, scale: EXPORT_SCALE })
    const link = document.createElement('a')
    link.download = fileName
    link.href = canvas.toDataURL('image/png')
    link.click()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`PNG export failed: ${message}`, { cause: err })
  } finally {
    restoreAutoFields(snapshots)
  }
}

export async function exportReportToPdf(
  pageEls: HTMLElement[],
  fileName = 'report.pdf',
  models?: AutoFieldModels,
): Promise<void> {
  const blob = await exportReportToPdfBlob(pageEls, models)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Same as exportReportToPdf but returns a Blob instead of triggering a download.
 * Useful for opening the PDF in a new browser tab.
 *
 * Pages are rendered sequentially (not with Promise.all) to avoid allocating
 * O(n × pageSize) canvas memory simultaneously. For a 20-page A4 report at
 * scale=2 that would be ~280 MB; sequential rendering keeps peak usage at
 * ~14 MB (one page at a time) at the cost of slightly longer wall-clock time.
 */
export async function exportReportToPdfBlob(
  pageEls: HTMLElement[],
  models?: AutoFieldModels,
): Promise<Blob> {
  if (pageEls.length === 0) throw new Error('No pages to export')

  await waitForFonts()
  const totalPages = pageEls.length
  const allSnapshots = pageEls.map((el, i) => resolveAutoFields(el, models, i + 1, totalPages))
  try {
    // Render first page to size the initial PDF page
    const firstCanvas = await html2canvas(pageEls[0], { useCORS: true, scale: EXPORT_SCALE })
    const firstW = firstCanvas.width / EXPORT_SCALE
    const firstH = firstCanvas.height / EXPORT_SCALE

    const pdf = new jsPDF({
      orientation: firstW > firstH ? 'landscape' : 'portrait',
      unit: 'px',
      format: [firstW, firstH],
    })

    // Process pages one at a time; each PDF page takes its own source page's
    // dimensions so mixed A4/A3 or portrait/landscape reports stay faithful
    // (previously every page was forced to page 0's geometry — issue #61).
    for (let i = 0; i < pageEls.length; i++) {
      const canvas = i === 0
        ? firstCanvas
        : await html2canvas(pageEls[i], { useCORS: true, scale: EXPORT_SCALE })
      const pageW = canvas.width / EXPORT_SCALE
      const pageH = canvas.height / EXPORT_SCALE
      if (i > 0) {
        pdf.addPage([pageW, pageH], pageW > pageH ? 'landscape' : 'portrait')
      }
      const imgData = canvas.toDataURL('image/png')
      pdf.addImage(imgData, 'PNG', 0, 0, pageW, pageH)
      // Release GPU memory immediately after the page is added to the PDF
      canvas.width = 0
      canvas.height = 0
    }

    return pdf.output('blob')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`PDF export failed: ${message}`, { cause: err })
  } finally {
    for (const snapshots of allSnapshots) restoreAutoFields(snapshots)
  }
}

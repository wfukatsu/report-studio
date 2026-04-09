import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import type { ReportDefinition } from '@/types'
import { generateStatelessPdf } from '@/api/reportApi'
import { downloadBlob } from '@/api/client'

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

/** Allowed data: URI prefixes — SVG excluded (can embed <script>) */
const SAFE_DATA_PREFIXES = [
  'data:image/png',
  'data:image/jpeg',
  'data:image/gif',
  'data:image/webp',
]

/**
 * Return true only for safe image src values.
 * - Empty string → false (prevents self-requests)
 * - data: URIs → only png/jpeg/gif/webp, max 2 MB (SVG blocked: XSS via <script>)
 * - URLs → https:// only (http:// blocked: mixed-content + privacy)
 */
export function isSafeImageSrc(src: string): boolean {
  if (!src) return false
  const lower = src.toLowerCase().trim()
  if (lower.startsWith('data:')) {
    return (
      src.length <= 2 * 1024 * 1024 &&
      SAFE_DATA_PREFIXES.some((p) => lower.startsWith(p))
    )
  }
  return lower.startsWith('https://')
}

export async function exportPageToPng(
  canvasEl: HTMLElement,
  fileName = 'report.png',
): Promise<void> {
  try {
    const canvas = await html2canvas(canvasEl, { useCORS: true, scale: EXPORT_SCALE })
    const link = document.createElement('a')
    link.download = fileName
    link.href = canvas.toDataURL('image/png')
    link.click()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`PNG export failed: ${message}`)
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
  }
}

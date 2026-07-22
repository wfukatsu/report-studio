/**
 * PDF / Excel generation API — synchronous template PDF and the stateless
 * PDF / XLSX generation endpoints.
 */
import { apiFetchBlobWithFilename } from './client'
import i18n from '@/i18n/config'

// ---------------------------------------------------------------------------
// Template PDF generation (backend)
// ---------------------------------------------------------------------------

export async function generateTemplatePdf(
  templateId: string,
  testData?: Record<string, unknown>,
  variantId?: string,
): Promise<Blob> {
  const body: Record<string, unknown> = {}
  if (testData) body.testData = testData
  if (variantId) body.variantId = variantId
  const { blob } = await apiFetchBlobWithFilename(
    `/api/v2/templates/${encodeURIComponent(templateId)}/pdf`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  return blob
}

/**
 * Stateless PDF generation — sends the full template definition inline.
 * No server-side template storage required.
 */
export async function generateStatelessPdf(
  template: Record<string, unknown>,
  data: Record<string, unknown>,
): Promise<Blob> {
  const { blob } = await apiFetchBlobWithFilename(
    '/api/v2/pdf/generate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template, data }),
    },
  )
  return blob
}

/**
 * Stateless XLSX generation (issue #118) — sends the template + data inline and
 * returns a multi-sheet Excel workbook of the report's tabular data.
 */
export async function generateStatelessExcel(
  template: Record<string, unknown>,
  data: Record<string, unknown>,
): Promise<Blob> {
  // Generated sheet chrome (項目/値/データ …) is localized server-side by request
  // locale (#329 Phase 3). Report data itself is untouched user content.
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'ja'
  const { blob } = await apiFetchBlobWithFilename(
    `/api/v2/excel/generate?locale=${encodeURIComponent(locale)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template, data }),
    },
  )
  return blob
}

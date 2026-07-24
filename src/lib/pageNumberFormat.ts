import type { PageNumberFormat } from '@/types'

/**
 * Format page number string from template.
 * {{page}} → current page, {{pages}} → total pages.
 */
export function formatPageNumber(
  format: PageNumberFormat,
  customFormat: string | undefined,
  page: number,
  pages: number,
): string {
  const template = format === 'custom' ? (customFormat ?? '{{page}}') : format
  return template
    .replace(/\{\{page\}\}/g, String(page))
    .replace(/\{\{pages\}\}/g, String(pages))
}

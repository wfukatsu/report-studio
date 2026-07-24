/**
 * summaryFormat — renders the structured response summary (#412).
 *
 * The server sends both shapes: the legacy `summary` lines (ja wording, arrays as
 * "N件") and the structured `summaryItems` (`{key, text}` for scalar leaves,
 * `{key, count}` for arrays). When the structured shape is present the array
 * count is rendered through i18n; otherwise the legacy lines are shown as-is
 * (raw-display fallback). Takes the caller's `t` (bound to `serverErrors`) so
 * the helper stays a pure function.
 */
import type { TFunction } from 'i18next'

export interface SummaryItem {
  key: string
  text?: string
  count?: number
}

export function formatSummaryLines(
  summary: string[],
  summaryItems: SummaryItem[] | undefined,
  t: TFunction<'serverErrors'>,
): string[] {
  if (!summaryItems) return summary
  return summaryItems.map((item) =>
    item.count !== undefined
      ? `${item.key}: ${t('summary.arrayCount', { n: item.count })}`
      : `${item.key}: ${item.text ?? ''}`,
  )
}

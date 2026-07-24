import { describe, it, expect } from 'vitest'
import { formatSummaryLines } from './summaryFormat'
import i18n from '@/i18n/config'

const tJa = i18n.getFixedT('ja', 'serverErrors')
const tEn = i18n.getFixedT('en', 'serverErrors')

describe('formatSummaryLines', () => {
  it('falls back to the legacy server lines when summaryItems is absent', () => {
    expect(formatSummaryLines(['customer.name: 評価商事', 'items: 3件'], undefined, tJa))
      .toEqual(['customer.name: 評価商事', 'items: 3件'])
  })

  it('renders structured items — ja matches the legacy server wording', () => {
    const items = [
      { key: 'customer.name', text: '評価商事' },
      { key: 'items', count: 3 },
    ]
    expect(formatSummaryLines([], items, tJa)).toEqual(['customer.name: 評価商事', 'items: 3件'])
  })

  it('renders array counts in the active locale (en)', () => {
    expect(formatSummaryLines([], [{ key: 'items', count: 3 }], tEn)).toEqual(['items: 3 items'])
  })

  it('renders a missing text as an empty value', () => {
    expect(formatSummaryLines([], [{ key: 'note' }], tJa)).toEqual(['note: '])
  })
})

import { describe, it, expect } from 'vitest'
import { filterTemplates, collectCategories, collectTags } from './templateFilter'

const TEMPLATES = [
  { name: '扶養控除等申告書', description: '税務申告書', category: '税務', tags: ['A4'] },
  { name: '見積書', description: 'インボイス対応', category: '請求・見積', tags: ['A4'] },
  { name: '見積書（英語）', description: 'English quotation', category: '請求・見積', tags: ['A4', '英語'] },
  { name: '白紙', description: '空のキャンバス' },
]

describe('filterTemplates', () => {
  it('returns all when no criteria', () => {
    expect(filterTemplates(TEMPLATES, {})).toHaveLength(4)
  })

  it('filters by text query (name)', () => {
    expect(filterTemplates(TEMPLATES, { query: '見積' })).toHaveLength(2)
  })

  it('filters by text query (description)', () => {
    expect(filterTemplates(TEMPLATES, { query: 'english' })).toHaveLength(1)
  })

  it('filters by text query case-insensitive', () => {
    expect(filterTemplates(TEMPLATES, { query: 'ENGLISH' })).toHaveLength(1)
  })

  it('filters by category', () => {
    expect(filterTemplates(TEMPLATES, { category: '税務' })).toHaveLength(1)
    expect(filterTemplates(TEMPLATES, { category: '請求・見積' })).toHaveLength(2)
  })

  it('filters by single tag', () => {
    expect(filterTemplates(TEMPLATES, { tags: ['A4'] })).toHaveLength(3)
  })

  it('filters by multiple tags (AND)', () => {
    expect(filterTemplates(TEMPLATES, { tags: ['A4', '英語'] })).toHaveLength(1)
  })

  it('combines query + category + tags', () => {
    expect(filterTemplates(TEMPLATES, { query: '見積', category: '請求・見積', tags: ['英語'] })).toHaveLength(1)
  })

  it('returns empty when no match', () => {
    expect(filterTemplates(TEMPLATES, { query: 'xyz' })).toHaveLength(0)
  })

  it('handles templates without category/tags', () => {
    expect(filterTemplates(TEMPLATES, { category: '税務' })).toEqual([TEMPLATES[0]])
  })
})

describe('collectCategories', () => {
  it('collects unique categories', () => {
    const cats = collectCategories(TEMPLATES)
    expect(cats).toContain('税務')
    expect(cats).toContain('請求・見積')
    expect(cats).toHaveLength(2)
  })
})

describe('collectTags', () => {
  it('collects unique tags', () => {
    const tags = collectTags(TEMPLATES)
    expect(tags).toContain('A4')
    expect(tags).toContain('英語')
    expect(tags).toHaveLength(2)
  })
})

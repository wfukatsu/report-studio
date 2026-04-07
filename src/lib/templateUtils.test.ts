import { describe, it, expect } from 'vitest'
import { applyTemplate, createBlankDefinition, loadBuiltinTemplate } from './templateUtils'
import { BUILTIN_TEMPLATES } from '@/templates/builtinTemplates'
import type { Template } from '@/types'

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: 'test-tmpl',
    name: 'Test Template',
    description: 'A test template',
    pages: [
      {
        id: 'p1',
        name: 'Page 1',
        background: '#ffffff',
        width: 210,
        height: 297,
        sections: [],
      },
    ],
    settings: {},
    ...overrides,
  }
}

describe('applyTemplate', () => {
  it('ReportDefinition を返す', () => {
    const def = applyTemplate(makeTemplate())
    expect(def).toBeDefined()
    expect(def.pages).toBeDefined()
  })

  it('各ページに新しい id が付与される', () => {
    const template = makeTemplate()
    const def = applyTemplate(template)
    expect(def.pages[0].id).not.toBe('p1')
  })

  it('ページ数がテンプレートと一致する', () => {
    const template = makeTemplate({
      pages: [
        { id: 'p1', name: 'P1', background: '#fff', width: 210, height: 297, sections: [] },
        { id: 'p2', name: 'P2', background: '#fff', width: 210, height: 297, sections: [] },
      ],
    })
    const def = applyTemplate(template)
    expect(def.pages).toHaveLength(2)
  })
})

describe('createBlankDefinition', () => {
  it('ReportDefinition を返す', () => {
    const def = createBlankDefinition()
    expect(def).toBeDefined()
    expect(def.pages).toHaveLength(1)
  })

  it('呼び出すたびに異なる id を持つ', () => {
    const d1 = createBlankDefinition()
    const d2 = createBlankDefinition()
    expect(d1.id).not.toBe(d2.id)
  })
})

describe('loadBuiltinTemplate', () => {
  it('存在しない id は null を返す', () => {
    expect(loadBuiltinTemplate('nonexistent-id')).toBeNull()
  })

  it('組み込みテンプレートが存在する場合は ReportDefinition を返す', () => {
    if (BUILTIN_TEMPLATES.length === 0) return
    const first = BUILTIN_TEMPLATES[0]
    const def = loadBuiltinTemplate(first.id)
    expect(def).not.toBeNull()
    expect(def!.pages).toBeDefined()
  })
})

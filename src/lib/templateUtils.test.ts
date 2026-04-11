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

describe('applyTemplate — sourceTemplateId + deep clone', () => {
  it('stamps sourceTemplateId in metadata', () => {
    const template = makeTemplate({ id: 'my-template' })
    const def = applyTemplate(template)
    expect(def.metadata.sourceTemplateId).toBe('my-template')
  })

  it('deep-clones pages so BUILTIN_TEMPLATES is not mutated', () => {
    if (BUILTIN_TEMPLATES.length === 0) return
    const original = BUILTIN_TEMPLATES[0]
    const originalPageId = original.pages[0].id

    const def = applyTemplate(original)

    // New IDs assigned — they must differ from the originals
    expect(def.pages[0].id).not.toBe(originalPageId)
    // Original template must be untouched
    expect(original.pages[0].id).toBe(originalPageId)
  })

  it('applying the same template twice produces independent page objects', () => {
    const template = makeTemplate({
      pages: [
        { id: 'original-p1', name: 'Page', background: '#fff', width: 210, height: 297, sections: [] },
      ],
    })
    const def1 = applyTemplate(template)
    const def2 = applyTemplate(template)

    // Both get new IDs
    expect(def1.pages[0].id).not.toBe('original-p1')
    expect(def2.pages[0].id).not.toBe('original-p1')
    // But they get DIFFERENT new IDs (independent clones)
    expect(def1.pages[0].id).not.toBe(def2.pages[0].id)
    // Original untouched
    expect(template.pages[0].id).toBe('original-p1')
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

  it('stamps sourceTemplateId from the built-in template', () => {
    if (BUILTIN_TEMPLATES.length === 0) return
    const first = BUILTIN_TEMPLATES[0]
    const def = loadBuiltinTemplate(first.id)
    expect(def!.metadata.sourceTemplateId).toBe(first.id)
  })
})

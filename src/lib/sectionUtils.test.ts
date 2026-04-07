import { describe, it, expect } from 'vitest'
import { cloneSectionForPage, createDefaultSection } from './sectionUtils'
import type { Section } from '@/types'

function makeSection(overrides: Partial<Section> = {}): Section {
  return {
    id: 'sec-1',
    sectionType: 'body',
    height: 200,
    elements: [],
    ...overrides,
  }
}

describe('cloneSectionForPage', () => {
  it('元のセクションとは異なる id を持つ', () => {
    const original = makeSection({ id: 'sec-1' })
    const cloned = cloneSectionForPage(original)
    expect(cloned.id).not.toBe('sec-1')
  })

  it('各要素に新しい id が付与される', () => {
    const original = makeSection({
      elements: [
        { id: 'e1', type: 'text' } as never,
        { id: 'e2', type: 'label' } as never,
      ],
    })
    const cloned = cloneSectionForPage(original)
    expect(cloned.elements[0].id).not.toBe('e1')
    expect(cloned.elements[1].id).not.toBe('e2')
    expect(cloned.elements[0].id).not.toBe(cloned.elements[1].id)
  })

  it('元のセクションのデータを変更しない', () => {
    const original = makeSection({ id: 'sec-1', height: 150 })
    cloneSectionForPage(original)
    expect(original.id).toBe('sec-1')
    expect(original.height).toBe(150)
  })

  it('sectionType と height がコピーされる', () => {
    const original = makeSection({ sectionType: 'header', height: 30 })
    const cloned = cloneSectionForPage(original)
    expect(cloned.sectionType).toBe('header')
    expect(cloned.height).toBe(30)
  })
})

describe('createDefaultSection', () => {
  it('指定した type のセクションを作成する', () => {
    const sec = createDefaultSection('footer')
    expect(sec.sectionType).toBe('footer')
  })

  it('デフォルトの height は 0', () => {
    const sec = createDefaultSection('body')
    expect(sec.height).toBe(0)
  })

  it('height を指定できる', () => {
    const sec = createDefaultSection('header', 25)
    expect(sec.height).toBe(25)
  })

  it('elements は空配列', () => {
    const sec = createDefaultSection('body')
    expect(sec.elements).toEqual([])
  })

  it('ユニークな id が付与される', () => {
    const s1 = createDefaultSection('body')
    const s2 = createDefaultSection('body')
    expect(s1.id).not.toBe(s2.id)
  })
})

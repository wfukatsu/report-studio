import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { TemplateThumbnail } from './TemplateThumbnail'
import type { ReportDefinition, ReportElement } from '@/types'

function makeElement(over: Partial<ReportElement> & { id: string; type: ReportElement['type'] }): ReportElement {
  return {
    position: { x: 10, y: 10 },
    size: { width: 50, height: 10 },
    zIndex: 0,
    visible: true,
    locked: false,
    ...over,
  } as ReportElement
}

function makeDefinition(elements: ReportElement[], pageOver?: { width?: number; height?: number }): ReportDefinition {
  return {
    formatVersion: 2,
    metadata: { documentName: 'test' },
    pageSettings: { paperSize: 'A4', orientation: 'portrait', margins: { top: 0, right: 0, bottom: 0, left: 0 } },
    pages: [
      {
        id: 'p1',
        name: 'ページ1',
        background: '#ffffff',
        width: pageOver?.width ?? 210,
        height: pageOver?.height ?? 297,
        sections: [
          { id: 's1', sectionType: 'body', height: pageOver?.height ?? 297, elements },
        ],
      },
    ],
  } as unknown as ReportDefinition
}

describe('TemplateThumbnail', () => {
  it('renders one wireframe box per visible element', () => {
    const def = makeDefinition([
      makeElement({ id: 'a', type: 'text' }),
      makeElement({ id: 'b', type: 'formTable' }),
    ])
    const { container } = render(<TemplateThumbnail definition={def} />)
    // Outer wrapper + 2 placed elements (each placed element is a positioned div)
    const positioned = container.querySelectorAll('div[style*="position: absolute"]')
    expect(positioned.length).toBe(2)
  })

  it('skips elements marked not visible', () => {
    const def = makeDefinition([
      makeElement({ id: 'a', type: 'text' }),
      makeElement({ id: 'b', type: 'text', visible: false }),
    ])
    const { container } = render(<TemplateThumbnail definition={def} />)
    const positioned = container.querySelectorAll('div[style*="position: absolute"]')
    expect(positioned.length).toBe(1)
  })

  it('positions elements by percentage of page dimensions', () => {
    // x=105 of 210 → 50% left; y=148.5 of 297 → 50% top
    const def = makeDefinition([
      makeElement({ id: 'a', type: 'text', position: { x: 105, y: 148.5 }, size: { width: 21, height: 29.7 } }),
    ])
    const { container } = render(<TemplateThumbnail definition={def} />)
    const el = container.querySelector('div[style*="position: absolute"]') as HTMLElement
    expect(el.style.left).toBe('50%')
    expect(el.style.top).toBe('50%')
  })

  it('renders nothing for an empty definition without throwing', () => {
    const def = makeDefinition([])
    const { container } = render(<TemplateThumbnail definition={def} />)
    expect(container.querySelectorAll('div[style*="position: absolute"]').length).toBe(0)
  })
})

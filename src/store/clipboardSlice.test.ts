import { describe, it, expect, beforeEach } from 'vitest'
import { useReportStore } from '@/store'
import type { ReportDefinition, ReportElement } from '@/types'

const getStore = () => useReportStore.getState()

function textEl(id: string, x: number, y: number): ReportElement {
  return {
    id,
    type: 'text',
    position: { x, y },
    size: { width: 40, height: 10 },
    zIndex: 1,
    locked: false,
    visible: true,
    content: id,
    style: {},
  } as ReportElement
}

/** A page with a header section (holding `hdr-1`) and a body section (holding `body-1`). */
function definitionWithHeaderAndBody(): ReportDefinition {
  return {
    id: 'def-1',
    metadata: { documentName: 't', version: '1.0', reportType: 'general' },
    pageSettings: { paperSize: 'A4', orientation: 'portrait', margins: { top: 20, right: 20, bottom: 20, left: 20 }, unit: 'mm' },
    defaultTextStyle: {},
    templateVariables: [],
    calculationRules: [],
    dataSources: [],
    outputVariants: [],
    submissionModels: [],
    validationRules: [],
    pages: [{
      id: 'page-1',
      name: 'ページ 1',
      background: '#ffffff',
      width: 210,
      height: 297,
      sections: [
        { id: 'sec-header', sectionType: 'header', height: 30, elements: [textEl('hdr-1', 5, 5)] },
        { id: 'sec-body', sectionType: 'body', height: 237, elements: [textEl('body-1', 5, 5)] },
      ],
    }],
  } as ReportDefinition
}

function sectionOf(elementId: string): string | undefined {
  const page = getStore().definition.pages[0]
  for (const section of page.sections) {
    if (section.elements.some((e) => e.id === elementId)) return section.sectionType
  }
  return undefined
}

describe('clipboardSlice cross-section paste (#217)', () => {
  beforeEach(() => {
    getStore().loadReport(definitionWithHeaderAndBody())
  })

  it('pastes a header element back into the header section, not the body', () => {
    getStore().copyElements('page-1', ['hdr-1'])
    getStore().pasteElements('page-1')

    const newIds = getStore().selection.selectedElementIds
    expect(newIds).toHaveLength(1)
    expect(sectionOf(newIds[0])).toBe('header') // previously always landed in body
  })

  it('pastes a body element into the body section', () => {
    getStore().copyElements('page-1', ['body-1'])
    getStore().pasteElements('page-1')

    const newIds = getStore().selection.selectedElementIds
    expect(sectionOf(newIds[0])).toBe('body')
  })

  it('multi-section copy restores each element to its own section type', () => {
    getStore().copyElements('page-1', ['hdr-1', 'body-1'])
    getStore().pasteElements('page-1')

    const newIds = getStore().selection.selectedElementIds
    expect(newIds).toHaveLength(2)
    const sections = newIds.map(sectionOf).sort()
    expect(sections).toEqual(['body', 'header'])
  })
})

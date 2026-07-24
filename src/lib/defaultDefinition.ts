/**
 * #436: factory helpers for a blank ReportDefinition — extracted from
 * layoutSlice so lib modules (templateUtils) no longer import store internals.
 * layoutSlice re-exports these for existing consumers.
 */
import { v4 as uuidv4 } from 'uuid'
import i18n from '@/i18n/config'
import type { PageDef, ReportDefinition, ReportElement, Section } from '@/types'
import { getPageDimensions } from '@/lib/paperSizes'

export function createDefaultSection(elements: ReportElement[] = [], height?: number): Section {
  return {
    id: uuidv4(),
    sectionType: 'body',
    height: height ?? 0,
    elements,
  }
}

export function createDefaultPageDef(name?: string): PageDef {
  // #411: persisted default names follow the UI language at creation time.
  const pageName = name ?? i18n.t('core:defaults.pageName', { n: 1 })
  const dims = getPageDimensions('A4', 'portrait')
  const section = createDefaultSection([], dims.height)
  return {
    id: uuidv4(),
    name: pageName,
    background: '#ffffff',
    width: dims.width,
    height: dims.height,
    sections: [section],
  }
}

export function createDefaultDefinition(): ReportDefinition {
  return {
    id: uuidv4(),
    metadata: {
      documentName: i18n.t('core:defaults.documentName'),
      version: '1.0',
      reportType: 'general',
    },
    pageSettings: {
      paperSize: 'A4',
      orientation: 'portrait',
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
      unit: 'mm',
    },
    defaultTextStyle: {},
    templateVariables: [],
    calculationRules: [],
    dataSources: [],
    outputVariants: [],
    submissionModels: [],
    validationRules: [],
    pages: [createDefaultPageDef()],
  }
}

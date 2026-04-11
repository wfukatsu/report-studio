import { v4 as uuidv4 } from 'uuid'
import { migrateReport } from '@/lib/migration'
import { createDefaultDefinition } from '@/store/layoutSlice'
import { BUILTIN_TEMPLATES } from '@/templates/builtinTemplates'
import type { Template, Report, ReportDefinition } from '@/types'

/**
 * Convert a Template into a ReportDefinition by constructing a legacy Report
 * and running it through the migration pipeline.
 */
export function applyTemplate(template: Template): ReportDefinition {
  // Deep-clone pages before assigning new IDs so that sections/elements do not
  // share reference identity with the static BUILTIN_TEMPLATES object. Without
  // this, immer mutations in the store would silently mutate the shared static
  // reference, causing artifacts if the same built-in template is loaded twice.
  const clonedPages = JSON.parse(JSON.stringify(template.pages)) as typeof template.pages
  const legacyReport: Report = {
    id: uuidv4(),
    name: template.name,
    pages: clonedPages.map((p) => ({ ...p, id: uuidv4() })),
    settings: template.settings,
    dataSource: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const definition = migrateReport(legacyReport)
  return {
    ...definition,
    metadata: {
      ...definition.metadata,
      sourceTemplateId: template.id,
    },
    ...(template.schema ? { schema: template.schema } : {}),
    ...(template.dataSources ? { dataSources: template.dataSources } : {}),
  }
}

/**
 * Return a blank ReportDefinition (equivalent to "空白" template selection).
 */
export function createBlankDefinition(): ReportDefinition {
  return createDefaultDefinition()
}

/**
 * Load a built-in template by ID and return its ReportDefinition.
 * Returns null if no template with the given ID exists.
 */
export function loadBuiltinTemplate(id: string): ReportDefinition | null {
  const template = BUILTIN_TEMPLATES.find((t) => t.id === id)
  return template ? applyTemplate(template) : null
}

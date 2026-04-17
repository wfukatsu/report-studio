import { v4 as uuidv4 } from 'uuid'
import { migrateReport } from '@/lib/migration'
import { createDefaultDefinition } from '@/store/layoutSlice'
import { BUILTIN_TEMPLATES } from '@/templates/builtinTemplates'
import type { Template, Report, ReportDefinition } from '@/types'

/**
 * Convert a legacy Template into a ReportDefinition by constructing a legacy
 * Report and running it through the migration pipeline.
 *
 * NOTE: This is retained for server-imported templates that still use the
 * legacy Template format. For builtin templates, use loadBuiltinTemplate()
 * which reads pre-converted ReportDefinition directly from JSON.
 */
export function applyTemplate(template: Template): ReportDefinition {
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
 * Load a built-in template by ID and return a deep-cloned ReportDefinition.
 *
 * Since builtin templates are now loaded from pre-converted JSON files,
 * this function returns a deep clone of the stored definition directly
 * without going through the applyTemplate/migrateReport pipeline.
 */
export function loadBuiltinTemplate(id: string): ReportDefinition | null {
  const entry = BUILTIN_TEMPLATES.find((t) => t.id === id)
  if (!entry) return null
  // Deep clone to prevent shared reference mutations via immer
  return JSON.parse(JSON.stringify(entry.definition)) as ReportDefinition
}

import { v4 as uuidv4 } from 'uuid'
import { migrateReport } from '@/lib/migration'
import { createDefaultDefinition } from '@/lib/defaultDefinition'
import type { Template, Report, ReportDefinition } from '@/types'

/**
 * Convert a legacy Template into a ReportDefinition by constructing a legacy
 * Report and running it through the migration pipeline.
 *
 * NOTE: This is retained for server-imported templates that still use the
 * legacy Template format.
 */
export function applyTemplate(template: Template): ReportDefinition {
  // Deep-clone pages before assigning new IDs so that sections/elements do not
  // share reference identity with the caller's template object.
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

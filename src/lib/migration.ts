/**
 * Migration utilities for converting old Report JSON format to ReportDefinition.
 *
 * UNIT_CONVERSION: converts various unit strings to mm (the canonical unit).
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  Report,
  ReportDefinition,
  PageDef,
  Section,
  ReportElement,
  DataSourceDefinition,
} from '@/types'
import { SCHEMA_VERSION } from './exportUtils'
import { ReportDefinitionSchema } from './schemas/reportDefinition'

// ---------------------------------------------------------------------------
// Unit conversion helpers
// ---------------------------------------------------------------------------

const UNIT_CONVERSION: Record<string, number> = {
  mm: 1,
  px: 25.4 / 96, // 1px at 96dpi = 25.4/96 mm
  in: 25.4,
}

function toMm(value: number, unit: string): number {
  const factor = UNIT_CONVERSION[unit] ?? 1
  return value * factor
}

// ---------------------------------------------------------------------------
// Section migration
// ---------------------------------------------------------------------------

function migrateSections(page: Report['pages'][number]): Section[] {
  // If the page already has sections, return them (preserve existing structure)
  if (page.sections && page.sections.length > 0) {
    return page.sections as Section[]
  }
  // Fall back: wrap flat elements in a body section
  return [
    {
      id: uuidv4(),
      sectionType: 'body',
      height: page.height,
      elements: (page.elements ?? []) as ReportElement[],
    },
  ]
}

// ---------------------------------------------------------------------------
// Page migration
// ---------------------------------------------------------------------------

function migratePage(page: Report['pages'][number]): PageDef {
  return {
    id: page.id,
    name: page.name,
    width: page.width,
    height: page.height,
    background: page.background,
    sections: migrateSections(page),
  }
}

// ---------------------------------------------------------------------------
// DataSource migration
// ---------------------------------------------------------------------------

function migrateDataSource(
  dataSource: Report['dataSource'],
): DataSourceDefinition[] {
  if (!dataSource) return []
  return [
    {
      id: dataSource.id,
      name: dataSource.name,
      fields: dataSource.fields,
    },
  ]
}

// ---------------------------------------------------------------------------
// Main migration entry point
// ---------------------------------------------------------------------------

/**
 * Convert a legacy Report object to the new ReportDefinition format.
 *
 * Handles:
 * - `Report.name` → `metadata.documentName`
 * - `Report.dataSource` (single) → `dataSources[]` (array)
 * - `Report.settings.margin` → `pageSettings.margins`
 * - `Report.settings.unit` → unit conversion applied to page dimensions
 * - `Page.elements[]` → `sections[body].elements`
 * - `createdAt`/`updatedAt` → `metadata.description` (archived)
 */
export function migrateReport(report: Report): ReportDefinition {
  const unit = report.settings?.unit ?? 'mm'

  // Resolve margins (handle both `margin` and `margins` field names)
  const rawMargin = (report.settings as { margin?: Report['settings']['margin'] })?.margin
  const topMargin = rawMargin?.top ?? 20
  const rightMargin = rawMargin?.right ?? 20
  const bottomMargin = rawMargin?.bottom ?? 20
  const leftMargin = rawMargin?.left ?? 20

  const margins = {
    top: toMm(topMargin, unit),
    right: toMm(rightMargin, unit),
    bottom: toMm(bottomMargin, unit),
    left: toMm(leftMargin, unit),
  }

  // Build description from timestamps if available
  const createdAt = (report as { createdAt?: string }).createdAt
  const updatedAt = (report as { updatedAt?: string }).updatedAt
  const descParts: string[] = []
  if (createdAt) descParts.push(`Created: ${createdAt}`)
  if (updatedAt) descParts.push(`Updated: ${updatedAt}`)
  const description = descParts.length > 0 ? descParts.join(' | ') : undefined

  return {
    id: report.id,
    metadata: {
      documentName: report.name,
      version: '1.0',
      reportType: 'general',
      description,
    },
    pageSettings: {
      paperSize: report.settings?.paperSize ?? 'A4',
      orientation: report.settings?.orientation ?? 'portrait',
      margins,
      unit: 'mm',
    },
    defaultTextStyle: {},
    templateVariables: [],
    calculationRules: [],
    dataSources: migrateDataSource(report.dataSource),
    outputVariants: [],
    submissionModels: [],
    validationRules: [],
    pages: report.pages.map(migratePage),
  }
}

// ---------------------------------------------------------------------------
// JSON import helper
// ---------------------------------------------------------------------------

// SCHEMA_VERSION is imported from ./exportUtils (single source of truth)

/**
 * Defensively migrate pages that have no sections (wrap elements in a body section).
 * Returns a new array of pages with sections guaranteed.
 */
function ensurePageSections(definition: ReportDefinition): ReportDefinition {
  const needsMigration = definition.pages.some(
    (page) => !page.sections || page.sections.length === 0,
  )
  if (!needsMigration) return definition

  return {
    ...definition,
    pages: definition.pages.map((page) => {
      if (page.sections && page.sections.length > 0) return page
      return {
        ...page,
        sections: [
          {
            id: uuidv4(),
            sectionType: 'body' as const,
            height: page.height,
            elements: [],
          },
        ],
      }
    }),
  }
}

/**
 * Parse raw JSON text and return a ReportDefinition.
 * Handles both the new `$schema: "report-definition/v1"` format and the
 * legacy Report format (auto-migrated).
 *
 * Returns `{ ok: true, definition }` on success or `{ ok: false, error }` on failure.
 */
export function importFromJSON(
  json: string,
): { ok: true; definition: ReportDefinition } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `JSON parse error: ${message}` }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'Invalid JSON: expected an object' }
  }

  const obj = parsed as Record<string, unknown>

  // New ReportDefinition format — validate with Zod schema
  if (obj['$schema'] === SCHEMA_VERSION) {
    const result = ReportDefinitionSchema.safeParse(obj)
    if (!result.success) {
      const first = result.error.issues[0]
      const path = first?.path.join('.') ?? ''
      const msg = first?.message ?? 'unknown'
      return {
        ok: false,
        error: `Invalid report-definition/v1: 必須フィールドが不正または不足しています (${path}: ${msg})`,
      }
    }
    const definition = ensurePageSections(result.data as unknown as ReportDefinition)
    return { ok: true, definition }
  }

  // Reject any other $schema version — do not attempt auto-migration for unknown schemas
  if (typeof obj['$schema'] === 'string' && obj['$schema'] !== '') {
    return { ok: false, error: `非対応スキーマ: ${obj['$schema']}` }
  }

  // Legacy Report format (no $schema) — auto-migrate
  if (!obj['id'] || !obj['pages'] || !Array.isArray(obj['pages'])) {
    return { ok: false, error: 'Invalid report JSON: missing required fields (id, pages)' }
  }
  const definition = migrateReport(obj as unknown as Report)
  return { ok: true, definition }
}

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
import { SCHEMA_VERSION, FORMAT_VERSION } from './exportUtils'
import { ReportDefinitionSchema } from './schemas/reportDefinition'
import { sanitizeJSON } from './sanitize'

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
 * Migrate `label` elements to `text` elements at document-load time.
 *
 * **Why this is needed (not just a runtime shim in ElementRenderer):**
 * `variantApplicator.ts` writes OutputVariant masking rules to the `content`
 * field (the `TextElement` field), but legacy `LabelElement` stores text in
 * the `text` field. If the runtime shim in `ElementRenderer` is the only
 * migration path, masked label elements silently drop their masking rule on
 * PDF export because `variantApplicator` reads the wrong field name.
 *
 * Converting at load time (here) means the store always holds `TextElement`
 * objects and downstream code never needs to special-case `label`.
 */
function migrateLabelToText(definition: ReportDefinition): ReportDefinition {
  // Use unknown cast since 'label' is no longer in the ElementType union (migration removes it)
  type AnyElement = { type: string; [key: string]: unknown }
  const rawPages = definition.pages as unknown as Array<{ sections: Array<{ elements: AnyElement[] }> }>
  const hasLabel = rawPages.some((page) =>
    page.sections.some((sec) =>
      sec.elements.some((el) => el.type === 'label'),
    ),
  )
  if (!hasLabel) return definition

  return {
    ...definition,
    pages: definition.pages.map((page) => ({
      ...page,
      sections: page.sections.map((sec) => ({
        ...sec,
        elements: (sec.elements as unknown as AnyElement[]).map((el) => {
          if (el.type !== 'label') return el
          // `LabelElement` stores text in `text`; `TextElement` uses `content`.
          const { text: labelText, type: _type, ...rest } = el
          return { ...rest, type: 'text' as const, content: (labelText as string | undefined) ?? '' }
        }),
      })),
    })),
  } as unknown as ReportDefinition
}

/**
 * Remove legacy visibilityRule from all elements.
 * visibilityRule was never evaluated client-side; conditionalDisplay is the replacement.
 * Old templates simply lose the field (no conversion — it was dead code).
 */
function stripVisibilityRule(definition: ReportDefinition): ReportDefinition {
  const hasAny = definition.pages.some((page) =>
    page.sections.some((sec) =>
      sec.elements.some((el) => 'visibilityRule' in el),
    ),
  )
  if (!hasAny) return definition

  return {
    ...definition,
    pages: definition.pages.map((page) => ({
      ...page,
      sections: page.sections.map((sec) => ({
        ...sec,
        elements: sec.elements.map((el) => {
          if (!('visibilityRule' in el)) return el
          const { visibilityRule: _removed, ...rest } = el as ReportElement & { visibilityRule?: unknown }
          return rest
        }),
      })),
    })),
  }
}

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
    return { ok: false, error: `JSONの解析に失敗しました: ${message}` }
  }

  // Sanitize: strip prototype pollution keys + enforce structural limits
  let sanitized: unknown
  try {
    sanitized = sanitizeJSON(parsed)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : '不正なJSON構造です' }
  }

  if (typeof sanitized !== 'object' || sanitized === null) {
    return { ok: false, error: 'Invalid JSON: expected an object' }
  }

  const obj = sanitized as Record<string, unknown>

  // formatVersion: 2 envelope — unwrap and validate definition
  if (obj['formatVersion'] === FORMAT_VERSION) {
    const inner = obj['definition']
    if (typeof inner !== 'object' || inner === null) {
      return { ok: false, error: 'formatVersion: 2 エンベロープに definition がありません' }
    }
    const result = ReportDefinitionSchema.safeParse(inner)
    if (!result.success) {
      const first = result.error.issues[0]
      const path = first?.path.join('.') ?? ''
      const msg = first?.message ?? 'unknown'
      return { ok: false, error: `バリデーションエラー (${path}: ${msg})` }
    }
    const migrated = migrateLabelToText(stripVisibilityRule(ensurePageSections(result.data as unknown as ReportDefinition)))
    return { ok: true, definition: migrated }
  }

  // ReportDefinition $schema: v1 format — validate with Zod schema
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
    const migrated = migrateLabelToText(stripVisibilityRule(ensurePageSections(result.data as unknown as ReportDefinition)))
    return { ok: true, definition: migrated }
  }

  // Reject any other $schema version — do not attempt auto-migration for unknown schemas
  if (typeof obj['$schema'] === 'string' && obj['$schema'] !== '') {
    return { ok: false, error: `非対応スキーマ: ${obj['$schema']}` }
  }

  // Legacy Report format (no $schema) — auto-migrate
  if (!obj['id'] || !obj['pages'] || !Array.isArray(obj['pages'])) {
    return { ok: false, error: 'Invalid report JSON: missing required fields (id, pages)' }
  }
  const definition = migrateLabelToText(migrateReport(obj as unknown as Report))
  return { ok: true, definition }
}

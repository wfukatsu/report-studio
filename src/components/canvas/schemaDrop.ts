/**
 * Pure domain logic for schema field/group drops on the canvas (#435).
 *
 * Extracted from ReportCanvas.tsx (coverage-excluded DnD wiring) so the drop
 * *rules* — which element types accept a binding, how a schema field becomes a
 * repeating-container column (numeric → right align + comma format + auto
 * total), and collision-free placement — are unit-testable in isolation.
 * Companion to canvasGeometry.ts: must stay free of React/DOM dependencies.
 */

/** Element types that accept a single-field schema binding on drop. */
export const SCHEMA_DROP_BINDABLE_TYPES: ReadonlySet<string> = new Set([
  'dataField',
  'text',
  'checkbox',
  'eraSelect',
])

/** Repeating containers that accept schema fields as columns on drop. */
export const REPEATING_CONTAINER_TYPES: ReadonlySet<string> = new Set([
  'repeatingBand',
  'repeatingList',
])

/** A schema field as carried in the drag payload. */
export interface BandFieldSpec {
  fieldKey: string
  fieldLabel: string
  fieldType?: string
}

interface BandColumn {
  key: string
  label: string
  width: number
  align?: string
  format?: { type: string }
}

interface BandTotal {
  fieldKey: string
  formula: string
  label?: string
}

/** The subset of repeatingBand / repeatingList the drop logic reads. */
export interface BandLike {
  fields?: BandColumn[]
  dataSource?: string
  totals?: BandTotal[]
  showFooter?: boolean
}

/**
 * Build the `updateElement` patch for dropping schema fields onto a repeating
 * container:
 * - columns are de-duplicated by key (already-present fields are skipped)
 * - numeric fields become right-aligned comma-formatted columns and get an
 *   auto total row (`formula: 'sum'`) with the footer enabled
 * - `dataSource` is set when the band has none and the group provides one
 *
 * Returns null when every dropped field is already a column (no-op).
 */
export function buildBandColumnsPatch(
  band: BandLike,
  fields: readonly BandFieldSpec[],
  groupDataKey?: string,
): { patch: Record<string, unknown>; addedCount: number } | null {
  const existingKeys = new Set((band.fields ?? []).map((f) => f.key))
  const added = fields.filter((f) => !existingKeys.has(f.fieldKey))
  if (added.length === 0) return null

  const newColumns = added.map((f) => {
    const isNumeric = f.fieldType === 'number'
    return {
      key: f.fieldKey,
      label: f.fieldLabel,
      width: 20,
      align: (isNumeric ? 'right' : 'left') as 'left' | 'right' | 'center',
      ...(isNumeric ? { format: { type: 'comma' as const } } : {}),
    }
  })

  const patch: Record<string, unknown> = {
    fields: [...(band.fields ?? []), ...newColumns],
  }

  const existingTotalKeys = new Set((band.totals ?? []).map((t) => t.fieldKey))
  const newTotals = added
    .filter((f) => f.fieldType === 'number' && !existingTotalKeys.has(f.fieldKey))
    // seed default label persisted to the data model (not UI copy)
    .map((f) => ({ fieldKey: f.fieldKey, formula: 'sum' as const, label: '合計' }))
  if (newTotals.length > 0) {
    patch.totals = [...(band.totals ?? []), ...newTotals]
    patch.showFooter = true
  }

  if (!band.dataSource && groupDataKey) {
    patch.dataSource = groupDataKey
  }

  return { patch, addedCount: added.length }
}

/** Minimal box shape for overlap checks (positions in mm, section-relative). */
interface PlacedBox {
  position: { x: number; y: number }
  size: { width: number; height: number }
}

/**
 * Collision-free placement (#188): starting at (x, y), step diagonally in 5mm
 * increments until the new box no longer overlaps any existing element. Each
 * step is clamped to the section bounds; a hard attempt limit prevents an
 * infinite loop when the section is completely occupied.
 */
export function resolveCollisionFreePosition(
  x: number,
  y: number,
  size: { width: number; height: number },
  existing: readonly PlacedBox[],
  pageWidth: number,
  sectionHeight: number,
): { x: number; y: number } {
  const OFFSET_STEP = 5 // 5mm per step
  const maxAttempts = Math.ceil(Math.max(pageWidth, sectionHeight) / OFFSET_STEP) + 1
  let posX = x
  let posY = y
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const overlaps = existing.some(
      (ex) =>
        ex.position.x < posX + size.width &&
        ex.position.x + ex.size.width > posX &&
        ex.position.y < posY + size.height &&
        ex.position.y + ex.size.height > posY,
    )
    if (!overlaps) break
    const nextOffset = (attempt + 1) * OFFSET_STEP
    posX = Math.min(x + nextOffset, pageWidth - size.width)
    posY = Math.min(y + nextOffset, sectionHeight - size.height)
  }
  return { x: posX, y: posY }
}

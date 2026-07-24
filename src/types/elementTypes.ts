/**
 * #415: runtime list of every ReportElement type — the machine-readable single
 * source for the frontend⇔server element-type parity chain:
 *
 *   ReportElement union (src/types/index.ts)
 *     ⇕ compile-time exhaustiveness assertions in THIS file
 *   ELEMENT_TYPES (runtime array)
 *     → npm run generate:schema → schemas/element-types.json (sync-tested)
 *     → server V2ElementParityMatrixTest reads the JSON and fails when a new
 *       frontend type has no renderer/notes entry
 *
 * Adding a type to the union without listing it here is a COMPILE ERROR, so a
 * frontend-only element can no longer ship silently (#416 made the fallback
 * visible; this closes the loop by failing the server build).
 */
import type { ReportElement } from './index'

export const ELEMENT_TYPES = [
  'text',
  'dataField',
  'chart',
  'repeatingBand',
  'repeatingList',
  'formTable',
  'shape',
  'image',
  'barcode',
  'manualEntry',
  'checkbox',
  'eraSelect',
  'hanko',
  'approvalStampRow',
  'revenueStamp',
  'pageNumber',
  'currentDate',
  'divider',
  'tenantCompanyName',
  'tenantAddress',
  'tenantPhone',
  'tenantRepresentative',
  'tenantLogo',
  'tenantCustom',
] as const satisfies readonly ReportElement['type'][]

export type ElementType = (typeof ELEMENT_TYPES)[number]

// ---------------------------------------------------------------------------
// Compile-time exhaustiveness: `satisfies` above rejects entries NOT in the
// union; this direction rejects union members MISSING from the array. When a
// new element type is added to ReportElement, this line fails to compile until
// ELEMENT_TYPES is updated (which then propagates to the JSON + server test).
// ---------------------------------------------------------------------------
type MissingFromElementTypes = Exclude<ReportElement['type'], ElementType>
const _assertAllTypesListed: MissingFromElementTypes extends never
  ? true
  : ['ELEMENT_TYPES is missing union member(s):', MissingFromElementTypes] = true
void _assertAllTypesListed

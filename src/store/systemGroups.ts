/**
 * System schema-group identifiers — a dependency-free leaf module.
 *
 * Kept separate from schemaSlice so lightweight consumers (e.g. the relationship
 * graph) can import these without pulling in the whole Zustand store, which
 * would create an import cycle.
 */

import sharedConstants from '../../schemas/shared-constants.json'

/** ID of the product master system group — single source: schemas/shared-constants.json (#425). */
export const SYSTEM_GROUP_PRODUCT_MASTER: string = sharedConstants.systemGroupProductMaster

/** Returns true for system-reserved group IDs (double-underscore pattern). */
export function isSystemGroup(id: string): boolean {
  return id === SYSTEM_GROUP_PRODUCT_MASTER
}

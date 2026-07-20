/**
 * Per-user localStorage key for auto-saved report drafts.
 *
 * Drafts are keyed by userId so two users sharing a browser do not
 * see each other's in-flight work.
 */

const AUTOSAVE_KEY_PREFIX = 'rds-autosave'

export function getAutoSaveKey(userId: string | null | undefined): string | null {
  if (!userId) return null
  return `${AUTOSAVE_KEY_PREFIX}:${userId}`
}

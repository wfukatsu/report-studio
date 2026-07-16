/**
 * Per-user localStorage key for auto-saved report drafts.
 *
 * Drafts are keyed by userId so two users sharing a browser do not
 * see each other's in-flight work. The legacy unkeyed key is kept
 * here as a constant so on-mount cleanup can remove any stale
 * pre-multiuser drafts that may still be sitting in localStorage.
 */

export const LEGACY_AUTOSAVE_KEY = 'rds-autosave'

export function getAutoSaveKey(userId: string | null | undefined): string | null {
  if (!userId) return null
  return `${LEGACY_AUTOSAVE_KEY}:${userId}`
}

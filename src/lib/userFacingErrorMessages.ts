/**
 * userFacingErrorMessages — resolves a `UserFacingErrorCode` into localized
 * `{ title, hint }` copy via i18n (#329 Phase 3).
 *
 * The strings live in the `serverErrors` i18n namespace (one JSON per locale),
 * keyed by `UserFacingErrorCode`. This helper takes the caller's `t` (bound to
 * `serverErrors`) so it stays a pure function usable from any component.
 */
import type { TFunction } from 'i18next'
import type { UserFacingErrorCode } from './userFacingError'

export interface UserFacingErrorCopy {
  title: string
  hint: string
}

/** All codes that have a translation entry — mirrors `serverErrors.json` keys. */
const KNOWN_CODES: ReadonlySet<string> = new Set<UserFacingErrorCode>([
  'unauthorized', 'forbidden', 'not_found', 'conflict', 'invalid_request',
  'rate_limited', 'unreachable', 'server_error', 'network', 'unknown',
])

export function getErrorCopy(
  code: UserFacingErrorCode | string,
  t: TFunction<'serverErrors'>,
): UserFacingErrorCopy {
  // Tolerate stray code strings (e.g. a Node-style `code: 'ECONNREFUSED'` slipping
  // through `InlineErrorBanner.isClassified`) by falling back to the unknown copy.
  const key = (KNOWN_CODES.has(code) ? code : 'unknown') as UserFacingErrorCode
  return {
    title: t(`${key}.title`),
    hint: t(`${key}.hint`),
  }
}

/**
 * JSON sanitization utilities for imported data.
 *
 * Strips prototype pollution keys and enforces structural complexity limits
 * to prevent DoS via deeply nested or excessively large JSON payloads.
 */

import i18n from '@/i18n/config'

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

const MAX_DEPTH = 50
const MAX_OBJECT_COUNT = 5000

/**
 * Recursively sanitize a parsed JSON value:
 * - Remove keys that could cause prototype pollution
 * - Enforce maximum nesting depth
 * - Enforce maximum object count
 *
 * Call this AFTER JSON.parse() and BEFORE Zod validation.
 */
export function sanitizeJSON(obj: unknown): unknown {
  const counter = { count: 0 }
  return sanitizeValue(obj, 0, counter)
}

function sanitizeValue(
  obj: unknown,
  depth: number,
  counter: { count: number },
): unknown {
  if (obj === null || typeof obj !== 'object') return obj

  if (depth > MAX_DEPTH) {
    throw new Error(i18n.t('serverErrors:lib.sanitizeTooDeep', { max: MAX_DEPTH }))
  }
  if (++counter.count > MAX_OBJECT_COUNT) {
    throw new Error(i18n.t('serverErrors:lib.sanitizeTooManyObjects', { max: MAX_OBJECT_COUNT }))
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeValue(item, depth + 1, counter))
  }

  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (!DANGEROUS_KEYS.has(key)) {
      cleaned[key] = sanitizeValue(value, depth + 1, counter)
    }
  }
  return cleaned
}

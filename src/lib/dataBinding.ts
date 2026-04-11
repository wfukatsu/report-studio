/**
 * Resolves a dot-notation field key against a data source record.
 * e.g. "customer.name" → data["customer"]["name"]
 */
// Keys that would traverse the prototype chain — must never be resolved against data
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function resolveField(data: Record<string, unknown>, fieldKey: string): string {
  const parts = fieldKey.split('.')
  let current: unknown = data
  for (const part of parts) {
    if (FORBIDDEN_KEYS.has(part)) return ''
    if (current == null || typeof current !== 'object') return ''
    current = (current as Record<string, unknown>)[part]
  }
  return current == null ? '' : String(current)
}

// ---------------------------------------------------------------------------
// System variables ($page, $totalPages, $printDate)
// ---------------------------------------------------------------------------

export interface PageContext {
  pageIndex: number
  totalPages: number
}

function resolveSystemVar(key: string, pageContext: PageContext): string | null {
  switch (key) {
    case '$page': return String(pageContext.pageIndex + 1)
    case '$totalPages': return String(pageContext.totalPages)
    case '$printDate': return new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
    default: return null
  }
}

/**
 * Checks whether a dot-notation field key exists in a data source record.
 * Unlike resolveField, this correctly returns true for fields whose value is '' or null.
 */
export function fieldExists(data: Record<string, unknown>, fieldKey: string): boolean {
  const parts = fieldKey.split('.')
  let current: unknown = data
  for (const part of parts) {
    if (FORBIDDEN_KEYS.has(part)) return false
    if (current == null || typeof current !== 'object') return false
    if (!Object.prototype.hasOwnProperty.call(current, part)) return false
    current = (current as Record<string, unknown>)[part]
  }
  return true
}

/**
 * Interpolates {{fieldKey}} tokens in a template string with data values.
 * Supports system variables ($page, $totalPages, $printDate) when pageContext is provided.
 */
export function interpolate(
  template: string,
  data: Record<string, unknown>,
  pageContext?: PageContext,
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
    const trimmed = key.trim()
    if (trimmed.startsWith('$')) {
      if (pageContext) {
        const sys = resolveSystemVar(trimmed, pageContext)
        if (sys !== null) return sys
      }
      return `{{${trimmed}}}`
    }
    return resolveField(data, trimmed)
  })
}

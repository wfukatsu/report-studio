/**
 * Pure filter function for templates (builtin and backend).
 * Supports text search, category filter, and tag filter.
 */

interface Filterable {
  name: string
  description?: string
  category?: string
  tags?: string[]
}

interface FilterCriteria {
  query?: string
  category?: string | null   // null = all
  tags?: string[]             // AND filter
}

/**
 * Filter templates by search query, category, and tags.
 * All criteria are AND-combined.
 */
export function filterTemplates<T extends Filterable>(
  templates: T[],
  criteria: FilterCriteria,
): T[] {
  const { query, category, tags } = criteria

  return templates.filter((t) => {
    // Text search: match name or description (case-insensitive)
    if (query) {
      const q = query.toLowerCase()
      const nameMatch = t.name.toLowerCase().includes(q)
      const descMatch = (t.description ?? '').toLowerCase().includes(q)
      if (!nameMatch && !descMatch) return false
    }

    // Category filter: exact match
    if (category) {
      if (t.category !== category) return false
    }

    // Tag filter: AND — template must have ALL selected tags
    if (tags && tags.length > 0) {
      const templateTags = t.tags ?? []
      if (!tags.every((tag) => templateTags.includes(tag))) return false
    }

    return true
  })
}

/**
 * Collect unique categories from a list of templates.
 */
export function collectCategories<T extends Filterable>(templates: T[]): string[] {
  return [...new Set(templates.map((t) => t.category).filter(Boolean) as string[])]
}

/**
 * Collect unique tags from a list of templates.
 */
export function collectTags<T extends Filterable>(templates: T[]): string[] {
  return [...new Set(templates.flatMap((t) => t.tags ?? []))]
}

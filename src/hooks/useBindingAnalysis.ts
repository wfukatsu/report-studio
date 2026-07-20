import { useReportStore } from '@/store'
import { flattenPageElements } from '@/store/selectors'
import { fieldExists } from '@/lib/dataBinding'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ElementBinding {
  /** Element ID. For formTable elements this is the formTable element ID (not a cell ID). */
  elementId: string
  /** Human-readable display label */
  elementLabel: string
  /** Page the element lives on */
  pageId: string
  /** Bound field key — undefined for unbound elements */
  fieldKey?: string
}

export interface BindingAnalysis {
  /** True when at least one DataSource is configured */
  hasDataSource: boolean
  /** Bindable elements that have no field configured */
  unboundElements: ElementBinding[]
  /** Bound elements: fieldKey → element label */
  fieldMappings: ElementBinding[]
  /**
   * Bound elements whose fieldKey is not found in the current sample DataSource.
   * Note: this reflects sample-data absence, not schema invalidity.
   */
  missingInSampleElements: ElementBinding[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Best-effort display label for an element */
function labelFor(el: { name?: string; type: string }): string {
  return el.name?.trim() || el.type
}

/**
 * Compute a stable fingerprint string from the binding-relevant parts of the pages array.
 * This changes only when element types, field keys, or content tokens change —
 * NOT when elements are dragged/resized. Used as the useMemo dependency instead of
 * the raw pages reference to prevent re-running analysis on every drag event.
 */
function bindingFingerprint(
  pages: Parameters<typeof flattenPageElements>[0][],
): string {
  const parts: string[] = []
  for (const page of pages) {
    const elements = flattenPageElements(page)
    for (const el of elements) {
      switch (el.type) {
        case 'text':
          parts.push(`${el.id}:t:${el.content ?? ''}`)
          break
        case 'dataField':
          parts.push(`${el.id}:df:${el.fieldKey ?? ''}`)
          break
        case 'checkbox':
        case 'eraSelect':
          parts.push(`${el.id}:${el.type}:${el.dataSource ?? ''}`)
          break
        case 'formTable': {
          const cellParts = el.rows
            .flatMap((r) => r.cells.map((c) => `${c.id}:${c.fieldKey ?? ''}`))
            .join(',')
          parts.push(`${el.id}:ft:${cellParts}`)
          break
        }
        default:
          parts.push(`${el.id}:${el.type}`)
      }
    }
  }
  return parts.join('|')
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

// Module-level fingerprint cache. The zustand selector below recomputes the
// (cheap) fingerprint on every store change but only re-runs the (expensive)
// traversal when the fingerprint actually changed — and, crucially, returns the
// cached result object so the selector output is referentially stable. That
// keeps drag/resize (which create new immer references without changing any
// binding-relevant data) from re-rendering subscribers or re-running the
// analysis, without holding store data in refs.
let cachedKey: string | null = null
let cachedResult: BindingAnalysis | null = null

function computeBindingAnalysis(
  pages: Parameters<typeof flattenPageElements>[0][],
  dataSources: readonly { fields?: unknown }[],
): BindingAnalysis {
  const hasDataSource = dataSources.length > 0
  const dataSource = dataSources[0] ?? null
  const fields = (dataSource?.fields ?? {}) as Record<string, unknown>

  const unboundElements: ElementBinding[] = []
  const fieldMappings: ElementBinding[] = []
  const missingInSampleElements: ElementBinding[] = []

  /** Register a bound field key for an element */
  function registerBound(base: Omit<ElementBinding, 'fieldKey'>, fk: string) {
    const binding: ElementBinding = { ...base, fieldKey: fk }
    fieldMappings.push(binding)
    if (hasDataSource && !fieldExists(fields, fk)) {
      missingInSampleElements.push(binding)
    }
  }

  for (const page of pages) {
    const elements = flattenPageElements(page)

    for (const el of elements) {
      const base: Omit<ElementBinding, 'fieldKey'> = {
        elementId: el.id,
        elementLabel: labelFor(el),
        pageId: page.id,
      }

      switch (el.type) {
        case 'text': {
          // Extract {{key}} tokens, skip system variables ($page etc.)
          const tokens = [...(el.content ?? '').matchAll(/\{\{([^}]+)\}\}/g)]
            .map((m) => m[1].trim())
            .filter((k) => !k.startsWith('$'))

          if (tokens.length === 0) {
            unboundElements.push(base)
          } else {
            for (const token of tokens) {
              registerBound(base, token)
            }
          }
          break
        }

        case 'dataField': {
          const fk = el.fieldKey?.trim() ?? ''
          if (!fk) {
            unboundElements.push(base)
          } else {
            registerBound(base, fk)
          }
          break
        }

        // checkbox and eraSelect both bind via dataSource — identical handling
        case 'checkbox':
        case 'eraSelect': {
          const ds = el.dataSource?.trim() ?? ''
          if (!ds) {
            unboundElements.push(base)
          } else {
            registerBound(base, ds)
          }
          break
        }

        case 'formTable': {
          for (const row of el.rows) {
            for (const cell of row.cells) {
              if (cell.type === 'dataField') {
                // Use the parent formTable element ID so clicking the row selects
                // the formTable element (cell IDs are not addressable via selectElement)
                const cellBase: Omit<ElementBinding, 'fieldKey'> = {
                  elementId: el.id,
                  elementLabel: `${labelFor(el)} > ${cell.text?.trim() || cell.id}`,
                  pageId: page.id,
                }
                const fk = cell.fieldKey?.trim() ?? ''
                if (!fk) {
                  unboundElements.push(cellBase)
                } else {
                  registerBound(cellBase, fk)
                }
              }
            }
          }
          break
        }

        // Non-bindable types: image, shape, chart, barcode, etc.
        default:
          break
      }
    }
  }

  return { hasDataSource, unboundElements, fieldMappings, missingInSampleElements }
}

export function useBindingAnalysis(): BindingAnalysis {
  // Subscribe via a fingerprint-gated selector: fingerprints change only when
  // binding-relevant data changes, NOT when elements are dragged or resized —
  // preventing ~60 re-computations per second during editing.
  return useReportStore((s) => {
    const pages = s.definition.pages
    const dataSources = s.definition.dataSources
    const fields = (dataSources[0]?.fields ?? {}) as Record<string, unknown>
    const key = [
      bindingFingerprint(pages),
      Object.keys(fields).sort().join(','),
      String(dataSources.length > 0),
    ].join('\u0000')

    if (key !== cachedKey || cachedResult === null) {
      cachedKey = key
      cachedResult = computeBindingAnalysis(pages, dataSources)
    }
    return cachedResult
  })
}

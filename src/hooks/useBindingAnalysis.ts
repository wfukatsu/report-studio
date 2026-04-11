import { useMemo } from 'react'
import { useReportStore } from '@/store'
import { flattenPageElements } from '@/store/selectors'
import { fieldExists } from '@/lib/dataBinding'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ElementBinding {
  /** Element ID (for formTable cells: `${elementId}_${cellId}`) */
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
  /** Bound elements whose fieldKey is not found in the DataSource */
  errorElements: ElementBinding[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Best-effort display label for an element */
function labelFor(el: { name?: string; type: string }): string {
  return el.name?.trim() || el.type
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBindingAnalysis(): BindingAnalysis {
  const pages = useReportStore((s) => s.definition.pages)
  const dataSources = useReportStore((s) => s.definition.dataSources)

  return useMemo(() => {
    const dataSource = dataSources[0] ?? null
    const hasDataSource = !!dataSource
    const fields = (dataSource?.fields ?? {}) as Record<string, unknown>

    const unboundElements: ElementBinding[] = []
    const fieldMappings: ElementBinding[] = []
    const errorElements: ElementBinding[] = []

    /** Register a bound field key for an element */
    function registerBound(base: Omit<ElementBinding, 'fieldKey'>, fk: string) {
      fieldMappings.push({ ...base, fieldKey: fk })
      if (hasDataSource && !fieldExists(fields, fk)) {
        errorElements.push({ ...base, fieldKey: fk })
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

          case 'checkbox': {
            const ds = el.dataSource?.trim() ?? ''
            if (!ds) {
              unboundElements.push(base)
            } else {
              registerBound(base, ds)
            }
            break
          }

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
                  const cellBase: Omit<ElementBinding, 'fieldKey'> = {
                    elementId: `${el.id}_${cell.id}`,
                    elementLabel: `${labelFor(el)} (セル)`,
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

    return { hasDataSource, unboundElements, fieldMappings, errorElements }
  }, [pages, dataSources])
}

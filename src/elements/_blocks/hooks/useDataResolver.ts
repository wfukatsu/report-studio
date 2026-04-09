import { useMemo } from 'react'
import { resolveField } from '@/lib/dataBinding'
import { applyFormat } from '@/lib/numberFormatter'
import type { CalculationFormat } from '@/types'

interface DataResolverOptions {
  format?: CalculationFormat
  fallbackText?: string
}

interface DataResolverResult {
  /** Formatted string for display */
  resolved: string
  /** Raw value before formatting */
  raw: unknown
  /** Error if resolution failed */
  error: Error | null
}

/**
 * Custom hook for resolving data-bound field values with optional formatting.
 * Replaces the render-prop DataResolver pattern for cleaner composition.
 */
export function useDataResolver(
  fieldKey: string,
  data: Record<string, unknown>,
  options: DataResolverOptions = {},
): DataResolverResult {
  const { format, fallbackText } = options
  // Serialize format to a stable string key so useMemo doesn't re-run
  // when the parent passes a new object reference with the same content.
  const formatKey = format ? JSON.stringify(format) : ''

  return useMemo(() => {
    if (!fieldKey) {
      return { resolved: fallbackText ?? '', raw: null, error: null }
    }
    try {
      const rawValue = resolveField(data, fieldKey)
      if (rawValue == null || rawValue === '') {
        return { resolved: fallbackText ?? '', raw: rawValue, error: null }
      }
      const formatted = format
        ? applyFormat(rawValue, format)
        : String(rawValue)
      return { resolved: formatted, raw: rawValue, error: null }
    } catch (e) {
      return {
        resolved: fallbackText ?? '',
        raw: null,
        error: e instanceof Error ? e : new Error(String(e)),
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldKey, data, formatKey, fallbackText])
}

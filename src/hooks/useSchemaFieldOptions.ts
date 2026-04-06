/**
 * useSchemaFieldOptions — derive binding key candidates from the schema definition.
 *
 * Returns an empty array when no schema is defined (free-text fallback).
 * Uses plain selector (no useShallow) — schema is an object reference that immer
 * replaces entirely on any mutation, so reference equality is sufficient.
 */

import { useMemo } from 'react'
import { useReportStore } from '@/store'

export interface FieldOption {
  /** Binding key used in fieldPath / {{token}} expressions */
  value: string
  /** Human-readable label shown in dropdowns / datalists */
  label: string
  type: import('@/types').SchemaFieldType
  groupRole: 'master' | 'detail'
}

export function useSchemaFieldOptions(): FieldOption[] {
  const schema = useReportStore((s) => s.definition.schema)

  return useMemo(() => {
    if (!schema) return []
    return schema.groups.flatMap((g) =>
      g.fields.map((f) => ({
        value: g.role === 'detail'
          ? `${g.dataKey || g.id}[].${f.key}`
          : f.key,
        label: `${f.label || f.key} (${g.label || g.role})`,
        type: f.type,
        groupRole: g.role,
      })),
    )
  }, [schema])
}

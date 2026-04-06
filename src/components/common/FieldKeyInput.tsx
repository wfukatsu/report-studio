/**
 * FieldKeyInput — text input with schema-derived datalist autocomplete.
 *
 * When a schema is defined, shows field options as a datalist.
 * Falls back to plain text input when no schema is defined (existing behaviour).
 *
 * Uses useId() to guarantee unique datalist IDs even when multiple instances
 * exist on the same page.
 */

import { useId } from 'react'
import { useSchemaFieldOptions } from '@/hooks/useSchemaFieldOptions'

interface FieldKeyInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function FieldKeyInput({ value, onChange, placeholder, className }: FieldKeyInputProps) {
  const listId = useId()
  const options = useSchemaFieldOptions()

  return (
    <>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={options.length > 0 ? listId : undefined}
        placeholder={placeholder}
        className={className ?? 'border rounded px-2 py-1 text-xs w-full bg-background font-mono'}
      />
      {options.length > 0 && (
        <datalist id={listId}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </datalist>
      )}
    </>
  )
}

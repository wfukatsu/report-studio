/**
 * TokenInput — textarea with double-brace token autocomplete from schema fields.
 *
 * When the user types "{{", a dropdown of schema field options is shown.
 * Selecting an option inserts "{{fieldKey}}" and closes the dropdown.
 * Falls back to plain textarea when no schema is defined.
 */

import { useState, useRef, useId } from 'react'
import { useSchemaFieldOptions } from '@/hooks/useSchemaFieldOptions'

interface TokenInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  rows?: number
}

export function TokenInput({ value, onChange, placeholder, className, rows = 3 }: TokenInputProps) {
  const options = useSchemaFieldOptions()
  const [showDropdown, setShowDropdown] = useState(false)
  const [filter, setFilter] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropdownId = useId()

  const filteredOptions = filter
    ? options.filter((o) =>
        o.value.includes(filter) || o.label.toLowerCase().includes(filter.toLowerCase()),
      )
    : options

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newValue = e.target.value
    onChange(newValue)

    if (options.length === 0) return

    // Detect "{{" trigger: look at text before cursor
    const cursor = e.target.selectionStart ?? newValue.length
    const before = newValue.slice(0, cursor)
    const triggerMatch = /\{\{([^}]*)$/.exec(before)
    if (triggerMatch) {
      setFilter(triggerMatch[1] ?? '')
      setShowDropdown(true)
    } else {
      setShowDropdown(false)
      setFilter('')
    }
  }

  function insertToken(fieldKey: string) {
    const ta = textareaRef.current
    if (!ta) return

    const cursor = ta.selectionStart ?? value.length
    const before = value.slice(0, cursor)
    // Replace from the "{{" position
    const triggerIdx = before.lastIndexOf('{{')
    const after = value.slice(cursor)
    const newValue = value.slice(0, triggerIdx) + `{{${fieldKey}}}` + after
    onChange(newValue)
    setShowDropdown(false)
    setFilter('')

    // Restore cursor position after token
    requestAnimationFrame(() => {
      const newCursor = triggerIdx + fieldKey.length + 4 // "{{" + key + "}}"
      ta.setSelectionRange(newCursor, newCursor)
      ta.focus()
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showDropdown && e.key === 'Escape') {
      setShowDropdown(false)
      setFilter('')
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Delay to allow click on dropdown options
          setTimeout(() => setShowDropdown(false), 150)
        }}
        placeholder={placeholder}
        rows={rows}
        className={className ?? 'border rounded px-2 py-1 text-xs w-full bg-background font-mono resize-y'}
        aria-autocomplete={options.length > 0 ? 'list' : 'none'}
        aria-controls={showDropdown ? dropdownId : undefined}
      />
      {showDropdown && filteredOptions.length > 0 && (
        <ul
          id={dropdownId}
          role="listbox"
          className="absolute z-50 left-0 right-0 border rounded bg-popover shadow-md max-h-40 overflow-y-auto text-xs"
        >
          {filteredOptions.map((o) => (
            <li
              key={o.value}
              role="option"
              aria-selected={false}
              className="px-2 py-1 cursor-pointer hover:bg-accent flex items-center justify-between gap-2"
              onMouseDown={(e) => {
                e.preventDefault() // prevent textarea blur
                insertToken(o.value)
              }}
            >
              <span className="font-mono">{`{{${o.value}}}`}</span>
              <span className="text-muted-foreground truncate">{o.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

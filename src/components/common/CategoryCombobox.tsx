import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, X } from 'lucide-react'

interface Props {
  value: string | undefined
  options: string[]
  onChange: (value: string | undefined) => void
  placeholder?: string
}

export function CategoryCombobox({ value, options, onChange, placeholder }: Props) {
  const { t } = useTranslation('components')
  const resolvedPlaceholder = placeholder ?? t('common.categoryCombobox.placeholder')
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = input
    ? options.filter((o) => o.toLowerCase().includes(input.toLowerCase()))
    : options

  const handleSelect = (cat: string) => {
    onChange(cat)
    setInput('')
    setOpen(false)
  }

  const handleClear = () => {
    onChange(undefined)
    setInput('')
  }

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return; if (e.key === 'Enter' && input.trim()) {
      e.preventDefault()
      handleSelect(input.trim())
    }
    if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-1">
        <div
          className="flex-1 flex items-center gap-1 border rounded px-2 py-1 text-xs bg-background cursor-pointer"
          onClick={() => { setOpen(!open); inputRef.current?.focus() }}
        >
          {open ? (
            <input
              ref={inputRef}
              type="text"
              className="flex-1 outline-none bg-transparent text-xs"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={value ?? resolvedPlaceholder}
              autoFocus
            />
          ) : (
            <span className={value ? 'text-foreground' : 'text-muted-foreground'}>
              {value ?? resolvedPlaceholder}
            </span>
          )}
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
        </div>
        {value && (
          <button
            onClick={handleClear}
            className="p-0.5 rounded hover:bg-accent"
            title={t('common.categoryCombobox.clear')}
          >
            <X className="w-3 h-3 text-muted-foreground" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-background border rounded shadow-lg max-h-32 overflow-y-auto">
          {filtered.map((cat) => (
            <button
              key={cat}
              className={`w-full text-left px-2 py-1 text-xs hover:bg-accent ${cat === value ? 'bg-primary/10 font-medium' : ''}`}
              onClick={() => handleSelect(cat)}
            >
              {cat}
            </button>
          ))}
          {input.trim() && !options.includes(input.trim()) && (
            <button
              className="w-full text-left px-2 py-1 text-xs hover:bg-accent text-primary"
              onClick={() => handleSelect(input.trim())}
            >
              {t('common.categoryCombobox.createNew', { name: input.trim() })}
            </button>
          )}
          {filtered.length === 0 && !input.trim() && (
            <p className="px-2 py-1 text-xs text-muted-foreground">{t('common.categoryCombobox.empty')}</p>
          )}
        </div>
      )}
    </div>
  )
}

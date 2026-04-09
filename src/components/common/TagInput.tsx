import { useState, useRef } from 'react'
import { X } from 'lucide-react'

interface Props {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
}

export function TagInput({ value, onChange, placeholder = 'タグを追加...' }: Props) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault()
      const tag = input.trim()
      if (!value.includes(tag)) {
        onChange([...value, tag])
      }
      setInput('')
    }
    if (e.key === 'Backspace' && !input && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  const handleRemove = (tag: string) => {
    onChange(value.filter((t) => t !== tag))
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1 border rounded px-1.5 py-1 bg-background min-h-[28px] cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] leading-tight"
        >
          {tag}
          <button
            onClick={(e) => { e.stopPropagation(); handleRemove(tag) }}
            className="hover:text-destructive"
            aria-label={`タグ「${tag}」を削除`}
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        className="flex-1 min-w-[60px] outline-none bg-transparent text-xs"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={value.length === 0 ? placeholder : ''}
      />
    </div>
  )
}

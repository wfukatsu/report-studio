/**
 * Searchable, categorized function list for the left panel.
 * Clicking a function selects it (shows help in right panel) and inserts it into the editor.
 * No inline detail expansion — help is displayed in the right panel's help area.
 */

import { useState, useMemo, useCallback } from 'react'
import { FORMULA_FUNCTIONS, CATEGORY_LABELS_JA, type FunctionCategory, type FunctionDef } from '@/lib/formula/functionCatalog'

interface FunctionListProps {
  readonly onInsert: (template: string) => void
  /** Called when a function row is clicked (for showing help in right panel) */
  readonly onSelect?: (name: string) => void
}

type CategoryKey = FunctionCategory | 'all'

function buildInsertTemplate(def: FunctionDef): string {
  if (def.args.length === 0) return `${def.name}()`
  const requiredCount = def.args.filter((a) => !a.optional).length
  const placeholders = Array.from({ length: requiredCount }, () => '').join(', ')
  return `${def.name}(${placeholders})`
}

const CATEGORIES: readonly { key: CategoryKey; label: string; count: number }[] = [
  { key: 'all', label: '全て', count: FORMULA_FUNCTIONS.length },
  ...(['aggregate', 'arithmetic', 'condition', 'text', 'date'] as const).map((cat) => ({
    key: cat as CategoryKey,
    label: CATEGORY_LABELS_JA[cat],
    count: FORMULA_FUNCTIONS.filter((f) => f.category === cat).length,
  })).filter((c) => c.count > 0),
]

export function FunctionList({ onInsert, onSelect }: FunctionListProps) {
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all')
  const [search, setSearch] = useState('')
  const [selectedName, setSelectedName] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let result: readonly FunctionDef[] = FORMULA_FUNCTIONS
    if (activeCategory !== 'all') {
      result = result.filter((f) => f.category === activeCategory)
    }
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.labelJa.includes(q) ||
          f.descriptionJa.includes(q),
      )
    }
    return result
  }, [activeCategory, search])

  const handleClick = useCallback((def: FunctionDef) => {
    setSelectedName(def.name)
    onSelect?.(def.name)
    onInsert(buildInsertTemplate(def))
  }, [onInsert, onSelect])

  const handleSelect = useCallback((def: FunctionDef) => {
    setSelectedName(def.name)
    onSelect?.(def.name)
  }, [onSelect])

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <input
        type="search"
        className="mx-2 mt-2 mb-1 px-2 py-1 text-xs border border-border rounded bg-background placeholder:text-muted-foreground"
        placeholder="関数検索..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="関数検索"
      />

      {/* Category filter */}
      <div className="flex gap-1 px-2 py-1 flex-wrap">
        {CATEGORIES.map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            className={`px-1.5 py-0.5 text-[10px] rounded ${
              activeCategory === key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
            onClick={() => setActiveCategory(key)}
          >
            {label}({count})
          </button>
        ))}
      </div>

      {/* Function list — simple rows, no inline expansion */}
      <ul className="flex-1 overflow-y-auto px-2 pb-2" role="listbox" aria-label="関数一覧">
        {filtered.map((def) => {
          const isSelected = selectedName === def.name

          return (
            <li key={def.name} role="option" aria-selected={isSelected}>
              <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${isSelected ? 'bg-muted' : 'hover:bg-muted/60'}`}>
                <button
                  type="button"
                  className="flex-1 text-left flex items-center gap-1.5 min-w-0"
                  onClick={() => handleSelect(def)}
                  title={`${def.name}(${def.args.map((a) => a.name).join(', ')}) — ${def.labelJa}`}
                >
                  <span className="font-mono font-semibold text-[#6E5DCF] shrink-0">{def.name}</span>
                  <span className="text-muted-foreground truncate">{def.labelJa}</span>
                </button>
                <button
                  type="button"
                  className="shrink-0 px-1.5 py-0.5 text-[9px] font-medium text-primary bg-primary/10 rounded hover:bg-primary/20"
                  onClick={(e) => { e.stopPropagation(); handleClick(def) }}
                  title={`${def.name} を挿入`}
                >
                  挿入
                </button>
              </div>
            </li>
          )
        })}
        {filtered.length === 0 && (
          <li className="py-4 text-center text-xs text-muted-foreground">該当する関数がありません</li>
        )}
      </ul>
    </div>
  )
}

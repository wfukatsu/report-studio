/**
 * Searchable, categorized function reference list.
 * Used inside FieldTreePanel's "関数" tab.
 */

import { useState, useMemo, useCallback, useEffect, useRef, forwardRef } from 'react'
import { FORMULA_FUNCTIONS, CATEGORY_LABELS_JA, type FunctionCategory, type FunctionDef } from '@/lib/formula/functionCatalog'

interface FunctionListProps {
  readonly onInsert: (template: string) => void
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

export function FunctionList({ onInsert }: FunctionListProps) {
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all')
  const [search, setSearch] = useState('')
  const [expandedFn, setExpandedFn] = useState<string | null>(null)
  const detailRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => { setExpandedFn(null) }, [search, activeCategory])

  useEffect(() => {
    if (!expandedFn || !detailRef.current) return
    const rafId = requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(rafId)
  }, [expandedFn])

  const handleToggle = useCallback((name: string) => {
    setExpandedFn((prev) => (prev === name ? null : name))
  }, [])

  const handleInsert = useCallback(
    (def: FunctionDef) => {
      onInsert(buildInsertTemplate(def))
      setExpandedFn(null)
    },
    [onInsert],
  )

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

      {/* Function cards */}
      <ul className="flex-1 overflow-y-auto px-2 pb-2" role="listbox" aria-label="関数一覧">
        {filtered.map((def) => {
          const isExpanded = expandedFn === def.name

          return (
            <li key={def.name} role="option" aria-selected={isExpanded}>
              <button
                type="button"
                className={`w-full flex items-center justify-between px-2 py-1.5 text-xs rounded hover:bg-muted/60 transition-colors ${isExpanded ? 'bg-muted' : ''}`}
                onClick={() => handleToggle(def.name)}
                aria-expanded={isExpanded}
                title={`${def.name}(${def.args.map((a) => a.name).join(', ')}) — ${def.labelJa}`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="font-mono font-semibold text-[#6E5DCF]">{def.name}</span>
                  <span className="text-muted-foreground">{def.labelJa}</span>
                </span>
                <span className="text-muted-foreground text-[10px]" aria-hidden="true">
                  {isExpanded ? '▼' : '▶'}
                </span>
              </button>

              {isExpanded && (
                <FunctionDetail ref={detailRef} def={def} onInsert={handleInsert} />
              )}
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

interface FunctionDetailProps {
  readonly def: FunctionDef
  readonly onInsert: (def: FunctionDef) => void
}

const FunctionDetail = forwardRef<HTMLDivElement, FunctionDetailProps>(
  function FunctionDetail({ def, onInsert }, ref) {
    return (
      <div ref={ref} className="mx-2 mb-2 p-2 bg-muted/40 rounded text-[11px] space-y-1.5">
        <p className="text-foreground">{def.descriptionJa}</p>

        {def.args.length > 0 && (
          <div>
            <span className="font-medium text-muted-foreground">引数:</span>
            <ul className="ml-3 mt-0.5 space-y-0.5">
              {def.args.map((arg) => (
                <li key={arg.name} className="flex gap-1">
                  <code className="font-mono text-[#6E5DCF]">{arg.name}</code>
                  <span className="text-muted-foreground">({arg.type})</span>
                  <span>{arg.descriptionJa}{arg.optional && <span className="text-muted-foreground">（任意）</span>}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <span className="font-medium text-muted-foreground">戻り値: </span>
          <span>{def.returnType}</span>
        </div>

        {def.examples.length > 0 && (
          <div>
            <span className="font-medium text-muted-foreground">例:</span>
            <ul className="ml-3 mt-0.5">
              {def.examples.map((ex, i) => (
                <li key={i}>
                  <code className="font-mono">{ex.formula}</code>
                  {ex.result && <span className="text-muted-foreground"> → {ex.result}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="button"
          className="mt-1 px-3 py-1 text-[11px] font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90"
          onClick={(e) => { e.stopPropagation(); onInsert(def) }}
        >
          挿入
        </button>
      </div>
    )
  },
)

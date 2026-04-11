/**
 * Shared UI primitives for element properties panels.
 * These small components are used by all element type PropertiesPanel components.
 */

import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PropSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b pb-3">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-3 pt-3">
        {title}
      </p>
      <div className="px-3 space-y-2">{children}</div>
    </div>
  )
}

export function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

export function NumInput({ value, onChange, min, max, step, unit, inherited, onReset }: {
  value: number; onChange: (v: number) => void
  min?: number; max?: number; step?: number; unit?: string
  /** When true: the value comes from the template default (greyed-out, no reset button). */
  inherited?: boolean
  /** When provided, shows a reset (✕) button that clears the override. */
  onReset?: () => void
}) {
  return (
    <div className="flex items-center gap-1 group">
      <input
        type="number"
        className={cn(
          'border rounded px-2 py-1 text-xs w-full',
          inherited
            ? 'bg-muted text-muted-foreground border-dashed'
            : 'bg-background',
        )}
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {unit && <span className="text-[10px] text-muted-foreground shrink-0">{unit}</span>}
      {/* Use visibility (not display) to prevent layout shift */}
      <button
        style={{ visibility: inherited || !onReset ? 'hidden' : 'visible' }}
        className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
        onClick={onReset}
        tabIndex={inherited || !onReset ? -1 : 0}
        aria-label="デフォルトにリセット"
        type="button"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

export function ColorInput({ value, onChange, label, inherited, onReset }: {
  value: string; onChange: (v: string) => void; label?: string
  inherited?: boolean
  onReset?: () => void
}) {
  return (
    <div className="flex items-center gap-2 group">
      <input
        type="color"
        className="w-8 h-7 rounded border cursor-pointer shrink-0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <input
        type="text"
        className={cn(
          'border rounded px-2 py-1 text-xs flex-1 font-mono',
          inherited
            ? 'bg-muted text-muted-foreground border-dashed'
            : 'bg-background',
        )}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={7}
      />
      {label && <span className="text-[10px] text-muted-foreground shrink-0">{label}</span>}
      <button
        style={{ visibility: inherited || !onReset ? 'hidden' : 'visible' }}
        className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
        onClick={onReset}
        tabIndex={inherited || !onReset ? -1 : 0}
        aria-label="デフォルトにリセット"
        type="button"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

export function SelectInput({ value, onChange, options, inherited, onReset }: {
  value: string; onChange: (v: string) => void
  options: { value: string; label: string }[]
  inherited?: boolean
  onReset?: () => void
}) {
  return (
    <div className="flex items-center gap-1 group">
      <select
        className={cn(
          'border rounded px-2 py-1 text-xs w-full',
          inherited
            ? 'bg-muted text-muted-foreground border-dashed'
            : 'bg-background',
        )}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <button
        style={{ visibility: inherited || !onReset ? 'hidden' : 'visible' }}
        className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
        onClick={onReset}
        tabIndex={inherited || !onReset ? -1 : 0}
        aria-label="デフォルトにリセット"
        type="button"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

export function IconToggle({ active, onClick, title, children }: {
  active: boolean; onClick: () => void; title: string; children: React.ReactNode
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        'flex items-center justify-center w-7 h-7 rounded border text-xs transition-colors',
        active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-accent',
      )}
    >
      {children}
    </button>
  )
}

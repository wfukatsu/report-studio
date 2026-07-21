/**
 * Shared UI primitives for element properties panels.
 * These small components are used by all element type PropertiesPanel components.
 */

import { useRef, useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ColorPickerPopover } from './ColorPickerPopover'

export function PropSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b pb-3">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-3 pt-3">
        {title}
      </p>
      <div className="px-3 space-y-2">{children}</div>
    </div>
  )
}

export function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
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
  const { t } = useTranslation('elements')
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
      {unit && <span className="text-[11px] text-muted-foreground shrink-0">{unit}</span>}
      {/* Use visibility (not display) to prevent layout shift */}
      <button
        style={{ visibility: inherited || !onReset ? 'hidden' : 'visible' }}
        className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
        onClick={onReset}
        tabIndex={inherited || !onReset ? -1 : 0}
        aria-label={t('base.sharedUI.resetToDefault')}
        type="button"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

// Unique ID counter for exclusive popover management
let _colorInputIdCounter = 0

export function ColorInput({ value, onChange, label, inherited, onReset }: {
  value: string; onChange: (v: string) => void; label?: string
  inherited?: boolean
  onReset?: () => void
}) {
  const { t } = useTranslation('elements')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  // Stable id for broadcasting open state to other instances
  const idRef = useRef(++_colorInputIdCounter)

  // Close this popover when another ColorInput opens
  const handleOpen = useCallback(() => {
    window.dispatchEvent(new CustomEvent('color-input-open', { detail: idRef.current }))
    setOpen(true)
  }, [])

  const handleClose = useCallback(() => setOpen(false), [])

  // Listen for other instances opening
  useEffect(() => {
    const listener = (e: Event) => {
      const evt = e as CustomEvent<number>
      if (evt.detail !== idRef.current) setOpen(false)
    }
    window.addEventListener('color-input-open', listener)
    return () => window.removeEventListener('color-input-open', listener)
  }, [])

  const handleChange = useCallback(
    (hex: string) => {
      onChange(hex)
      setOpen(false)
    },
    [onChange],
  )

  return (
    <div className="flex items-center gap-2 group">
      <div ref={containerRef} className="relative">
        <button
          type="button"
          className={cn(
            'flex items-center gap-1 border rounded px-1.5 py-1 h-7 text-xs bg-background hover:bg-accent transition-colors',
            inherited && 'bg-muted border-dashed',
          )}
          onClick={open ? handleClose : handleOpen}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={t('base.sharedUI.openColorPicker')}
        >
          <span
            className="w-4 h-4 rounded border border-border shrink-0"
            style={{ backgroundColor: value }}
          />
          <span className="font-mono text-muted-foreground">{value}</span>
          <ChevronDown className={cn('w-3 h-3 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>
        {open && (
          <ColorPickerPopover
            value={value}
            onChange={handleChange}
            onClose={handleClose}
          />
        )}
      </div>
      {label && <span className="text-[11px] text-muted-foreground shrink-0">{label}</span>}
      <button
        style={{ visibility: inherited || !onReset ? 'hidden' : 'visible' }}
        className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
        onClick={onReset}
        tabIndex={inherited || !onReset ? -1 : 0}
        aria-label={t('base.sharedUI.resetToDefault')}
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
  const { t } = useTranslation('elements')
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
        aria-label={t('base.sharedUI.resetToDefault')}
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

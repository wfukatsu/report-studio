import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Plus, Trash2 } from 'lucide-react'
import { useBrandColors, brandColorName } from '@/hooks/useColorPrefs'
import { isValidHex, expandHex } from '@/lib/colorUtils'
import { cn } from '@/lib/utils'

const MAX_NAME_LENGTH = 20

export interface BrandColorManagerModalProps {
  onClose: () => void
}

export function BrandColorManagerModal({ onClose }: BrandColorManagerModalProps) {
  const { t } = useTranslation('elements')
  const { colors, add, remove, update, isFull } = useBrandColors()
  const dialogRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  const [newHex, setNewHex] = useState('')
  const [newName, setNewName] = useState('')
  const [editingHex, setEditingHex] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const handleClose = () => {
    onClose()
    setTimeout(() => openerRef.current?.focus(), 0)
  }

  // Record opener, set up focus trap and Escape handler
  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        handleClose()
        return
      }
      if (e.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAdd = () => {
    const expanded = expandHex(newHex)
    if (!isValidHex(expanded) || isFull) return
    add({ hex: expanded.toUpperCase(), name: newName.trim() || expanded.toUpperCase() })
    setNewHex('')
    setNewName('')
  }

  const handleStartEdit = (hex: string, name: string) => {
    setEditingHex(hex)
    setEditingName(name)
  }

  const handleSaveEdit = (hex: string) => {
    if (editingHex !== hex) return
    update(hex, { name: editingName.trim() || hex })
    setEditingHex(null)
  }

  const isNewValid = isValidHex(expandHex(newHex))

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="brand-color-manager-title"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div ref={dialogRef} className="bg-background rounded-lg shadow-xl w-72 flex flex-col overflow-hidden max-h-[80vh]">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 id="brand-color-manager-title" className="text-sm font-semibold">
            {t('base.brandColorManager.title')}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded hover:bg-accent p-1"
            aria-label={t('base.brandColorManager.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Color list */}
        <div className="overflow-y-auto flex-1 px-3 py-2 space-y-1">
          {colors.map((c) => (
            <div key={c.hex} className="flex items-center gap-2 group">
              <div
                className="w-5 h-5 rounded border border-border shrink-0"
                style={{ backgroundColor: c.hex }}
              />
              {editingHex === c.hex ? (
                <input
                  type="text"
                  className="flex-1 border rounded px-1 py-0.5 text-xs bg-background focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value.slice(0, MAX_NAME_LENGTH))}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(c.hex) }
                    if (e.key === 'Escape') setEditingHex(null)
                  }}
                  onBlur={() => handleSaveEdit(c.hex)}
                  autoFocus
                  maxLength={MAX_NAME_LENGTH}
                  aria-label={t('base.brandColorManager.editNameLabel', { hex: c.hex })}
                />
              ) : (
                <button
                  type="button"
                  className="flex-1 text-left text-xs truncate hover:text-primary"
                  onClick={() => handleStartEdit(c.hex, brandColorName(c, t))}
                  title={t('base.brandColorManager.editNameTooltip')}
                >
                  {brandColorName(c, t)}
                </button>
              )}
              <span className="text-[10px] text-muted-foreground font-mono shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {c.hex}
              </span>
              <button
                type="button"
                className="shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => remove(c.hex)}
                aria-label={t('base.brandColorManager.deleteColorLabel', { name: brandColorName(c, t) })}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {colors.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">
              {t('base.brandColorManager.empty')}
            </p>
          )}
        </div>

        {/* Add new color */}
        <div className="border-t px-3 py-2 space-y-1.5 shrink-0">
          <p className="text-[10px] text-muted-foreground font-medium">
            {t('base.brandColorManager.addColor')}
            {isFull && <span className="ml-1 text-destructive">{t('base.brandColorManager.limit')}</span>}
          </p>
          <div className="flex gap-1">
            <input
              type="text"
              className={cn(
                'w-[72px] border rounded px-1 py-0.5 text-xs font-mono bg-background focus:outline-none focus-visible:ring-1 focus-visible:ring-primary',
                newHex && !isValidHex(expandHex(newHex)) && 'border-destructive',
              )}
              value={newHex}
              onChange={(e) => setNewHex(e.target.value)}
              placeholder="#RRGGBB"
              maxLength={7}
              onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') handleAdd() }}
              aria-label={t('base.brandColorManager.newHexLabel')}
            />
            <input
              type="text"
              className="flex-1 border rounded px-1 py-0.5 text-xs bg-background focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              value={newName}
              onChange={(e) => setNewName(e.target.value.slice(0, MAX_NAME_LENGTH))}
              placeholder={t('base.brandColorManager.namePlaceholder')}
              maxLength={MAX_NAME_LENGTH}
              onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') handleAdd() }}
              aria-label={t('base.brandColorManager.newNameLabel')}
            />
            <button
              type="button"
              className={cn(
                'rounded border p-1 transition-colors',
                isNewValid && !isFull
                  ? 'text-primary hover:bg-accent'
                  : 'text-muted-foreground opacity-50 cursor-not-allowed',
              )}
              onClick={handleAdd}
              disabled={!isNewValid || isFull}
              aria-label={t('base.brandColorManager.addColor')}
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

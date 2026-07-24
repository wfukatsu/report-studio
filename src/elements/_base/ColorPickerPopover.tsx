import { useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { useDropdownDismiss } from '@/hooks/useDropdownDismiss'
import { useBrandColors, useRecentColors, brandColorName } from '@/hooks/useColorPrefs'
import { Tooltip } from '@/components/common/Tooltip'
import { BrandColorManagerModal } from './BrandColorManagerModal'
import { isValidHex, expandHex, PRESET_COLOR_COLUMNS } from '@/lib/colorUtils'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// ColorSwatch
// ---------------------------------------------------------------------------

interface ColorSwatchProps {
  hex: string
  name?: string
  isActive?: boolean
  onClick: () => void
}

function ColorSwatch({ hex, name, isActive, onClick }: ColorSwatchProps) {
  const { t } = useTranslation('elements')
  const btn = (
    <button
      type="button"
      style={{ backgroundColor: hex }}
      className={cn(
        'w-6 h-6 rounded border border-border hover:scale-110 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        isActive && 'ring-2 ring-primary ring-offset-1',
      )}
      onClick={onClick}
      aria-label={name ? t('base.colorPicker.swatchLabel', { name, hex }) : hex}
    />
  )

  if (name) {
    return (
      <Tooltip content={t('base.colorPicker.swatchTooltip', { name, hex })} placement="top" delay={300}>
        {btn}
      </Tooltip>
    )
  }
  return btn
}

// ---------------------------------------------------------------------------
// PresetColorGrid — Google Slides style 10×6 palette
// ---------------------------------------------------------------------------

interface PresetColorGridProps {
  activeHex: string
  onSelect: (hex: string) => void
}

function PresetColorGrid({ activeHex, onSelect }: PresetColorGridProps) {
  const { t } = useTranslation('elements')
  const numRows = PRESET_COLOR_COLUMNS[0].length

  return (
    <div>
      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide block mb-1.5">
        {t('base.colorPicker.standardColors')}
      </span>
      {/* Render row by row so the grid reads light → dark top to bottom */}
      <div className="flex flex-col gap-0.5">
        {Array.from({ length: numRows }, (_, rowIdx) => (
          <div key={rowIdx} className="flex gap-0.5">
            {PRESET_COLOR_COLUMNS.map((col, colIdx) => {
              const hex = col[rowIdx]
              const isActive = hex.toLowerCase() === activeHex.toLowerCase()
              return (
                <button
                  key={colIdx}
                  type="button"
                  style={{ backgroundColor: hex }}
                  className={cn(
                    'w-5 h-5 border border-border/50 hover:scale-110 transition-transform focus:outline-none focus-visible:ring-1 focus-visible:ring-primary',
                    isActive && 'ring-2 ring-primary ring-offset-1',
                  )}
                  onClick={() => onSelect(hex)}
                  aria-label={hex}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ColorPickerPopover
// ---------------------------------------------------------------------------

export interface ColorPickerPopoverProps {
  value: string
  onChange: (hex: string) => void
  onClose: () => void
}

export function ColorPickerPopover({ value, onChange, onClose }: ColorPickerPopoverProps) {
  const { t } = useTranslation('elements')
  const containerRef = useRef<HTMLDivElement>(null)
  const { colors: brandColors } = useBrandColors()
  const { colors: recentColors, push: pushRecent } = useRecentColors()
  const [customHex, setCustomHex] = useState(value)

  useDropdownDismiss(containerRef, true, onClose)

  const handleSelectColor = useCallback(
    (hex: string) => {
      onChange(hex)
      pushRecent(hex)
      onClose()
    },
    [onChange, pushRecent, onClose],
  )

  const handleCustomConfirm = useCallback(() => {
    const expanded = expandHex(customHex)
    if (!isValidHex(expanded)) return
    onChange(expanded)
    pushRecent(expanded)
    onClose()
  }, [customHex, onChange, pushRecent, onClose])

  const handleCustomKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') { e.preventDefault(); handleCustomConfirm() }
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    },
    [handleCustomConfirm, onClose],
  )

  const isCustomValid = isValidHex(expandHex(customHex))

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label={t('base.colorPicker.dialogLabel')}
      className="absolute z-50 bg-popover border border-border rounded-md shadow-lg p-2 min-w-[192px]"
      style={{ top: '100%', left: 0, marginTop: 4 }}
    >
      {/* Brand colors */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
            {t('base.colorPicker.brandColors')}
          </span>
          <BrandManagerTrigger />
        </div>
        <div className="flex flex-wrap gap-1">
          {brandColors.map((c) => (
            <ColorSwatch
              key={c.hex}
              hex={c.hex}
              name={brandColorName(c, t)}
              isActive={c.hex.toLowerCase() === value.toLowerCase()}
              onClick={() => handleSelectColor(c.hex)}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-border my-1.5" />

      {/* Preset color grid */}
      <div className="mb-2">
        <PresetColorGrid activeHex={value} onSelect={handleSelectColor} />
      </div>

      {/* Recent colors — hidden when empty */}
      {recentColors.length > 0 && (
        <>
          <div className="border-t border-border my-1.5" />
          <div className="mb-2">
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide block mb-1.5">
              {t('base.colorPicker.recentColors')}
            </span>
            <div className="flex flex-wrap gap-1">
              {recentColors.map((hex) => (
                <ColorSwatch
                  key={hex}
                  hex={hex}
                  isActive={hex.toLowerCase() === value.toLowerCase()}
                  onClick={() => handleSelectColor(hex)}
                />
              ))}
            </div>
          </div>
        </>
      )}

      <div className="border-t border-border my-1.5" />

      {/* Custom HEX input */}
      <div className="flex items-center gap-1">
        <input
          type="text"
          className="flex-1 border rounded px-2 py-1 text-xs font-mono bg-background focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          value={customHex}
          onChange={(e) => setCustomHex(e.target.value)}
          onKeyDown={handleCustomKeyDown}
          placeholder="#RRGGBB"
          maxLength={7}
          aria-label={t('base.colorPicker.customInputLabel')}
        />
        <button
          type="button"
          className={cn(
            'rounded border p-1 transition-colors',
            isCustomValid
              ? 'text-primary hover:bg-accent cursor-pointer'
              : 'text-muted-foreground opacity-50 cursor-not-allowed',
          )}
          onClick={handleCustomConfirm}
          disabled={!isCustomValid}
          aria-label={t('base.colorPicker.applyCustom')}
        >
          <Check className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BrandManagerTrigger
// ---------------------------------------------------------------------------

function BrandManagerTrigger() {
  const { t } = useTranslation('elements')
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="text-[10px] text-primary hover:underline"
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
      >
        {t('base.colorPicker.manage')}
      </button>
      {open && <BrandColorManagerModal onClose={() => setOpen(false)} />}
    </>
  )
}

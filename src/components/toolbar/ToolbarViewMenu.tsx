import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  SlidersHorizontal, ChevronDown, Check,
  Grid3X3, Magnet, Crosshair, ScanLine, PanelTop, ArrowUpToLine, ArrowDownToLine,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/common/Tooltip'

/**
 * Consolidates advanced view/layout tools (grid, snap, trim marks, margin guide,
 * header/footer editing, master header/footer) behind a single dropdown so the
 * default toolbar stays focused on basic operations for the non-technical
 * persona (#111). Toggle state is shown with a checkmark.
 */
export interface ToolbarViewMenuProps {
  showGrid: boolean
  toggleGrid: () => void
  snapToGrid: boolean
  toggleSnapToGrid: () => void
  showTrimMarks: boolean
  toggleTrimMarks: () => void
  showMarginGuide: boolean
  toggleMarginGuide: () => void
  headerEditMode: boolean
  toggleHeaderEditMode: () => void
  canEditHeaderFooter: boolean
  hasMasterHeader: boolean
  onToggleMasterHeader: () => void
  hasMasterFooter: boolean
  onToggleMasterFooter: () => void
}

export function ToolbarViewMenu(props: ToolbarViewMenuProps) {
  const { t } = useTranslation('toolbar')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const anyActive = props.showGrid || props.snapToGrid || props.showTrimMarks ||
    props.showMarginGuide || props.headerEditMode

  return (
    <div className="relative" ref={ref}>
      <Tooltip content={t('view.tooltip')} placement="bottom">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={t('view.options')}
          aria-expanded={open}
          aria-haspopup="menu"
          className={cn(
            'flex items-center px-1.5 py-1 rounded text-sm transition-colors shrink-0',
            open || anyActive ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-foreground',
          )}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <ChevronDown className="w-3 h-3 ml-0.5" />
        </button>
      </Tooltip>
      {open && (
        <div role="menu" className="absolute top-full left-0 mt-1 bg-popover border rounded-md shadow-lg z-50 min-w-[220px] py-1">
          <ToggleItem icon={<Grid3X3 className="w-4 h-4" />} label={t('view.showGrid')} active={props.showGrid} onClick={props.toggleGrid} />
          <ToggleItem icon={<Magnet className="w-4 h-4" />} label={t('view.snapToGrid')} active={props.snapToGrid} onClick={props.toggleSnapToGrid} />
          <ToggleItem icon={<Crosshair className="w-4 h-4" />} label={t('view.showTrimMarks')} active={props.showTrimMarks} onClick={props.toggleTrimMarks} />
          <ToggleItem icon={<ScanLine className="w-4 h-4" />} label={t('view.showMarginGuide')} active={props.showMarginGuide} onClick={props.toggleMarginGuide} />
          <div className="border-t my-1" />
          <ToggleItem
            icon={<PanelTop className="w-4 h-4" />}
            label={t('view.headerFooterEditMode')}
            active={props.headerEditMode}
            disabled={!props.canEditHeaderFooter}
            onClick={props.toggleHeaderEditMode}
          />
          <ToggleItem
            icon={<ArrowUpToLine className="w-4 h-4" />}
            label={props.hasMasterHeader ? t('view.deleteMasterHeader') : t('view.createMasterHeader')}
            active={props.hasMasterHeader}
            onClick={props.onToggleMasterHeader}
          />
          <ToggleItem
            icon={<ArrowDownToLine className="w-4 h-4" />}
            label={props.hasMasterFooter ? t('view.deleteMasterFooter') : t('view.createMasterFooter')}
            active={props.hasMasterFooter}
            onClick={props.onToggleMasterFooter}
          />
        </div>
      )}
    </div>
  )
}

function ToggleItem({
  icon, label, active, disabled, onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      role="menuitemcheckbox"
      aria-checked={active}
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <span className="w-3.5 flex justify-center shrink-0">
        {active && <Check className="w-3.5 h-3.5 text-primary" />}
      </span>
      {icon}
      <span className="flex-1 text-left">{label}</span>
    </button>
  )
}

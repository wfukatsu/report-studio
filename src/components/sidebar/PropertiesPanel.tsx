/**
 * PropertiesPanel — thin dispatcher that routes to type-specific properties panels
 * via the element registry (#414). Each element type lives in
 * src/elements/{type}/PropertiesPanel.tsx and is registered in src/elements/registry.ts.
 */

import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/shallow'
import { CopyPlus, Trash2, ShieldAlert } from 'lucide-react'
import { useReportStore, selectActivePage } from '@/store/reportStore'
import { ConditionalDisplayEditor } from './ConditionalDisplayEditor'
import type { OutputVariant } from '@/types'
import { ELEMENT_REGISTRY } from '@/elements/registry'
import type { ElementDef } from '@/elements/elementDef'
import { PropSection, PropRow, NumInput } from '@/elements/_base/sharedUI'
import type { ReportElement } from '@/types'

// Type-specific panel dispatcher — routed through ELEMENT_REGISTRY (#414).
// Exhaustiveness is enforced at compile time by the registry's Record type:
// adding a new element type without an ElementDef fails to compile there.
function renderTypePanel(el: ReportElement, update: (patch: Partial<typeof el>) => void) {
  const def = ELEMENT_REGISTRY[el.type] as unknown as ElementDef | undefined
  if (!def) {
    console.error('Unhandled element type in PropertiesPanel:', el)
    return null
  }
  const TypePanel = def.PropertiesPanel
  return <TypePanel el={el} onChange={update} />
}

// ---------------------------------------------------------------------------
// Shared sections (used across all element types)
// ---------------------------------------------------------------------------

function PositionSizeSection({ el, onChange }: {
  el: { position: { x: number; y: number }; size: { width: number; height: number } }
  onChange: (patch: object) => void
}) {
  const { t } = useTranslation('components')
  return (
    <PropSection title={t('sidebar.propertiesPanel.positionSize')}>
      <div className="grid grid-cols-2 gap-2">
        {(['x', 'y'] as const).map((axis) => (
          <PropRow key={axis} label={axis.toUpperCase() + ' (mm)'}>
            <input type="number" className="border rounded px-2 py-1 text-xs w-full bg-background" value={Math.round(el.position[axis] * 10) / 10} step={0.5} onChange={(e) => onChange({ position: { ...el.position, [axis]: Number(e.target.value) } })} />
          </PropRow>
        ))}
        {(['width', 'height'] as const).map((dim) => (
          <PropRow key={dim} label={(dim === 'width' ? t('sidebar.propertiesPanel.width') : t('sidebar.propertiesPanel.height')) + ' (mm)'}>
            <input type="number" min={1} step={0.5} className="border rounded px-2 py-1 text-xs w-full bg-background" value={Math.round(el.size[dim] * 10) / 10} onChange={(e) => onChange({ size: { ...el.size, [dim]: Number(e.target.value) } })} />
          </PropRow>
        ))}
      </div>
    </PropSection>
  )
}

function ElementCommonSection({ el, onChange }: {
  el: { id: string; name?: string; visible: boolean; locked: boolean; printable?: boolean; conditionalDisplay?: import('@/types').ConditionalDisplay }
  onChange: (patch: object) => void
}) {
  const { t } = useTranslation('components')
  const variants = useReportStore(
    useShallow((s) => s.definition.outputVariants as OutputVariant[]),
  )
  const toggleElementHidden = useReportStore((s) => s.toggleElementHidden)

  return (
    <PropSection title={t('sidebar.propertiesPanel.element')}>
      <PropRow label={t('sidebar.propertiesPanel.name')}>
        <input type="text" className="border rounded px-2 py-1 text-xs w-full bg-background" value={el.name ?? ''} placeholder={t('sidebar.propertiesPanel.namePlaceholder')} onChange={(e) => onChange({ name: e.target.value })} />
      </PropRow>
      <div className="flex gap-4">
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <input type="checkbox" checked={el.visible} onChange={(e) => onChange({ visible: e.target.checked })} className="rounded" />{t('sidebar.propertiesPanel.visible')}
        </label>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <input type="checkbox" checked={el.locked} onChange={(e) => onChange({ locked: e.target.checked })} className="rounded" />{t('sidebar.propertiesPanel.locked')}
        </label>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <input type="checkbox" checked={el.printable ?? true} onChange={(e) => onChange({ printable: e.target.checked })} className="rounded" />{t('sidebar.propertiesPanel.printable')}
        </label>
      </div>
      <ConditionalDisplayEditor
        value={el.conditionalDisplay}
        onChange={(cd) => onChange({ conditionalDisplay: cd })}
      />
      {variants.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{t('sidebar.propertiesPanel.variantHidden')}</div>
          <div className="space-y-1">
            {variants.map((v) => (
              <label key={v.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={v.hiddenElementIds.includes(el.id)}
                  onChange={() => toggleElementHidden(v.id, el.id)}
                />
                <span className="truncate">{v.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </PropSection>
  )
}

// Suppress unused import warning
void NumInput

// ---------------------------------------------------------------------------
// ViolationsSection — shows validation violations for the selected element
// ---------------------------------------------------------------------------

const ViolationsSection = memo(function ViolationsSection({ elementId }: { elementId: string }) {
  const { t } = useTranslation('components')
  const allViolations = useReportStore((s) => s.computedViolations)
  const violations = useMemo(
    () => allViolations.filter((v) => v.elementId === elementId),
    [allViolations, elementId],
  )

  if (violations.length === 0) return null

  return (
    <PropSection title={t('sidebar.propertiesPanel.validationErrors')}>
      <ul className="space-y-1" role="list" aria-label={t('sidebar.propertiesPanel.violationsAria')}>
        {violations.map((v, index) => (
          <li key={`${v.ruleKey}-${index}`} className="text-xs text-destructive flex items-start gap-1">
            <ShieldAlert className="w-3 h-3 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              <span className="font-mono mr-1">{v.ruleKey}:</span>
              {v.message}
            </span>
          </li>
        ))}
      </ul>
    </PropSection>
  )
})

// ---------------------------------------------------------------------------
// Main PropertiesPanel dispatcher
// ---------------------------------------------------------------------------

export function PropertiesPanel() {
  const { t } = useTranslation('components')
  const activePage = useReportStore(selectActivePage)
  const selectedElements = useReportStore(
    useShallow((s) => {
      const page = s.definition.pages.find((p) => p.id === s.selection.activePageId) ?? s.definition.pages[0]
      if (!page || s.selection.selectedElementIds.length === 0) return []
      const allElements = page.sections.flatMap((sec) => sec.elements)
      return allElements.filter((e) => s.selection.selectedElementIds.includes(e.id))
    }),
  )
  const updateElement = useReportStore((s) => s.updateElement)
  const removeElement = useReportStore((s) => s.removeElement)
  const duplicateElement = useReportStore((s) => s.duplicateElement)

  if (!activePage || selectedElements.length === 0) {
    if (!activePage) {
      return <div className="p-4 text-xs text-muted-foreground">{t('sidebar.propertiesPanel.selectPrompt')}</div>
    }
    // ページ設定は右サイドバーの「ページ設定」タブ (PageSettingsPanel) に移動しました
    return (
      <div className="p-4 text-xs text-muted-foreground">
        {t('sidebar.propertiesPanel.selectPrompt')}
        <p className="mt-2">{t('sidebar.propertiesPanel.pageSettingsHint')}</p>
      </div>
    )
  }

  if (selectedElements.length > 1) {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        {t('sidebar.propertiesPanel.multiSelected', { n: selectedElements.length })}
        <p className="mt-2">{t('sidebar.propertiesPanel.multiSelectHint')}</p>
      </div>
    )
  }

  const el = selectedElements[0]
  const update = (patch: Partial<typeof el>) => updateElement(activePage.id, el.id, patch)

  return (
    <div className="text-sm divide-y">
      <PositionSizeSection el={el} onChange={update} />

      {renderTypePanel(el, update)}

      <ElementCommonSection el={el} onChange={update} />

      <ViolationsSection elementId={el.id} />

      <div className="p-3 flex gap-2">
        <button onClick={() => duplicateElement(activePage.id, el.id)} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded border text-xs hover:bg-accent transition-colors">
          <CopyPlus className="w-3.5 h-3.5" />{t('sidebar.propertiesPanel.duplicate')}
        </button>
        <button onClick={() => removeElement(activePage.id, el.id)} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded border border-destructive text-destructive text-xs hover:bg-destructive hover:text-destructive-foreground transition-colors">
          <Trash2 className="w-3.5 h-3.5" />{t('sidebar.propertiesPanel.delete')}
        </button>
      </div>
    </div>
  )
}

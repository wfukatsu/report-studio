/**
 * PropertiesPanel — thin dispatcher that routes to type-specific properties panels.
 * Each element type lives in src/elements/{type}/PropertiesPanel.tsx.
 */

import { memo, useMemo } from 'react'
import { useShallow } from 'zustand/shallow'
import { CopyPlus, Trash2, ShieldAlert } from 'lucide-react'
import { useReportStore, selectActivePage } from '@/store/reportStore'
import { ConditionalDisplayEditor } from './ConditionalDisplayEditor'
import type { OutputVariant } from '@/types'
import { TextPropertiesPanel } from '@/elements/text/PropertiesPanel'
import { DataFieldPropertiesPanel } from '@/elements/dataField/PropertiesPanel'
import { ImagePropertiesPanel } from '@/elements/image/PropertiesPanel'
import { ShapePropertiesPanel } from '@/elements/shape/PropertiesPanel'
import { ChartPropertiesPanel } from '@/elements/chart/PropertiesPanel'
import { BarcodePropertiesPanel } from '@/elements/barcode/PropertiesPanel'
import { ManualEntryPropertiesPanel } from '@/elements/manualEntry/PropertiesPanel'
import { HankoPropertiesPanel } from '@/elements/hanko/PropertiesPanel'
import { ApprovalStampRowPropertiesPanel } from '@/elements/approvalStampRow/PropertiesPanel'
import { RevenueStampPropertiesPanel } from '@/elements/revenueStamp/PropertiesPanel'
import { RepeatingBandPropertiesPanel } from '@/elements/repeatingBand/PropertiesPanel'
import { RepeatingListPropertiesPanel } from '@/elements/repeatingList/PropertiesPanel'
import { FormTablePropertiesPanel } from '@/elements/formTable/PropertiesPanel'
import { CheckboxPropertiesPanel } from '@/elements/checkbox/PropertiesPanel'
import { EraSelectPropertiesPanel } from '@/elements/eraSelect/PropertiesPanel'
import { PageNumberPropertiesPanel } from '@/elements/pageNumber/PropertiesPanel'
import { CurrentDatePropertiesPanel } from '@/elements/currentDate/PropertiesPanel'
import { DividerPropertiesPanel } from '@/elements/divider/PropertiesPanel'
import { TenantCompanyNamePropertiesPanel } from '@/elements/tenantCompanyName/PropertiesPanel'
import { TenantAddressPropertiesPanel } from '@/elements/tenantAddress/PropertiesPanel'
import { TenantPhonePropertiesPanel } from '@/elements/tenantPhone/PropertiesPanel'
import { TenantRepresentativePropertiesPanel } from '@/elements/tenantRepresentative/PropertiesPanel'
import { TenantLogoPropertiesPanel } from '@/elements/tenantLogo/PropertiesPanel'
import { TenantCustomPropertiesPanel } from '@/elements/tenantCustom/PropertiesPanel'
import { PropSection, PropRow, NumInput } from '@/elements/_base/sharedUI'

// ---------------------------------------------------------------------------
// Shared sections (used across all element types)
// ---------------------------------------------------------------------------

function PositionSizeSection({ el, onChange }: {
  el: { position: { x: number; y: number }; size: { width: number; height: number } }
  onChange: (patch: object) => void
}) {
  return (
    <PropSection title="位置・サイズ">
      <div className="grid grid-cols-2 gap-2">
        {(['x', 'y'] as const).map((axis) => (
          <PropRow key={axis} label={axis.toUpperCase() + ' (mm)'}>
            <input type="number" className="border rounded px-2 py-1 text-xs w-full bg-background" value={Math.round(el.position[axis] * 10) / 10} step={0.5} onChange={(e) => onChange({ position: { ...el.position, [axis]: Number(e.target.value) } })} />
          </PropRow>
        ))}
        {(['width', 'height'] as const).map((dim) => (
          <PropRow key={dim} label={(dim === 'width' ? '幅' : '高さ') + ' (mm)'}>
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
  const variants = useReportStore(
    useShallow((s) => s.definition.outputVariants as OutputVariant[]),
  )
  const toggleElementHidden = useReportStore((s) => s.toggleElementHidden)

  return (
    <PropSection title="要素">
      <PropRow label="名前">
        <input type="text" className="border rounded px-2 py-1 text-xs w-full bg-background" value={el.name ?? ''} placeholder="要素名（レイヤー表示用）" onChange={(e) => onChange({ name: e.target.value })} />
      </PropRow>
      <div className="flex gap-4">
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <input type="checkbox" checked={el.visible} onChange={(e) => onChange({ visible: e.target.checked })} className="rounded" />表示
        </label>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <input type="checkbox" checked={el.locked} onChange={(e) => onChange({ locked: e.target.checked })} className="rounded" />ロック
        </label>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <input type="checkbox" checked={el.printable ?? true} onChange={(e) => onChange({ printable: e.target.checked })} className="rounded" />印刷
        </label>
      </div>
      <ConditionalDisplayEditor
        value={el.conditionalDisplay}
        onChange={(cd) => onChange({ conditionalDisplay: cd })}
      />
      {variants.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">バリアント非表示</div>
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
  const allViolations = useReportStore((s) => s.computedViolations)
  const violations = useMemo(
    () => allViolations.filter((v) => v.elementId === elementId),
    [allViolations, elementId],
  )

  if (violations.length === 0) return null

  return (
    <PropSection title="検証エラー">
      <ul className="space-y-1" role="list" aria-label="バリデーション違反">
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
      return <div className="p-4 text-xs text-muted-foreground">要素を選択するとプロパティが表示されます。</div>
    }
    // ページ設定は右サイドバーの「ページ設定」タブ (PageSettingsPanel) に移動しました
    return (
      <div className="p-4 text-xs text-muted-foreground">
        要素を選択するとプロパティが表示されます。
        <p className="mt-2">ページの用紙サイズ・余白などは右サイドバーの「ページ設定」タブで変更できます。</p>
      </div>
    )
  }

  if (selectedElements.length > 1) {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        {selectedElements.length}個の要素を選択中。
        <p className="mt-2">複数選択時はツールバーの整列ツールを使用してください。</p>
      </div>
    )
  }

  const el = selectedElements[0]
  const update = (patch: Partial<typeof el>) => updateElement(activePage.id, el.id, patch)

  return (
    <div className="text-sm divide-y">
      <PositionSizeSection el={el} onChange={update} />

      {el.type === 'text' && <TextPropertiesPanel el={el} onChange={update} />}
      {el.type === 'dataField' && <DataFieldPropertiesPanel el={el} onChange={update} />}
      {el.type === 'shape' && <ShapePropertiesPanel el={el} onChange={update} />}
      {el.type === 'image' && <ImagePropertiesPanel el={el} onChange={update} />}
      {el.type === 'chart' && <ChartPropertiesPanel el={el} onChange={update} />}
      {el.type === 'barcode' && <BarcodePropertiesPanel el={el} onChange={update} />}
      {el.type === 'manualEntry' && <ManualEntryPropertiesPanel el={el} onChange={update} />}
      {el.type === 'hanko' && <HankoPropertiesPanel el={el} onChange={update} />}
      {el.type === 'approvalStampRow' && <ApprovalStampRowPropertiesPanel el={el} onChange={update} />}
      {el.type === 'revenueStamp' && <RevenueStampPropertiesPanel el={el} onChange={update} />}
      {el.type === 'repeatingBand' && <RepeatingBandPropertiesPanel el={el} onChange={update} />}
      {el.type === 'repeatingList' && <RepeatingListPropertiesPanel el={el} onChange={update} />}
      {el.type === 'formTable' && <FormTablePropertiesPanel el={el} onChange={update} />}
      {el.type === 'checkbox' && <CheckboxPropertiesPanel el={el} onChange={update} />}
      {el.type === 'eraSelect' && <EraSelectPropertiesPanel el={el} onChange={update} />}
      {el.type === 'pageNumber' && <PageNumberPropertiesPanel el={el} onChange={update} />}
      {el.type === 'currentDate' && <CurrentDatePropertiesPanel el={el} onChange={update} />}
      {el.type === 'divider' && <DividerPropertiesPanel el={el} onChange={update} />}
      {el.type === 'tenantCompanyName' && <TenantCompanyNamePropertiesPanel el={el} onChange={update} />}
      {el.type === 'tenantAddress' && <TenantAddressPropertiesPanel el={el} onChange={update} />}
      {el.type === 'tenantPhone' && <TenantPhonePropertiesPanel el={el} onChange={update} />}
      {el.type === 'tenantRepresentative' && <TenantRepresentativePropertiesPanel el={el} onChange={update} />}
      {el.type === 'tenantLogo' && <TenantLogoPropertiesPanel el={el} onChange={update} />}
      {el.type === 'tenantCustom' && <TenantCustomPropertiesPanel el={el} onChange={update} />}

      <ElementCommonSection el={el} onChange={update} />

      <ViolationsSection elementId={el.id} />

      <div className="p-3 flex gap-2">
        <button onClick={() => duplicateElement(activePage.id, el.id)} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded border text-xs hover:bg-accent transition-colors">
          <CopyPlus className="w-3.5 h-3.5" />複製
        </button>
        <button onClick={() => removeElement(activePage.id, el.id)} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded border border-destructive text-destructive text-xs hover:bg-destructive hover:text-destructive-foreground transition-colors">
          <Trash2 className="w-3.5 h-3.5" />削除
        </button>
      </div>
    </div>
  )
}

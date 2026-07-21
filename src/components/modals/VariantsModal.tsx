/**
 * VariantsModal — CRUD UI for OutputVariants.
 * Each variant defines which elements to hide and which text to mask.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Trash2, X, Eye, EyeOff, Wand2 } from 'lucide-react'
import { useReportStore } from '@/store/reportStore'
import { useShallow } from 'zustand/shallow'
import type { OutputVariant, MaskingRule } from '@/types'
import { VariantWizard } from './VariantWizard'

interface Props {
  open: boolean
  onClose: () => void
}

export function VariantsModal({ open, onClose }: Props) {
  const { t } = useTranslation('modals')
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={t('variantsModal.ariaLabel')}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-background rounded-lg shadow-xl w-[640px] max-h-[80vh] flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="text-sm font-semibold">{t('variantsModal.title')}</h2>
          <button
            onClick={onClose}
            className="rounded hover:bg-accent p-1"
            aria-label={t('variantsModal.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <VariantList />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Variant list
// ---------------------------------------------------------------------------

export function VariantList() {
  const { t } = useTranslation('modals')
  const variants = useReportStore(
    useShallow((s) => s.definition.outputVariants as OutputVariant[]),
  )
  const removeVariant = useReportStore((s) => s.removeVariant)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [wizardMode, setWizardMode] = useState<
    | { type: 'new' }
    | { type: 'edit'; variant: OutputVariant }
    | null
  >(null)

  return (
    <>
      <div className="space-y-3">
        {/* Add new — opens wizard */}
        <button
          onClick={() => setWizardMode({ type: 'new' })}
          className="flex items-center gap-2 px-3 py-2.5 w-full border-2 border-dashed rounded-md text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors justify-center"
        >
          <Wand2 className="w-3.5 h-3.5" />
          {t('variantsModal.createWithWizard')}
        </button>

        {variants.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            {t('variantsModal.noVariants')}
          </p>
        )}

        {variants.map((v) => (
          <VariantCard
            key={v.id}
            variant={v}
            expanded={expandedId === v.id}
            onToggleExpand={() => setExpandedId(expandedId === v.id ? null : v.id)}
            onRemove={() => removeVariant(v.id)}
            onEdit={() => setWizardMode({ type: 'edit', variant: v })}
          />
        ))}
      </div>

      {/* Wizard overlay */}
      {wizardMode && (
        <VariantWizard
          editVariant={wizardMode.type === 'edit' ? wizardMode.variant : undefined}
          onClose={() => setWizardMode(null)}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Single variant card
// ---------------------------------------------------------------------------

function VariantCard({
  variant,
  expanded,
  onToggleExpand,
  onRemove,
  onEdit,
}: {
  variant: OutputVariant
  expanded: boolean
  onToggleExpand: () => void
  onRemove: () => void
  onEdit: () => void
}) {
  const { t } = useTranslation('modals')
  const updateVariant = useReportStore((s) => s.updateVariant)
  const removeMaskingRule = useReportStore((s) => s.removeMaskingRule)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(variant.name)

  const commitName = () => {
    const trimmed = nameInput.trim()
    if (trimmed && trimmed !== variant.name) updateVariant(variant.id, { name: trimmed })
    else setNameInput(variant.name)
    setEditingName(false)
  }

  return (
    <div className="border rounded-md">
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent/50" onClick={onToggleExpand}>
        {/* Name */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {editingName ? (
            <input
              autoFocus
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setNameInput(variant.name); setEditingName(false) } }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 border-b bg-transparent outline-none text-xs px-0"
            />
          ) : (
            <span className="text-xs font-medium truncate">{variant.name}</span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setEditingName(true); setNameInput(variant.name) }}
            className="p-0.5 rounded hover:bg-accent shrink-0"
            aria-label={t('variantsModal.editName')}
          >
            <Pencil className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0">
          {t('variantsModal.summary', { hidden: variant.hiddenElementIds.length, masked: variant.maskingRules.length })}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit() }}
          className="p-0.5 rounded hover:bg-accent shrink-0"
          aria-label={t('variantsModal.editWithWizard')}
          title={t('variantsModal.editWithWizard')}
        >
          <Wand2 className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="p-0.5 rounded hover:bg-destructive/20 text-destructive shrink-0"
          aria-label={t('variantsModal.deleteVariant')}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="border-t px-3 py-3 space-y-4">
          {/* Target audience */}
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('variantsModal.targetAudience')}</label>
            <input
              type="text"
              defaultValue={variant.targetAudience ?? ''}
              onBlur={(e) => updateVariant(variant.id, { targetAudience: e.target.value || undefined })}
              placeholder={t('variantsModal.targetAudiencePlaceholder')}
              className="mt-1 w-full border rounded px-2 py-1 text-xs bg-background"
            />
          </div>

          {/* Hidden elements */}
          <div>
            <h4 className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">
              {t('variantsModal.hiddenElements', { n: variant.hiddenElementIds.length })}
            </h4>
            <HiddenElementsList variant={variant} />
          </div>

          {/* Masking rules */}
          <div>
            <h4 className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">
              {t('variantsModal.maskingRules', { n: variant.maskingRules.length })}
            </h4>
            {variant.maskingRules.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('variantsModal.noMaskingRules')}</p>
            ) : (
              <div className="space-y-2">
                {variant.maskingRules.map((rule) => (
                  <MaskingRuleRow
                    key={rule.id}
                    variantId={variant.id}
                    rule={rule}
                    onRemove={() => removeMaskingRule(variant.id, rule.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hidden elements list — shows element IDs (names shown if available via store)
// ---------------------------------------------------------------------------

function HiddenElementsList({ variant }: { variant: OutputVariant }) {
  const { t } = useTranslation('modals')
  const pages = useReportStore(useShallow((s) => s.definition.pages))
  const toggleElementHidden = useReportStore((s) => s.toggleElementHidden)

  // Build ID → name map from all pages
  const elementNames = new Map<string, string>()
  for (const page of pages) {
    for (const section of page.sections) {
      for (const el of section.elements) {
        elementNames.set(el.id, el.name ?? el.type)
      }
    }
  }

  if (variant.hiddenElementIds.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t('variantsModal.noHiddenElements')}
      </p>
    )
  }

  return (
    <div className="space-y-1">
      {variant.hiddenElementIds.map((id) => (
        <div key={id} className="flex items-center gap-2 text-xs">
          <EyeOff className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="flex-1 truncate">{elementNames.get(id) ?? id}</span>
          <button
            onClick={() => toggleElementHidden(variant.id, id)}
            className="p-0.5 rounded hover:bg-accent"
            aria-label={t('variantsModal.unhide')}
          >
            <Eye className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single masking rule row
// ---------------------------------------------------------------------------

function MaskingRuleRow({
  variantId,
  rule,
  onRemove,
}: {
  variantId: string
  rule: MaskingRule
  onRemove: () => void
}) {
  const { t } = useTranslation('modals')
  const replaceMaskingRule = useReportStore((s) => s.replaceMaskingRule)
  const pages = useReportStore(useShallow((s) => s.definition.pages))

  const elementNames = new Map<string, string>()
  for (const page of pages) {
    for (const section of page.sections) {
      for (const el of section.elements) {
        elementNames.set(el.id, el.name ?? el.type)
      }
    }
  }

  return (
    <div className="border rounded p-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{t('variantsModal.target')}</span>
        <span className="text-xs font-medium flex-1 truncate">
          {elementNames.get(rule.targetElementId) ?? rule.targetElementId}
        </span>
        <button onClick={onRemove} className="p-0.5 rounded hover:bg-destructive/20 text-destructive">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {rule.type === 'fullReplace' && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{t('variantsModal.replaceValue')}</span>
          <input
            type="text"
            defaultValue={rule.replaceValue}
            onBlur={(e) => {
              replaceMaskingRule(variantId, { ...rule, replaceValue: e.target.value })
            }}
            className="flex-1 border rounded px-1.5 py-0.5 text-xs bg-background"
          />
        </div>
      )}

      {rule.type === 'partial' && (
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground">{t('variantsModal.keepFirst')}</span>
          <input
            type="number"
            min={0}
            max={100}
            defaultValue={rule.keepFirst ?? 0}
            onBlur={(e) => {
              replaceMaskingRule(variantId, { ...rule, keepFirst: Number(e.target.value) })
            }}
            className="w-14 border rounded px-1.5 py-0.5 text-xs bg-background"
          />
          <span className="text-[10px] text-muted-foreground">{t('variantsModal.keepLast')}</span>
          <input
            type="number"
            min={0}
            max={100}
            defaultValue={rule.keepLast ?? 0}
            onBlur={(e) => {
              replaceMaskingRule(variantId, { ...rule, keepLast: Number(e.target.value) })
            }}
            className="w-14 border rounded px-1.5 py-0.5 text-xs bg-background"
          />
        </div>
      )}
    </div>
  )
}

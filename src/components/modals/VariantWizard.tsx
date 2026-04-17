/**
 * VariantWizard — Step-by-step wizard for creating/editing output variants.
 *
 * Steps:
 *   1. 基本情報   — Name + target audience
 *   2. 非表示要素 — Check elements to hide
 *   3. マスキング — Add masking rules per element
 *   4. 確認       — Review before saving
 */

import { useCallback, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Lock,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useReportStore } from '@/store/reportStore'
import { useShallow } from 'zustand/shallow'
import { flattenPageElements } from '@/store/selectors'
import type { MaskingRule, OutputVariant } from '@/types'
import { v4 as uuidv4 } from 'uuid'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = 0 | 1 | 2 | 3

const STEP_LABELS = ['基本情報', '非表示要素', 'マスキング', '確認'] as const

interface WizardDraft {
  name: string
  targetAudience: string
  hiddenElementIds: Set<string>
  maskingRules: MaskingRule[]
}

interface ElementInfo {
  id: string
  name: string
  type: string
  pageLabel: string
}

interface Props {
  /** Pass an existing variant to edit; omit for new creation. */
  readonly editVariant?: OutputVariant
  readonly onClose: () => void
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function VariantWizard({ editVariant, onClose }: Props) {
  const pages = useReportStore(useShallow((s) => s.definition.pages))
  const addVariant = useReportStore((s) => s.addVariant)
  const updateVariant = useReportStore((s) => s.updateVariant)
  const toggleElementHidden = useReportStore((s) => s.toggleElementHidden)
  const addMaskingRule = useReportStore((s) => s.addMaskingRule)
  const removeMaskingRule = useReportStore((s) => s.removeMaskingRule)

  // Flat element list with page labels
  const allElements: ElementInfo[] = useMemo(() => {
    const result: ElementInfo[] = []
    for (const page of pages) {
      for (const el of flattenPageElements(page)) {
        result.push({
          id: el.id,
          name: el.name?.trim() || el.type,
          type: el.type,
          pageLabel: page.name || 'ページ',
        })
      }
    }
    return result
  }, [pages])

  // Draft state (local until final save)
  const [draft, setDraft] = useState<WizardDraft>(() => ({
    name: editVariant?.name ?? '',
    targetAudience: editVariant?.targetAudience ?? '',
    hiddenElementIds: new Set(editVariant?.hiddenElementIds ?? []),
    maskingRules: editVariant?.maskingRules.map((r) => ({ ...r })) ?? [],
  }))

  const [step, setStep] = useState<Step>(0)

  // Step validation
  const canProceed = step === 0 ? draft.name.trim().length > 0 : true

  const handleNext = useCallback(() => {
    if (step < 3) setStep((s) => (s + 1) as Step)
  }, [step])

  const handleBack = useCallback(() => {
    if (step > 0) setStep((s) => (s - 1) as Step)
  }, [step])

  // Save: works with Zustand's sync updates
  const handleSaveNew = useCallback(() => {
    if (editVariant) {
      updateVariant(editVariant.id, {
        name: draft.name.trim(),
        targetAudience: draft.targetAudience.trim() || undefined,
      })
      const currentHidden = new Set(editVariant.hiddenElementIds)
      for (const id of currentHidden) {
        if (!draft.hiddenElementIds.has(id)) toggleElementHidden(editVariant.id, id)
      }
      for (const id of draft.hiddenElementIds) {
        if (!currentHidden.has(id)) toggleElementHidden(editVariant.id, id)
      }
      for (const rule of editVariant.maskingRules) {
        removeMaskingRule(editVariant.id, rule.id)
      }
      for (const rule of draft.maskingRules) {
        addMaskingRule(editVariant.id, rule)
      }
    } else {
      // Create new, then immediately apply settings
      addVariant(draft.name.trim())
      // After sync addVariant, the new variant is the last item in the store
      const currentVariants = useReportStore.getState().definition.outputVariants as OutputVariant[]
      const newV = currentVariants[currentVariants.length - 1]
      if (newV) {
        if (draft.targetAudience.trim()) {
          updateVariant(newV.id, { targetAudience: draft.targetAudience.trim() })
        }
        for (const id of draft.hiddenElementIds) {
          toggleElementHidden(newV.id, id)
        }
        for (const rule of draft.maskingRules) {
          addMaskingRule(newV.id, rule)
        }
      }
    }
    onClose()
  }, [draft, editVariant, updateVariant, toggleElementHidden, removeMaskingRule, addMaskingRule, addVariant, onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="バリアント設定ウィザード"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-background rounded-lg shadow-xl w-[680px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <h2 className="text-sm font-semibold">
            {editVariant ? 'バリアントを編集' : '新しいバリアントを作成'}
          </h2>
          <button onClick={onClose} className="rounded hover:bg-accent p-1" aria-label="閉じる">
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Step indicator */}
        <StepIndicator current={step} />

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 0 && <StepBasicInfo draft={draft} onChange={setDraft} />}
          {step === 1 && <StepHiddenElements draft={draft} onChange={setDraft} elements={allElements} />}
          {step === 2 && <StepMasking draft={draft} onChange={setDraft} elements={allElements} />}
          {step === 3 && <StepReview draft={draft} elements={allElements} />}
        </div>

        {/* Footer navigation */}
        <footer className="flex items-center justify-between px-5 py-3 border-t shrink-0 bg-muted/20">
          <button
            onClick={step === 0 ? onClose : handleBack}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border hover:bg-accent transition-colors"
          >
            {step === 0 ? (
              <>キャンセル</>
            ) : (
              <><ArrowLeft className="w-3.5 h-3.5" />戻る</>
            )}
          </button>

          {step < 3 ? (
            <button
              onClick={handleNext}
              disabled={!canProceed}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors',
                canProceed
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed',
              )}
            >
              次へ<ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handleSaveNew}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              {editVariant ? '保存' : '作成'}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-1 px-5 py-2.5 border-b bg-muted/10 shrink-0">
      {STEP_LABELS.map((label, i) => {
        const isActive = i === current
        const isDone = i < current
        return (
          <div key={label} className="flex items-center gap-1">
            {i > 0 && <div className={cn('w-6 h-px', isDone ? 'bg-primary' : 'bg-border')} />}
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isDone
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {isDone ? <Check className="w-3 h-3" /> : i + 1}
              </span>
              <span
                className={cn(
                  'text-[11px] font-medium',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 1: Basic info
// ---------------------------------------------------------------------------

function StepBasicInfo({
  draft,
  onChange,
}: {
  draft: WizardDraft
  onChange: (d: WizardDraft) => void
}) {
  return (
    <div className="space-y-5 max-w-md">
      <p className="text-xs text-muted-foreground">
        バリアントの基本情報を設定します。バリアントを使うと、同じテンプレートから宛先ごとに異なるPDFを出力できます。
      </p>

      <div>
        <label className="text-xs font-medium text-foreground">
          バリアント名 <span className="text-destructive">*</span>
        </label>
        <input
          autoFocus
          type="text"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="例: 顧客提出用、社内用"
          className="mt-1 w-full border rounded px-3 py-2 text-sm bg-background"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-foreground">対象者（任意）</label>
        <input
          type="text"
          value={draft.targetAudience}
          onChange={(e) => onChange({ ...draft, targetAudience: e.target.value })}
          placeholder="例: 取引先、経営層、監査法人"
          className="mt-1 w-full border rounded px-3 py-2 text-sm bg-background"
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          PDF出力時にバリアントを選ぶ際の参考情報として表示されます。
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2: Hidden elements
// ---------------------------------------------------------------------------

function StepHiddenElements({
  draft,
  onChange,
  elements,
}: {
  draft: WizardDraft
  onChange: (d: WizardDraft) => void
  elements: readonly ElementInfo[]
}) {
  const [search, setSearch] = useState('')

  const toggleHidden = useCallback((id: string) => {
    onChange({
      ...draft,
      hiddenElementIds: (() => {
        const next = new Set(draft.hiddenElementIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })(),
    })
  }, [draft, onChange])

  // Group elements by page
  const grouped = useMemo(() => {
    const map = new Map<string, ElementInfo[]>()
    const q = search.toLowerCase()
    for (const el of elements) {
      if (q && !el.name.toLowerCase().includes(q) && !el.type.toLowerCase().includes(q)) continue
      const arr = map.get(el.pageLabel) ?? []
      arr.push(el)
      map.set(el.pageLabel, arr)
    }
    return map
  }, [elements, search])

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        このバリアントで非表示にする要素を選択してください。チェックした要素はPDF出力時に表示されません。
      </p>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="要素を検索..."
        className="w-full border rounded px-3 py-1.5 text-xs bg-background"
      />

      {/* Selected count */}
      <div className="text-[11px] text-muted-foreground">
        <EyeOff className="w-3 h-3 inline mr-1" />
        {draft.hiddenElementIds.size} 件の要素を非表示に設定
      </div>

      {/* Element list grouped by page */}
      <div className="space-y-3 max-h-[40vh] overflow-y-auto">
        {[...grouped.entries()].map(([pageLabel, els]) => (
          <div key={pageLabel}>
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              {pageLabel}
            </h4>
            <div className="space-y-0.5">
              {els.map((el) => {
                const isHidden = draft.hiddenElementIds.has(el.id)
                return (
                  <label
                    key={el.id}
                    className={cn(
                      'flex items-center gap-2.5 px-2.5 py-1.5 rounded cursor-pointer transition-colors',
                      isHidden ? 'bg-amber-50 border border-amber-200' : 'hover:bg-muted/50',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isHidden}
                      onChange={() => toggleHidden(el.id)}
                      className="accent-amber-500 shrink-0"
                    />
                    {isHidden
                      ? <EyeOff className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      : <Eye className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                    <span className={cn('text-xs flex-1 truncate', isHidden && 'text-amber-700')}>
                      {el.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{el.type}</span>
                  </label>
                )
              })}
            </div>
          </div>
        ))}

        {grouped.size === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            {search ? '該当する要素がありません' : 'テンプレートに要素がありません'}
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 3: Masking
// ---------------------------------------------------------------------------

function StepMasking({
  draft,
  onChange,
  elements,
}: {
  draft: WizardDraft
  onChange: (d: WizardDraft) => void
  elements: readonly ElementInfo[]
}) {
  const [addingFor, setAddingFor] = useState<string | null>(null)

  // Only text-like elements are maskable
  const maskableElements = useMemo(
    () => elements.filter((el) =>
      el.type === 'dataField' || el.type === 'text' || el.type === 'label',
    ),
    [elements],
  )

  const ruledElementIds = new Set(draft.maskingRules.map((r) => r.targetElementId))

  const addRule = useCallback((elementId: string, type: 'fullReplace' | 'partial') => {
    const rule: MaskingRule = type === 'fullReplace'
      ? { id: uuidv4(), targetElementId: elementId, type: 'fullReplace', replaceValue: '***' }
      : { id: uuidv4(), targetElementId: elementId, type: 'partial', keepFirst: 1, keepLast: 0 }
    onChange({ ...draft, maskingRules: [...draft.maskingRules, rule] })
    setAddingFor(null)
  }, [draft, onChange])

  const removeRule = useCallback((ruleId: string) => {
    onChange({ ...draft, maskingRules: draft.maskingRules.filter((r) => r.id !== ruleId) })
  }, [draft, onChange])

  const updateRule = useCallback((ruleId: string, patch: Partial<MaskingRule>) => {
    onChange({
      ...draft,
      maskingRules: draft.maskingRules.map((r) =>
        r.id === ruleId ? { ...r, ...patch } as MaskingRule : r,
      ),
    })
  }, [draft, onChange])

  const elementNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const el of elements) map.set(el.id, el.name)
    return map
  }, [elements])

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        特定の要素の値をマスク（伏せ字）にできます。完全置換または部分マスクから選択してください。
      </p>

      {/* Existing rules */}
      {draft.maskingRules.length > 0 && (
        <div className="space-y-2">
          {draft.maskingRules.map((rule) => (
            <div key={rule.id} className="border rounded-md p-3 space-y-2 bg-muted/20">
              <div className="flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-xs font-medium flex-1 truncate">
                  {elementNameMap.get(rule.targetElementId) ?? rule.targetElementId}
                </span>
                <button
                  onClick={() => removeRule(rule.id)}
                  className="p-0.5 rounded hover:bg-destructive/20 text-destructive"
                  aria-label="ルールを削除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {rule.type === 'fullReplace' && (
                <div className="flex items-center gap-2 ml-5">
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">完全置換:</span>
                  <input
                    type="text"
                    value={rule.replaceValue}
                    onChange={(e) => updateRule(rule.id, { replaceValue: e.target.value })}
                    placeholder="***"
                    className="flex-1 border rounded px-2 py-1 text-xs bg-background"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    例: 山田太郎 → {rule.replaceValue || '***'}
                  </span>
                </div>
              )}

              {rule.type === 'partial' && (
                <div className="flex items-center gap-3 ml-5 flex-wrap">
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">部分マスク:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">先頭</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={rule.keepFirst ?? 0}
                      onChange={(e) => updateRule(rule.id, { keepFirst: Number(e.target.value) })}
                      className="w-12 border rounded px-1.5 py-0.5 text-xs bg-background text-center"
                    />
                    <span className="text-[10px] text-muted-foreground">文字表示</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">末尾</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={rule.keepLast ?? 0}
                      onChange={(e) => updateRule(rule.id, { keepLast: Number(e.target.value) })}
                      className="w-12 border rounded px-1.5 py-0.5 text-xs bg-background text-center"
                    />
                    <span className="text-[10px] text-muted-foreground">文字表示</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    例: 山田太郎 → {previewPartialMask('山田太郎', rule.keepFirst ?? 0, rule.keepLast ?? 0)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add rule button / element picker */}
      {addingFor === null ? (
        <button
          onClick={() => setAddingFor('picking')}
          className="flex items-center gap-1.5 px-3 py-2 border-2 border-dashed rounded-md text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors w-full justify-center"
        >
          <Plus className="w-3.5 h-3.5" />
          マスキングルールを追加
        </button>
      ) : addingFor === 'picking' ? (
        <div className="border rounded-md p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">マスクする要素を選択</span>
            <button onClick={() => setAddingFor(null)} className="p-0.5 rounded hover:bg-accent">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-0.5 max-h-[25vh] overflow-y-auto">
            {maskableElements.filter((el) => !ruledElementIds.has(el.id)).map((el) => (
              <button
                key={el.id}
                onClick={() => setAddingFor(el.id)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left hover:bg-muted/50 transition-colors"
              >
                <Lock className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{el.name}</span>
                <span className="text-[10px] text-muted-foreground">{el.pageLabel}</span>
              </button>
            ))}
            {maskableElements.filter((el) => !ruledElementIds.has(el.id)).length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                マスク可能な要素がありません
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="border rounded-md p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">
              マスクの種類を選択: {elementNameMap.get(addingFor) ?? addingFor}
            </span>
            <button onClick={() => setAddingFor(null)} className="p-0.5 rounded hover:bg-accent">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => addRule(addingFor, 'fullReplace')}
              className="border rounded-md p-3 text-left hover:bg-primary/5 hover:border-primary/40 transition-colors"
            >
              <div className="text-xs font-medium mb-1">完全置換</div>
              <div className="text-[10px] text-muted-foreground">
                値全体を別の文字に置換します
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                例: 山田太郎 → ***
              </div>
            </button>
            <button
              onClick={() => addRule(addingFor, 'partial')}
              className="border rounded-md p-3 text-left hover:bg-primary/5 hover:border-primary/40 transition-colors"
            >
              <div className="text-xs font-medium mb-1">部分マスク</div>
              <div className="text-[10px] text-muted-foreground">
                一部の文字だけ伏せ字にします
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                例: 山田太郎 → 山***
              </div>
            </button>
          </div>
        </div>
      )}

      {draft.maskingRules.length === 0 && addingFor === null && (
        <p className="text-xs text-muted-foreground text-center py-2">
          マスキングルールはありません。必要なければ「次へ」で進んでください。
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 4: Review
// ---------------------------------------------------------------------------

function StepReview({
  draft,
  elements,
}: {
  draft: WizardDraft
  elements: readonly ElementInfo[]
}) {
  const elementNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const el of elements) map.set(el.id, el.name)
    return map
  }, [elements])

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        設定内容を確認してください。問題なければ「作成」をクリックして完了します。
      </p>

      {/* Basic info */}
      <div className="border rounded-md p-3 space-y-2">
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">基本情報</h4>
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <span className="text-muted-foreground">名前:</span>
          <span className="font-medium">{draft.name}</span>
          <span className="text-muted-foreground">対象者:</span>
          <span>{draft.targetAudience || '（未設定）'}</span>
        </div>
      </div>

      {/* Hidden elements */}
      <div className="border rounded-md p-3 space-y-2">
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          非表示要素 ({draft.hiddenElementIds.size})
        </h4>
        {draft.hiddenElementIds.size === 0 ? (
          <p className="text-xs text-muted-foreground">なし</p>
        ) : (
          <div className="space-y-0.5">
            {[...draft.hiddenElementIds].map((id) => (
              <div key={id} className="flex items-center gap-2 text-xs">
                <EyeOff className="w-3 h-3 text-amber-500 shrink-0" />
                <span>{elementNameMap.get(id) ?? id}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Masking rules */}
      <div className="border rounded-md p-3 space-y-2">
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          マスキングルール ({draft.maskingRules.length})
        </h4>
        {draft.maskingRules.length === 0 ? (
          <p className="text-xs text-muted-foreground">なし</p>
        ) : (
          <div className="space-y-1">
            {draft.maskingRules.map((rule) => (
              <div key={rule.id} className="flex items-center gap-2 text-xs">
                <Lock className="w-3 h-3 text-primary shrink-0" />
                <span className="font-medium">
                  {elementNameMap.get(rule.targetElementId) ?? rule.targetElementId}
                </span>
                <span className="text-muted-foreground">—</span>
                <span className="text-muted-foreground">
                  {rule.type === 'fullReplace'
                    ? `完全置換 → "${rule.replaceValue}"`
                    : `部分マスク (先頭${rule.keepFirst ?? 0}文字 / 末尾${rule.keepLast ?? 0}文字)`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function previewPartialMask(sample: string, keepFirst: number, keepLast: number): string {
  const chars = [...sample]
  if (keepFirst + keepLast >= chars.length) return sample
  const start = chars.slice(0, keepFirst).join('')
  const end = chars.slice(chars.length - keepLast).join('')
  const masked = '*'.repeat(Math.max(1, chars.length - keepFirst - keepLast))
  return `${start}${masked}${end}`
}

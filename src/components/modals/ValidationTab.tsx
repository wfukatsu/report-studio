import { lazy, Suspense, useRef, useState } from 'react'
import { useReportStore } from '@/store/reportStore'
import type { ValidationRule } from '@/types'
import { cn } from '@/lib/utils'
import type { UseFormulaEditorReturn } from '@/components/formulaEditor/useFormulaEditor'

const FormulaEditor = lazy(() => import('@/components/formulaEditor/FormulaEditor'))

const SEVERITY_OPTIONS: { value: ValidationRule['severity']; label: string }[] = [
  { value: 'error', label: 'エラー' },
  { value: 'warning', label: '警告' },
]

function RuleRow({
  rule,
  onUpdate,
  onRemove,
}: {
  rule: ValidationRule
  onUpdate: (patch: Partial<ValidationRule>) => void
  onRemove: () => void
}) {
  const [isFocused, setIsFocused] = useState(false)
  const editorRef = useRef<UseFormulaEditorReturn | null>(null)

  return (
    <div className="border border-border rounded-md p-3 space-y-2 bg-card">
      <div className="space-y-1">
        <label className="text-[10px] text-muted-foreground">条件式（真のとき違反）</label>
        {isFocused ? (
          <Suspense
            fallback={
              <div className="border rounded-lg p-2 text-xs text-muted-foreground font-mono min-h-[36px]">
                {rule.condition || 'total < 0'}
              </div>
            }
          >
            <FormulaEditor
              initialValue={rule.condition}
              onChange={(val) => onUpdate({ condition: val })}
              onBlur={() => setIsFocused(false)}
              editorRef={editorRef}
              placeholderText="total < 0"
            />
          </Suspense>
        ) : (
          <button
            type="button"
            className="w-full text-left h-8 px-2 text-xs border border-border rounded bg-background font-mono hover:border-primary/50 transition-colors cursor-text"
            onClick={() => setIsFocused(true)}
          >
            {rule.condition || <span className="text-muted-foreground italic">total &lt; 0</span>}
          </button>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-[10px] text-muted-foreground">メッセージ</label>
        <input
          className="w-full h-6 px-2 text-xs border border-border rounded bg-background"
          value={rule.message}
          onChange={(e) => onUpdate({ message: e.target.value })}
          placeholder="合計金額が不正です"
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">重大度</label>
          <select
            className="h-6 px-1 text-xs border border-border rounded bg-background"
            value={rule.severity}
            onChange={(e) => onUpdate({ severity: e.target.value as ValidationRule['severity'] })}
          >
            {SEVERITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="ml-auto pt-4">
          <button
            onClick={onRemove}
            className="h-6 px-2 text-[10px] text-destructive border border-destructive/30 rounded hover:bg-destructive/10 transition-colors"
          >
            削除
          </button>
        </div>
      </div>

      <div className={cn(
        'text-[10px] px-2 py-1 rounded',
        rule.severity === 'error'
          ? 'bg-destructive/10 text-destructive'
          : 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
      )}>
        {rule.severity === 'error' ? '⛔' : '⚠️'} {rule.severity === 'error' ? 'エクスポートを中断します' : 'エクスポートは続行します（警告のみ）'}
      </div>
    </div>
  )
}

export function ValidationTab() {
  const validationRules = useReportStore((s) => s.definition.validationRules)
  const addValidationRule = useReportStore((s) => s.addValidationRule)
  const updateValidationRule = useReportStore((s) => s.updateValidationRule)
  const removeValidationRule = useReportStore((s) => s.removeValidationRule)

  function handleAdd() {
    addValidationRule({
      id: `rule_${crypto.randomUUID().slice(0, 8)}`,
      condition: '',
      message: '',
      severity: 'error',
    })
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold">バリデーションルール</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            条件式が真のとき違反として報告します。エクスポート前に自動チェックされます。
          </p>
        </div>
        <button
          onClick={handleAdd}
          className="h-6 px-2 text-[10px] bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
        >
          + 追加
        </button>
      </div>

      {validationRules.length === 0 ? (
        <p className="text-[10px] text-muted-foreground py-4 text-center">
          バリデーションルールがありません
        </p>
      ) : (
        <div className="space-y-2">
          {validationRules.map((rule: ValidationRule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              onUpdate={(patch) => updateValidationRule(rule.id, patch)}
              onRemove={() => removeValidationRule(rule.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

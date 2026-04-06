import { useState } from 'react'
import { useReportStore } from '@/store/reportStore'
import type { CalculationRule } from '@/types'
import { cn } from '@/lib/utils'
import { evaluateExpression } from '@/lib/jexlEngine'

const RESULT_TYPES: { value: CalculationRule['resultType']; label: string }[] = [
  { value: 'number', label: '数値' },
  { value: 'string', label: '文字列' },
  { value: 'boolean', label: '真偽値' },
]

const ON_ERROR_OPTIONS: { value: CalculationRule['onError']; label: string }[] = [
  { value: 'zero', label: '0 を返す' },
  { value: 'empty', label: '空文字を返す' },
  { value: 'error_text', label: 'エラーテキストを表示' },
]

function RuleRow({
  rule,
  onUpdate,
  onRemove,
}: {
  rule: CalculationRule
  onUpdate: (patch: Partial<CalculationRule>) => void
  onRemove: () => void
}) {
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    // Read testData imperatively at click time — no reactive subscription needed
    const testData = useReportStore.getState().testData
    try {
      const result = await evaluateExpression(rule.expression, testData)
      setTestResult(String(result))
    } catch (e) {
      setTestResult(`エラー: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="border border-border rounded-md p-3 space-y-2 bg-card">
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <label className="text-[10px] text-muted-foreground">キー</label>
          <input
            className="w-full h-6 px-2 text-xs border border-border rounded bg-background font-mono"
            value={rule.key}
            onChange={(e) => onUpdate({ key: e.target.value })}
            placeholder="calc_total"
          />
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-[10px] text-muted-foreground">ラベル</label>
          <input
            className="w-full h-6 px-2 text-xs border border-border rounded bg-background"
            value={rule.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            placeholder="合計金額"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] text-muted-foreground">JEXL 式</label>
        <input
          className="w-full h-6 px-2 text-xs border border-border rounded bg-background font-mono"
          value={rule.expression}
          onChange={(e) => onUpdate({ expression: e.target.value })}
          placeholder="price * quantity"
        />
      </div>

      <div className="flex gap-2 items-end">
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">型</label>
          <select
            className="h-6 px-1 text-xs border border-border rounded bg-background"
            value={rule.resultType}
            onChange={(e) => onUpdate({ resultType: e.target.value as CalculationRule['resultType'] })}
          >
            {RESULT_TYPES.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">エラー時</label>
          <select
            className="h-6 px-1 text-xs border border-border rounded bg-background"
            value={rule.onError}
            onChange={(e) => onUpdate({ onError: e.target.value as CalculationRule['onError'] })}
          >
            {ON_ERROR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-1 ml-auto">
          <button
            onClick={handleTest}
            disabled={testing}
            className="h-6 px-2 text-[10px] border border-border rounded hover:bg-accent transition-colors"
          >
            {testing ? '…' : 'テスト'}
          </button>
          <button
            onClick={onRemove}
            className="h-6 px-2 text-[10px] text-destructive border border-destructive/30 rounded hover:bg-destructive/10 transition-colors"
          >
            削除
          </button>
        </div>
      </div>

      {testResult !== null && (
        <div className={cn(
          'text-[10px] px-2 py-1 rounded font-mono',
          testResult.startsWith('エラー')
            ? 'bg-destructive/10 text-destructive'
            : 'bg-muted text-foreground',
        )}>
          結果: {testResult}
        </div>
      )}
    </div>
  )
}

export function CalculationTab() {
  const calculationRules = useReportStore((s) => s.definition.calculationRules)
  const addCalculationRule = useReportStore((s) => s.addCalculationRule)
  const updateCalculationRule = useReportStore((s) => s.updateCalculationRule)
  const removeCalculationRule = useReportStore((s) => s.removeCalculationRule)

  function handleAdd() {
    const key = `calc_${crypto.randomUUID().slice(0, 8)}`
    addCalculationRule({
      key,
      label: '新しいルール',
      expression: '',
      resultType: 'number',
      onError: 'zero',
    })
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold">計算ルール</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            JEXL式で計算値を定義します。{'{{calc_key}}'}でテキスト内に埋め込めます。
          </p>
        </div>
        <button
          onClick={handleAdd}
          className="h-6 px-2 text-[10px] bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
        >
          + 追加
        </button>
      </div>

      {calculationRules.length === 0 ? (
        <p className="text-[10px] text-muted-foreground py-4 text-center">
          計算ルールがありません
        </p>
      ) : (
        <div className="space-y-2">
          {calculationRules.map((rule: CalculationRule) => (
            <RuleRow
              key={rule.key}
              rule={rule}
              onUpdate={(patch) => updateCalculationRule(rule.key, patch)}
              onRemove={() => removeCalculationRule(rule.key)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

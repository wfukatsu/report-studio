import { useState, useRef } from 'react'
import { useReportStore } from '@/store/reportStore'
import type {
  CalculationRule,
  CalculationFormat,
  NumberFormatType,
  DateFormatType,
  SchemaField,
} from '@/types'
import { cn } from '@/lib/utils'
import { evaluateExpression } from '@/lib/jexlEngine'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

const NUMBER_FORMAT_OPTIONS: { value: NumberFormatType; label: string }[] = [
  { value: 'integer', label: '整数' },
  { value: 'decimal', label: '小数' },
  { value: 'currency_jpy', label: '円 (¥1,234)' },
  { value: 'currency_usd', label: 'ドル ($1,234.00)' },
  { value: 'percent', label: 'パーセント (12.3%)' },
  { value: 'comma', label: 'カンマ区切り (1,234)' },
  { value: 'kanji_numeral', label: '大字 (金壱百万円也)' },
  { value: 'custom', label: 'カスタム' },
]

const DATE_FORMAT_OPTIONS: { value: DateFormatType; label: string }[] = [
  { value: 'yyyy/MM/dd', label: 'yyyy/MM/dd' },
  { value: 'yyyy年MM月dd日', label: 'yyyy年MM月dd日' },
  { value: 'MM/dd/yyyy', label: 'MM/dd/yyyy' },
  { value: 'wareki_full', label: '和暦 (令和8年4月1日)' },
  { value: 'wareki_short', label: '和暦短縮 (R8.04.01)' },
  { value: 'custom', label: 'カスタム' },
]

const BUILTIN_FUNCTIONS = [
  { name: 'sum(arr)', desc: '配列の合計値' },
  { name: 'count(arr)', desc: '配列の要素数' },
  { name: 'round(value, places)', desc: '小数の丸め' },
]

// ---------------------------------------------------------------------------
// FormatEditor
// ---------------------------------------------------------------------------

function FormatEditor({
  resultType,
  format,
  onUpdate,
}: {
  resultType: CalculationRule['resultType']
  format: CalculationFormat | undefined
  onUpdate: (format: CalculationFormat | undefined) => void
}) {
  if (resultType === 'boolean') return null

  const isNumber = resultType === 'number'
  const formatOptions = isNumber ? NUMBER_FORMAT_OPTIONS : DATE_FORMAT_OPTIONS
  const defaultType = isNumber ? 'integer' : 'yyyy/MM/dd'
  const enabled = format !== undefined

  function handleToggle() {
    if (enabled) {
      onUpdate(undefined)
    } else {
      onUpdate({ type: defaultType as NumberFormatType & DateFormatType })
    }
  }

  function handleTypeChange(value: string) {
    onUpdate({ ...(format ?? { type: defaultType }), type: value as NumberFormatType & DateFormatType })
  }

  function handleDecimalPlacesChange(value: string) {
    const n = parseInt(value, 10)
    onUpdate({ ...(format ?? { type: defaultType }), decimalPlaces: isNaN(n) ? undefined : n })
  }

  function handleCustomPatternChange(value: string) {
    onUpdate({ ...(format ?? { type: defaultType }), customPattern: value })
  }

  const showDecimalPlaces =
    enabled && isNumber && (format?.type === 'decimal' || format?.type === 'currency_usd' || format?.type === 'percent')
  const showCustomPattern = enabled && format?.type === 'custom'

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-muted-foreground">
          {isNumber ? '数値書式' : '日付書式'}
        </label>
        <button
          onClick={handleToggle}
          className={cn(
            'h-4 px-1.5 text-[9px] rounded border transition-colors',
            enabled
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:bg-accent',
          )}
          data-testid="format-toggle"
        >
          {enabled ? '有効' : '設定する'}
        </button>
      </div>

      {enabled && (
        <div className="flex flex-wrap gap-2">
          <select
            className="h-6 px-1 text-xs border border-border rounded bg-background"
            value={format?.type ?? defaultType}
            onChange={(e) => handleTypeChange(e.target.value)}
            data-testid="format-type-select"
          >
            {formatOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {showDecimalPlaces && (
            <div className="flex items-center gap-1">
              <label className="text-[10px] text-muted-foreground">小数点以下</label>
              <input
                type="number"
                min={0}
                max={10}
                className="w-12 h-6 px-1 text-xs border border-border rounded bg-background"
                value={format?.decimalPlaces ?? 2}
                onChange={(e) => handleDecimalPlacesChange(e.target.value)}
                data-testid="format-decimal-places"
              />
              <span className="text-[10px] text-muted-foreground">桁</span>
            </div>
          )}

          {showCustomPattern && (
            <input
              className="flex-1 h-6 px-2 text-xs border border-border rounded bg-background font-mono"
              value={format?.customPattern ?? ''}
              onChange={(e) => handleCustomPatternChange(e.target.value)}
              placeholder="#,##0.00"
              data-testid="format-custom-pattern"
            />
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// VariablePanel
// ---------------------------------------------------------------------------

function VariablePanel({
  currentKey,
  schemaFields,
  otherRuleKeys,
  onInsert,
}: {
  currentKey: string
  schemaFields: { groupLabel: string; field: SchemaField }[]
  otherRuleKeys: string[]
  onInsert: (token: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-t border-border/50 pt-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        data-testid="variable-panel-toggle"
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>利用可能な変数</span>
      </button>

      {open && (
        <div className="mt-1 space-y-1.5" data-testid="variable-panel">
          {schemaFields.length > 0 && (
            <div>
              <p className="text-[9px] text-muted-foreground mb-0.5">スキーマフィールド</p>
              <div className="flex flex-wrap gap-1">
                {schemaFields.map(({ groupLabel, field }) => (
                  <button
                    key={`${groupLabel}.${field.key}`}
                    onClick={() => onInsert(field.key)}
                    className="px-1.5 py-0.5 text-[9px] font-mono bg-muted rounded hover:bg-accent transition-colors"
                    title={`${field.label} (${field.type})`}
                  >
                    {field.key}
                  </button>
                ))}
              </div>
            </div>
          )}

          {otherRuleKeys.length > 0 && (
            <div>
              <p className="text-[9px] text-muted-foreground mb-0.5">他の計算ルール</p>
              <div className="flex flex-wrap gap-1">
                {otherRuleKeys
                  .filter((k) => k !== currentKey)
                  .map((k) => (
                    <button
                      key={k}
                      onClick={() => onInsert(k)}
                      className="px-1.5 py-0.5 text-[9px] font-mono bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
                    >
                      {k}
                    </button>
                  ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-[9px] text-muted-foreground mb-0.5">組み込み関数</p>
            <div className="flex flex-wrap gap-1">
              {BUILTIN_FUNCTIONS.map((fn) => (
                <button
                  key={fn.name}
                  onClick={() => onInsert(fn.name.replace(/\(.*\)/, '('))}
                  className="px-1.5 py-0.5 text-[9px] font-mono bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 rounded hover:bg-green-100 dark:hover:bg-green-900 transition-colors"
                  title={fn.desc}
                >
                  {fn.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// RuleRow
// ---------------------------------------------------------------------------

function RuleRow({
  rule,
  allKeys,
  schemaFields,
  onUpdate,
  onRemove,
}: {
  rule: CalculationRule
  allKeys: string[]
  schemaFields: { groupLabel: string; field: SchemaField }[]
  onUpdate: (patch: Partial<CalculationRule>) => void
  onRemove: () => void
}) {
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const otherRuleKeys = allKeys.filter((k) => k !== rule.key)
  const isDuplicateKey = allKeys.filter((k) => k === rule.key).length > 1

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
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

  function handleInsertToken(token: string) {
    const ta = textareaRef.current
    if (!ta) {
      onUpdate({ expression: rule.expression + token })
      return
    }
    const start = ta.selectionStart ?? rule.expression.length
    const end = ta.selectionEnd ?? rule.expression.length
    const newExpr = rule.expression.slice(0, start) + token + rule.expression.slice(end)
    onUpdate({ expression: newExpr })
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + token.length, start + token.length)
    })
  }

  return (
    <div className="border border-border rounded-md p-3 space-y-2 bg-card">
      {/* Key + Label */}
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <label className="text-[10px] text-muted-foreground">キー</label>
          <input
            className={cn(
              'w-full h-6 px-2 text-xs border rounded bg-background font-mono',
              isDuplicateKey ? 'border-destructive' : 'border-border',
            )}
            value={rule.key}
            onChange={(e) => onUpdate({ key: e.target.value })}
            placeholder="calc_total"
          />
          {isDuplicateKey && (
            <p className="text-[9px] text-destructive">キーが重複しています</p>
          )}
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

      {/* Description */}
      <div className="space-y-1">
        <label className="text-[10px] text-muted-foreground">説明 (任意)</label>
        <input
          className="w-full h-6 px-2 text-xs border border-border rounded bg-background"
          value={rule.description ?? ''}
          onChange={(e) => onUpdate({ description: e.target.value || undefined })}
          placeholder="この計算式の用途を記述します"
          data-testid="description-input"
        />
      </div>

      {/* Expression */}
      <div className="space-y-1">
        <label className="text-[10px] text-muted-foreground">JEXL 式</label>
        <textarea
          ref={textareaRef}
          className="w-full px-2 py-1 text-xs border border-border rounded bg-background font-mono resize-none"
          rows={2}
          value={rule.expression}
          onChange={(e) => onUpdate({ expression: e.target.value })}
          placeholder="price * quantity"
          spellCheck={false}
        />
      </div>

      {/* Result type + onError */}
      <div className="flex gap-2 items-start flex-wrap">
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">型</label>
          <select
            className="h-6 px-1 text-xs border border-border rounded bg-background"
            value={rule.resultType}
            onChange={(e) => {
              const newType = e.target.value as CalculationRule['resultType']
              // Clear format when switching type (number ↔ string formats are incompatible)
              onUpdate({ resultType: newType, format: undefined })
            }}
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
        <div className="flex gap-1 ml-auto items-end">
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

      {/* Format editor */}
      <FormatEditor
        resultType={rule.resultType}
        format={rule.format}
        onUpdate={(format) => onUpdate({ format })}
      />

      {/* Variable reference panel */}
      <VariablePanel
        currentKey={rule.key}
        schemaFields={schemaFields}
        otherRuleKeys={otherRuleKeys}
        onInsert={handleInsertToken}
      />

      {/* Test result */}
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

// ---------------------------------------------------------------------------
// CalculationTab
// ---------------------------------------------------------------------------

export function CalculationTab() {
  const calculationRules = useReportStore((s) => s.definition.calculationRules)
  const schema = useReportStore((s) => s.definition.schema)
  const addCalculationRule = useReportStore((s) => s.addCalculationRule)
  const updateCalculationRule = useReportStore((s) => s.updateCalculationRule)
  const removeCalculationRule = useReportStore((s) => s.removeCalculationRule)

  // Flatten schema fields for variable reference panel
  const schemaFields: { groupLabel: string; field: SchemaField }[] =
    schema?.groups.flatMap((g) =>
      g.fields.map((f) => ({ groupLabel: g.label, field: f })),
    ) ?? []

  const allKeys = calculationRules.map((r) => r.key)

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
              allKeys={allKeys}
              schemaFields={schemaFields}
              onUpdate={(patch) => updateCalculationRule(rule.key, patch)}
              onRemove={() => removeCalculationRule(rule.key)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

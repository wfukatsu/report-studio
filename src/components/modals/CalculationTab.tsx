import { lazy, memo, Suspense, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { resolveTaxRates } from '@/lib/taxRates'
import { FORMULA_FUNCTIONS } from '@/lib/formula/functionCatalog'
import { formulaToJexl } from '@/lib/formula/expression/formulaToJexl'
import type { UseFormulaEditorReturn } from '@/components/formulaEditor/useFormulaEditor'
import { FormulaStatusBar } from '@/components/formulaEditor/FormulaStatusBar'
import { FormulaToolbar } from '@/components/formulaEditor/FormulaToolbar'
import { createFormulaLinter, setValidation } from '@/lib/formula/editor'
import type { FormulaValidationState } from '@/lib/formula/editor'
import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'

const FormulaEditor = lazy(() => import('@/components/formulaEditor/FormulaEditor'))

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RESULT_TYPES = [
  { value: 'number', label: 'calculationTab.resultType.number' },
  { value: 'string', label: 'calculationTab.resultType.string' },
  { value: 'boolean', label: 'calculationTab.resultType.boolean' },
] as const satisfies readonly { value: CalculationRule['resultType']; label: string }[]

const ON_ERROR_OPTIONS = [
  { value: 'zero', label: 'calculationTab.onError.zero' },
  { value: 'empty', label: 'calculationTab.onError.empty' },
  { value: 'error_text', label: 'calculationTab.onError.errorText' },
] as const satisfies readonly { value: CalculationRule['onError']; label: string }[]

const NUMBER_FORMAT_OPTIONS = [
  { value: 'integer', label: 'calculationTab.numberFormat.integer' },
  { value: 'decimal', label: 'calculationTab.numberFormat.decimal' },
  { value: 'currency_jpy', label: 'calculationTab.numberFormat.currencyJpy' },
  { value: 'currency_usd', label: 'calculationTab.numberFormat.currencyUsd' },
  { value: 'percent', label: 'calculationTab.numberFormat.percent' },
  { value: 'comma', label: 'calculationTab.numberFormat.comma' },
  { value: 'kanji_numeral', label: 'calculationTab.numberFormat.kanjiNumeral' },
  { value: 'custom', label: 'calculationTab.numberFormat.custom' },
] as const satisfies readonly { value: NumberFormatType; label: string }[]

const DATE_FORMAT_OPTIONS = [
  { value: 'yyyy/MM/dd', label: 'calculationTab.dateFormat.slash' },
  { value: 'yyyy年MM月dd日', label: 'calculationTab.dateFormat.japanese' },
  { value: 'MM/dd/yyyy', label: 'calculationTab.dateFormat.usSlash' },
  { value: 'wareki_full', label: 'calculationTab.dateFormat.warekiFull' },
  { value: 'wareki_short', label: 'calculationTab.dateFormat.warekiShort' },
  { value: 'custom', label: 'calculationTab.dateFormat.custom' },
] as const satisfies readonly { value: DateFormatType; label: string }[]

// JEXL_BUILTINS is the single source of truth — imported from jexlEngine

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
  const { t } = useTranslation('modals')
  if (resultType === 'boolean') return null

  const isNumber = resultType === 'number'
  const formatOptions = isNumber ? NUMBER_FORMAT_OPTIONS : DATE_FORMAT_OPTIONS
  const defaultType: NumberFormatType | DateFormatType = isNumber ? 'integer' : 'yyyy/MM/dd'
  const enabled = format !== undefined

  // Single helper to patch any format field — avoids repeating the spread
  function patch(fields: Partial<CalculationFormat>) {
    onUpdate({ ...(format ?? { type: defaultType }), ...fields })
  }

  const showDecimalPlaces =
    enabled && isNumber && (format?.type === 'decimal' || format?.type === 'currency_usd' || format?.type === 'percent')
  const showCustomPattern = enabled && format?.type === 'custom'

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-muted-foreground">
          {isNumber ? t('calculationTab.numberFormatLabel') : t('calculationTab.dateFormatLabel')}
        </label>
        <button
          onClick={() => enabled ? onUpdate(undefined) : onUpdate({ type: defaultType })}
          className={cn(
            'h-4 px-1.5 text-[9px] rounded border transition-colors',
            enabled
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:bg-accent',
          )}
          data-testid="format-toggle"
        >
          {enabled ? t('calculationTab.formatEnabled') : t('calculationTab.formatSet')}
        </button>
      </div>

      {enabled && (
        <div className="flex flex-wrap gap-2">
          <select
            className="h-6 px-1 text-xs border border-border rounded bg-background"
            value={format?.type ?? defaultType}
            onChange={(e) => patch({ type: e.target.value as NumberFormatType | DateFormatType })}
            data-testid="format-type-select"
          >
            {formatOptions.map((o) => (
              <option key={o.value} value={o.value}>{t(o.label)}</option>
            ))}
          </select>

          {showDecimalPlaces && (
            <div className="flex items-center gap-1">
              <label className="text-[10px] text-muted-foreground">{t('calculationTab.decimalPlaces')}</label>
              <input
                type="number"
                min={0}
                max={10}
                className="w-12 h-6 px-1 text-xs border border-border rounded bg-background"
                value={format?.decimalPlaces ?? 2}
                onChange={(e) => { const n = parseInt(e.target.value, 10); patch({ decimalPlaces: isNaN(n) ? undefined : n }) }}
                data-testid="format-decimal-places"
              />
              <span className="text-[10px] text-muted-foreground">{t('calculationTab.digitsUnit')}</span>
            </div>
          )}

          {showCustomPattern && (
            <input
              className="flex-1 h-6 px-2 text-xs border border-border rounded bg-background font-mono"
              value={format?.customPattern ?? ''}
              onChange={(e) => patch({ customPattern: e.target.value })}
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
  schemaFields,
  otherRuleKeys,
  onInsert,
}: {
  /** Already excludes the current rule's key — no re-filtering needed. */
  schemaFields: { groupLabel: string; field: SchemaField }[]
  otherRuleKeys: string[]
  onInsert: (token: string) => void
}) {
  const { t } = useTranslation('modals')
  const [open, setOpen] = useState(false)

  return (
    <div className="border-t border-border/50 pt-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        data-testid="variable-panel-toggle"
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>{t('calculationTab.availableVariables')}</span>
      </button>

      {open && (
        <div className="mt-1 space-y-1.5" data-testid="variable-panel">
          {schemaFields.length > 0 && (
            <div>
              <p className="text-[9px] text-muted-foreground mb-0.5">{t('calculationTab.schemaFields')}</p>
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
              <p className="text-[9px] text-muted-foreground mb-0.5">{t('calculationTab.otherRules')}</p>
              <div className="flex flex-wrap gap-1">
                {otherRuleKeys.map((k) => (
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
            <p className="text-[9px] text-muted-foreground mb-0.5">{t('calculationTab.builtinFunctions')}</p>
            <div className="flex flex-wrap gap-1">
              {FORMULA_FUNCTIONS.map((fn) => (
                <button
                  key={fn.name}
                  onClick={() => onInsert(`${fn.name}(`)}
                  className="px-1.5 py-0.5 text-[9px] font-mono bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 rounded hover:bg-green-100 dark:hover:bg-green-900 transition-colors"
                  title={fn.descriptionJa}
                >
                  {fn.name}({fn.args.map(a => a.name).join(', ')})
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

const RuleRow = memo(function RuleRow({
  rule,
  allKeys,
  duplicateKeySet,
  schemaFields,
  testData,
  peerRuleExpressions,
  onUpdate,
  onRemove,
}: {
  rule: CalculationRule
  allKeys: string[]
  peerRuleExpressions: ReadonlyMap<string, string>
  duplicateKeySet: Set<string>
  schemaFields: { groupLabel: string; field: SchemaField }[]
  testData: Record<string, unknown>
  onUpdate: (patch: Partial<CalculationRule>) => void
  onRemove: () => void
}) {
  const { t } = useTranslation('modals')
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [validationState, setValidationState] = useState<FormulaValidationState | undefined>()
  const editorRef = useRef<UseFormulaEditorReturn | null>(null)

  // Race #5: only depend on peer rule keys, not full calculationRules
  const otherRuleKeys = useMemo(
    () => allKeys.filter((k) => k !== rule.key),
    [allKeys, rule.key],
  )
  const isDuplicateKey = duplicateKeySet.has(rule.key)

  // Hoisted out of the isFocused-conditional JSX — hooks must run on every render
  const dynamicExtensions = useMemo((): Extension[] => [
    createFormulaLinter({
      currentKey: rule.key,
      peerRuleExpressions,
    }),
    EditorView.updateListener.of((update) => {
      for (const tr of update.transactions) {
        for (const effect of tr.effects) {
          if (effect.is(setValidation)) {
            setValidationState(effect.value)
          }
        }
      }
    }),
  ], [rule.key, peerRuleExpressions])

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      // Translate formula-v1 to JEXL for evaluation
      const jexlExpr = formulaToJexl(rule.expression)
      const result = await evaluateExpression(jexlExpr, testData)
      setTestResult(String(result))
    } catch (e) {
      setTestResult(`エラー: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setTesting(false)
    }
  }

  function handleInsertToken(token: string) {
    if (editorRef.current) {
      editorRef.current.insertAtCursor(token)
    } else {
      // Fallback for when editor is not focused (static mode)
      onUpdate({ expression: rule.expression + token })
    }
  }

  return (
    <div className="border border-border rounded-md p-3 space-y-2 bg-card">
      {/* Key + Label */}
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <label className="text-[10px] text-muted-foreground">{t('calculationTab.key')}</label>
          <input
            className={cn(
              'w-full h-6 px-2 text-xs border rounded bg-background font-mono',
              isDuplicateKey ? 'border-destructive' : 'border-border',
            )}
            value={rule.key}
            pattern="[a-zA-Z_][a-zA-Z0-9_]*"
            onChange={(e) => onUpdate({ key: e.target.value })}
            placeholder="calc_total"
          />
          {isDuplicateKey && (
            <p className="text-[9px] text-destructive">{t('calculationTab.duplicateKey')}</p>
          )}
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-[10px] text-muted-foreground">{t('calculationTab.label')}</label>
          <input
            className="w-full h-6 px-2 text-xs border border-border rounded bg-background"
            value={rule.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            placeholder={t('calculationTab.labelPlaceholder')}
          />
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1">
        <label className="text-[10px] text-muted-foreground">{t('calculationTab.description')}</label>
        <input
          className="w-full h-6 px-2 text-xs border border-border rounded bg-background"
          value={rule.description ?? ''}
          onChange={(e) => onUpdate({ description: e.target.value || undefined })}
          placeholder={t('calculationTab.descriptionPlaceholder')}
          data-testid="description-input"
        />
      </div>

      {/* Expression — focus-only CM6 virtualization (Performance #2) */}
      <div className="space-y-1">
        <label className="text-[10px] text-muted-foreground">{t('calculationTab.expression')}</label>
        {isFocused ? (
          <Suspense
            fallback={
              <div className="border rounded-lg p-2 text-xs text-muted-foreground font-mono min-h-[40px]">
                {rule.expression || t('calculationTab.expressionPlaceholder')}
              </div>
            }
          >
            <FormulaEditor
              initialValue={rule.expression}
              dynamicExtensions={dynamicExtensions}
              onChange={(val) => onUpdate({ expression: val })}
              onBlur={() => setIsFocused(false)}
              editorRef={editorRef}
            />
            <FormulaToolbar onInsertFunction={handleInsertToken} />
            <FormulaStatusBar validationState={validationState} />
          </Suspense>
        ) : (
          <button
            type="button"
            className="w-full text-left px-2 py-1.5 text-xs border border-border rounded bg-background font-mono min-h-[40px] hover:border-primary/50 transition-colors cursor-text"
            onClick={() => setIsFocused(true)}
          >
            {rule.expression || <span className="text-muted-foreground italic">{t('calculationTab.expressionPlaceholder')}</span>}
          </button>
        )}
      </div>

      {/* Result type + onError */}
      <div className="flex gap-2 items-start flex-wrap">
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">{t('calculationTab.resultTypeLabel')}</label>
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
              <option key={o.value} value={o.value}>{t(o.label)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">{t('calculationTab.onErrorLabel')}</label>
          <select
            className="h-6 px-1 text-xs border border-border rounded bg-background"
            value={rule.onError}
            onChange={(e) => onUpdate({ onError: e.target.value as CalculationRule['onError'] })}
          >
            {ON_ERROR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{t(o.label)}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-1 ml-auto items-end">
          <button
            onClick={handleTest}
            disabled={testing}
            className="h-6 px-2 text-[10px] border border-border rounded hover:bg-accent transition-colors"
          >
            {testing ? '…' : t('calculationTab.test')}
          </button>
          <button
            onClick={onRemove}
            className="h-6 px-2 text-[10px] text-destructive border border-destructive/30 rounded hover:bg-destructive/10 transition-colors"
          >
            {t('calculationTab.remove')}
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
          {t('calculationTab.result')}{testResult}
        </div>
      )}
    </div>
  )
})

// ---------------------------------------------------------------------------
// CalculationTab
// ---------------------------------------------------------------------------

export function CalculationTab() {
  const { t } = useTranslation('modals')
  const calculationRules = useReportStore((s) => s.definition.calculationRules)
  const schema = useReportStore((s) => s.definition.schema)
  const testData = useReportStore((s) => s.testData)
  const tenantInfo = useReportStore((s) => s.tenantInfo)
  const addCalculationRule = useReportStore((s) => s.addCalculationRule)
  const updateCalculationRule = useReportStore((s) => s.updateCalculationRule)
  const removeCalculationRule = useReportStore((s) => s.removeCalculationRule)

  // Memoized: stable reference across renders when schema unchanged
  const schemaFields = useMemo<{ groupLabel: string; field: SchemaField }[]>(
    () =>
      schema?.groups.flatMap((g) =>
        g.fields.map((f) => ({ groupLabel: g.label, field: f })),
      ) ?? [],
    [schema],
  )

  // Memoized: stable reference across renders when rules unchanged
  const allKeys = useMemo(
    () => calculationRules.map((r) => r.key),
    [calculationRules],
  )

  // Pre-compute peer rule expressions for cycle detection (Race #5: only keys + expressions, not full rules)
  const peerRuleExpressionsByKey = useMemo(
    () => new Map(calculationRules.map((r) => [r.key, r.expression])),
    [calculationRules],
  )

  // Inject the tenant tax-rate map so the local "test" button matches the server
  // eval, which seeds `taxRates` into every calculation context (#333).
  const testDataWithRates = useMemo(
    () => ({ ...testData, taxRates: resolveTaxRates(tenantInfo) }),
    [testData, tenantInfo],
  )

  // O(n) duplicate detection — passed to each RuleRow for O(1) lookup
  const duplicateKeySet = useMemo(() => {
    const seen = new Set<string>()
    const dupes = new Set<string>()
    for (const k of allKeys) {
      if (seen.has(k)) { dupes.add(k) } else { seen.add(k) }
    }
    return dupes
  }, [allKeys])

  function handleAdd() {
    const id = crypto.randomUUID()
    const key = `calc_${id.slice(0, 8)}`
    addCalculationRule({
      id,
      key,
      label: t('calculationTab.newRuleLabel'),
      expression: '',
      resultType: 'number',
      onError: 'zero',
    })
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold">{t('calculationTab.heading')}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {t('calculationTab.headingDescription', { calcKey: '{{calc_key}}' })}
          </p>
        </div>
        <button
          onClick={handleAdd}
          className="h-6 px-2 text-[10px] bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
        >
          {t('calculationTab.add')}
        </button>
      </div>

      {calculationRules.length === 0 ? (
        <p className="text-[10px] text-muted-foreground py-4 text-center">
          {t('calculationTab.empty')}
        </p>
      ) : (
        <div className="space-y-2">
          {calculationRules.map((rule) => (
            <RuleRow
              key={rule.id ?? rule.key}
              rule={rule}
              allKeys={allKeys}
              duplicateKeySet={duplicateKeySet}
              schemaFields={schemaFields}
              testData={testDataWithRates}
              peerRuleExpressions={peerRuleExpressionsByKey}
              onUpdate={(patch) => updateCalculationRule(rule.key, patch)}
              onRemove={() => removeCalculationRule(rule.key)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

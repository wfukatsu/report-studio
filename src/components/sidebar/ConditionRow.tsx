/**
 * ConditionRow — a single condition row within ConditionalDisplayEditor.
 * Renders: fieldPath | operator | value (hidden for nullary ops) | delete button.
 */

import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import type { ParseKeys } from 'i18next'
import type { DisplayCondition, ConditionOperator, NullaryOperator } from '@/types'

// ---------------------------------------------------------------------------
// Operator labels
// `as const satisfies` keeps `labelKey` as literal key types so `t(o.labelKey)`
// stays type-checked.
// ---------------------------------------------------------------------------

const OPERATOR_OPTIONS = [
  { value: 'equals',      labelKey: 'sidebar.conditionRow.opEquals' },
  { value: 'not_equals',  labelKey: 'sidebar.conditionRow.opNotEquals' },
  { value: 'greater_than', labelKey: 'sidebar.conditionRow.opGreaterThan' },
  { value: 'less_than',   labelKey: 'sidebar.conditionRow.opLessThan' },
  { value: 'contains',    labelKey: 'sidebar.conditionRow.opContains' },
  { value: 'not_contains', labelKey: 'sidebar.conditionRow.opNotContains' },
  { value: 'empty',       labelKey: 'sidebar.conditionRow.opEmpty' },
  { value: 'not_empty',   labelKey: 'sidebar.conditionRow.opNotEmpty' },
] as const satisfies readonly { value: ConditionOperator; labelKey: ParseKeys<'components'> }[]

const NULLARY_OPS = new Set<ConditionOperator>(['empty', 'not_empty'])

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FieldOption {
  value: string
  label: string
}

interface ConditionRowProps {
  condition: DisplayCondition
  fieldOptions: FieldOption[]
  onChange: (updated: DisplayCondition) => void
  onRemove: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ConditionRow = memo(function ConditionRow({
  condition,
  fieldOptions,
  onChange,
  onRemove,
}: ConditionRowProps) {
  const { t } = useTranslation('components')
  const isNullary = NULLARY_OPS.has(condition.operator)

  function handleOperatorChange(op: ConditionOperator) {
    const isNewNullary = NULLARY_OPS.has(op)
    if (isNewNullary) {
      onChange({ id: condition.id, fieldPath: condition.fieldPath, operator: op as NullaryOperator })
    } else {
      onChange({
        id: condition.id,
        fieldPath: condition.fieldPath,
        operator: op as Exclude<ConditionOperator, NullaryOperator>,
        value: 'value' in condition ? condition.value : '',
      })
    }
  }

  return (
    <div className="flex items-center gap-1" role="group" aria-label={t('sidebar.conditionRow.conditionRowLabel')}>
      {/* fieldPath */}
      {fieldOptions.length > 0 ? (
        <select
          className="border rounded px-1 py-0.5 text-xs bg-background flex-1 min-w-0"
          value={condition.fieldPath}
          onChange={(e) => onChange({ ...condition, fieldPath: e.target.value })}
          aria-label={t('sidebar.conditionRow.field')}
        >
          <option value="">{t('sidebar.conditionRow.selectField')}</option>
          {fieldOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          className="border rounded px-1 py-0.5 text-xs bg-background flex-1 min-w-0 font-mono"
          value={condition.fieldPath}
          onChange={(e) => onChange({ ...condition, fieldPath: e.target.value })}
          placeholder={t('sidebar.conditionRow.fieldPath')}
          aria-label={t('sidebar.conditionRow.fieldPath')}
        />
      )}

      {/* operator */}
      <select
        className="border rounded px-1 py-0.5 text-xs bg-background shrink-0"
        value={condition.operator}
        onChange={(e) => handleOperatorChange(e.target.value as ConditionOperator)}
        aria-label={t('sidebar.conditionRow.operator')}
      >
        {OPERATOR_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
        ))}
      </select>

      {/* value — hidden for nullary operators */}
      {!isNullary && (
        <input
          type="text"
          className="border rounded px-1 py-0.5 text-xs bg-background w-20 shrink-0"
          value={'value' in condition ? String(condition.value) : ''}
          onChange={(e) => onChange({ ...condition, value: e.target.value } as DisplayCondition)}
          placeholder={t('sidebar.conditionRow.value')}
          aria-label={t('sidebar.conditionRow.compareValue')}
        />
      )}

      {/* delete */}
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
        aria-label={t('sidebar.conditionRow.removeCondition')}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
})

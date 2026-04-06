/**
 * ConditionRow — a single condition row within ConditionalDisplayEditor.
 * Renders: fieldPath | operator | value (hidden for nullary ops) | delete button.
 */

import { memo } from 'react'
import { X } from 'lucide-react'
import type { DisplayCondition, ConditionOperator, NullaryOperator } from '@/types'

// ---------------------------------------------------------------------------
// Operator labels
// ---------------------------------------------------------------------------

const OPERATOR_OPTIONS: { value: ConditionOperator; label: string }[] = [
  { value: 'equals',      label: '等しい' },
  { value: 'not_equals',  label: '等しくない' },
  { value: 'greater_than', label: 'より大きい' },
  { value: 'less_than',   label: 'より小さい' },
  { value: 'contains',    label: '含む' },
  { value: 'not_contains', label: '含まない' },
  { value: 'empty',       label: '空である' },
  { value: 'not_empty',   label: '空でない' },
]

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
    <div className="flex items-center gap-1" role="group" aria-label="条件行">
      {/* fieldPath */}
      {fieldOptions.length > 0 ? (
        <select
          className="border rounded px-1 py-0.5 text-xs bg-background flex-1 min-w-0"
          value={condition.fieldPath}
          onChange={(e) => onChange({ ...condition, fieldPath: e.target.value })}
          aria-label="フィールド"
        >
          <option value="">-- フィールドを選択 --</option>
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
          placeholder="フィールドパス"
          aria-label="フィールドパス"
        />
      )}

      {/* operator */}
      <select
        className="border rounded px-1 py-0.5 text-xs bg-background shrink-0"
        value={condition.operator}
        onChange={(e) => handleOperatorChange(e.target.value as ConditionOperator)}
        aria-label="演算子"
      >
        {OPERATOR_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* value — hidden for nullary operators */}
      {!isNullary && (
        <input
          type="text"
          className="border rounded px-1 py-0.5 text-xs bg-background w-20 shrink-0"
          value={'value' in condition ? String(condition.value) : ''}
          onChange={(e) => onChange({ ...condition, value: e.target.value } as DisplayCondition)}
          placeholder="値"
          aria-label="比較値"
        />
      )}

      {/* delete */}
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
        aria-label="条件を削除"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
})

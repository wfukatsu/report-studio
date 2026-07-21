/**
 * ConditionalDisplayEditor — AND/OR visibility condition editor.
 * Renders a logic toggle (AND/OR) and a list of ConditionRow components.
 * Designed to be embedded in the PropertiesPanel's ElementCommonSection.
 */

import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import type { ConditionalDisplay } from '@/types'
import { useSchemaFieldOptions } from '@/hooks/useSchemaFieldOptions'
import { ConditionRow } from './ConditionRow'
import type { FieldOption } from './ConditionRow'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ConditionalDisplayEditorProps {
  value: ConditionalDisplay | undefined
  onChange: (cd: ConditionalDisplay | undefined) => void
  /** Override field options (defaults to schema-derived options) */
  fieldOptions?: FieldOption[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyDisplay(): ConditionalDisplay {
  return { logic: 'and', conditions: [] }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ConditionalDisplayEditor = memo(function ConditionalDisplayEditor({
  value,
  onChange,
  fieldOptions: fieldOptionsProp,
}: ConditionalDisplayEditorProps) {
  const { t } = useTranslation('components')
  const schemaOptions = useSchemaFieldOptions()
  const fieldOptions = fieldOptionsProp ?? schemaOptions
  const cd = value ?? emptyDisplay()

  function addCondition() {
    onChange({
      ...cd,
      conditions: [
        ...cd.conditions,
        { id: uuidv4(), fieldPath: '', operator: 'equals', value: '' },
      ],
    })
  }

  function updateCondition(id: string, updated: ConditionalDisplay['conditions'][number]) {
    onChange({
      ...cd,
      conditions: cd.conditions.map((c) => (c.id === id ? updated : c)),
    })
  }

  function removeCondition(id: string) {
    const next = cd.conditions.filter((c) => c.id !== id)
    // If no conditions remain and there was no original value, collapse to undefined
    onChange(next.length === 0 && !value ? undefined : { ...cd, conditions: next })
  }

  function setLogic(logic: 'and' | 'or') {
    onChange({ ...cd, logic })
  }

  return (
    <fieldset className="border-0 p-0 m-0 space-y-1.5">
      <legend className="text-[10px] text-muted-foreground mb-1">{t('sidebar.conditionalDisplayEditor.displayCondition')}</legend>

      {/* Logic toggle + add button */}
      <div className="flex items-center gap-2">
        <div role="radiogroup" aria-label={t('sidebar.conditionalDisplayEditor.combineLogic')} className="flex gap-1">
          {(['and', 'or'] as const).map((l) => (
            <label
              key={l}
              className={`flex items-center gap-0.5 text-xs cursor-pointer px-2 py-0.5 rounded border transition-colors ${
                cd.logic === l
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground hover:bg-accent border-input'
              }`}
            >
              <input
                type="radio"
                name="cd-logic"
                value={l}
                checked={cd.logic === l}
                onChange={() => setLogic(l)}
                className="sr-only"
              />
              {l.toUpperCase()}
            </label>
          ))}
        </div>

        <button
          type="button"
          onClick={addCondition}
          className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
          aria-label={t('sidebar.conditionalDisplayEditor.addCondition')}
        >
          <Plus className="w-3 h-3" />
          {t('sidebar.conditionalDisplayEditor.addConditionShort')}
        </button>
      </div>

      {/* Condition rows */}
      <div className="space-y-1">
        {cd.conditions.map((c) => (
          <ConditionRow
            key={c.id}
            condition={c}
            fieldOptions={fieldOptions}
            onChange={(updated) => updateCondition(c.id, updated)}
            onRemove={() => removeCondition(c.id)}
          />
        ))}
        {cd.conditions.length === 0 && (
          <p className="text-[10px] text-muted-foreground italic">{t('sidebar.conditionalDisplayEditor.noConditions')}</p>
        )}
      </div>
    </fieldset>
  )
})

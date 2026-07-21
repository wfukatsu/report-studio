/**
 * Quick-insert toolbar for frequently used formula functions.
 * Renders 4 buttons: SUM, AVG, IF, ROUND.
 */

import { useTranslation } from 'react-i18next'

interface FormulaToolbarProps {
  readonly onInsertFunction: (template: string) => void
}

const QUICK_FUNCTIONS = [
  { label: 'SUM', template: 'SUM()', hintKey: 'formulaEditor.formulaToolbar.hintSum' },
  { label: 'AVG', template: 'AVG()', hintKey: 'formulaEditor.formulaToolbar.hintAvg' },
  { label: 'IF', template: 'IF(, , )', hintKey: 'formulaEditor.formulaToolbar.hintIf' },
  { label: 'ROUND', template: 'ROUND(, )', hintKey: 'formulaEditor.formulaToolbar.hintRound' },
] as const

export function FormulaToolbar({ onInsertFunction }: FormulaToolbarProps) {
  const { t } = useTranslation('components')
  return (
    <div className="flex gap-1 px-2 py-1 border-t border-border" role="toolbar" aria-label={t('formulaEditor.formulaToolbar.toolbarLabel')}>
      {QUICK_FUNCTIONS.map(({ label, template, hintKey }) => (
        <button
          key={label}
          type="button"
          className="px-2 py-0.5 text-[11px] font-mono font-medium text-[#6E5DCF] bg-violet-50 hover:bg-violet-100 rounded transition-colors"
          onClick={() => onInsertFunction(template)}
          title={`${label} — ${t(hintKey)}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

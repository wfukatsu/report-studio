/**
 * Quick-insert toolbar for frequently used formula functions.
 * Renders 4 buttons: SUM, AVG, IF, ROUND.
 */

interface FormulaToolbarProps {
  readonly onInsertFunction: (template: string) => void
}

const QUICK_FUNCTIONS = [
  { label: 'SUM', template: 'SUM()', hint: '合計' },
  { label: 'AVG', template: 'AVG()', hint: '平均' },
  { label: 'IF', template: 'IF(, , )', hint: '条件' },
  { label: 'ROUND', template: 'ROUND(, )', hint: '四捨五入' },
] as const

export function FormulaToolbar({ onInsertFunction }: FormulaToolbarProps) {
  return (
    <div className="flex gap-1 px-2 py-1 border-t border-border" role="toolbar" aria-label="よく使う関数">
      {QUICK_FUNCTIONS.map(({ label, template, hint }) => (
        <button
          key={label}
          type="button"
          className="px-2 py-0.5 text-[11px] font-mono font-medium text-[#6E5DCF] bg-violet-50 hover:bg-violet-100 rounded transition-colors"
          onClick={() => onInsertFunction(template)}
          title={`${label} — ${hint}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

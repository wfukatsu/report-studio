/**
 * SummaryBar — Bottom bar showing binding statistics with group color legend.
 */

import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { getGroupColor } from '../types'
import type { SchemaGroup } from '@/types'

interface SummaryBarProps {
  readonly bound: number
  readonly total: number
  readonly unbound: number
  readonly groups: readonly SchemaGroup[]
  readonly groupIndexMap: ReadonlyMap<string, number>
}

export const SummaryBar = memo(function SummaryBar({
  bound,
  total,
  unbound,
  groups,
  groupIndexMap,
}: SummaryBarProps) {
  const { t } = useTranslation('components')
  return (
    <div className="flex items-center gap-4 px-4 py-2 border-t bg-muted/20 shrink-0 text-xs">
      {/* Binding stats */}
      <div className="flex items-center gap-2">
        <span className={cn(
          'px-2 py-0.5 rounded-full font-medium',
          unbound === 0
            ? 'bg-green-100 text-green-700'
            : 'bg-amber-100 text-amber-700',
        )}>
          {t('bindingEditor.summaryBar.resolved', { bound, total })}
        </span>
        {unbound > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
            {t('bindingEditor.summaryBar.unbound', { n: unbound })}
          </span>
        )}
      </div>

      {/* Group color legend */}
      <div className="flex items-center gap-3 ml-auto">
        {groups.map((group) => {
          const index = groupIndexMap.get(group.id) ?? 0
          return (
            <div key={group.id} className="flex items-center gap-1">
              <span
                className="inline-block w-3 h-1 rounded-full"
                style={{ backgroundColor: getGroupColor(index) }}
              />
              <span className="text-muted-foreground">{group.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
})

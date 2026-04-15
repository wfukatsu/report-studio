/**
 * SummaryBar — Bottom bar showing binding statistics.
 */

import { memo } from 'react'
import { cn } from '@/lib/utils'

interface SummaryBarProps {
  readonly bound: number
  readonly total: number
  readonly unbound: number
}

export const SummaryBar = memo(function SummaryBar({
  bound,
  total,
  unbound,
}: SummaryBarProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-1.5 border-t bg-muted/10 shrink-0 text-[10px]">
      <span className={cn(
        'px-2 py-0.5 rounded-full font-medium',
        unbound === 0
          ? 'bg-green-100 text-green-700'
          : 'bg-amber-100 text-amber-700',
      )}>
        {bound}/{total} 解決済み
      </span>
      {unbound > 0 && (
        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
          {unbound} 未バインド
        </span>
      )}
    </div>
  )
})

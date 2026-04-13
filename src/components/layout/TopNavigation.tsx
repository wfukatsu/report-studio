import type { AppTab } from '@/store/types'
import { useTopTabNavigation } from '@/hooks/useTopTabNavigation'
import { cn } from '@/lib/utils'

const TABS: { id: AppTab; label: string }[] = [
  { id: 'design', label: 'デザイン' },
  { id: 'data', label: 'データ管理' },
  { id: 'templates', label: 'テンプレート管理' },
]

interface TopNavigationProps {
  readonly activeTab: AppTab
  readonly onTabChange: (tab: AppTab) => void
}

export function TopNavigation({ activeTab, onTabChange }: TopNavigationProps) {
  const { getTabProps } = useTopTabNavigation({
    tabs: TABS.map((t) => t.id),
    selectedTab: activeTab,
    onSelect: onTabChange,
  })

  return (
    <nav
      role="tablist"
      aria-label="メインナビゲーション"
      aria-orientation="horizontal"
      className="flex items-end border-b bg-card shrink-0 px-2"
    >
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          {...getTabProps(id)}
          className={cn(
            'px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap border-b-2 -mb-px',
            activeTab === id
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30',
          )}
        >
          {label}
        </button>
      ))}
    </nav>
  )
}

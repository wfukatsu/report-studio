import { useRef, useCallback } from 'react'
import type { KeyboardEvent } from 'react'
import type { AppTab } from '@/store/types'
import { cn } from '@/lib/utils'

const TABS: { id: AppTab; label: string }[] = [
  { id: 'design', label: 'デザイン' },
  { id: 'binding', label: 'バインド' },
  { id: 'templates', label: 'テンプレート管理' },
  { id: 'responses', label: '回答' },
  { id: 'databrowser', label: 'データブラウザ' },
]

const TAB_IDS: AppTab[] = TABS.map((t) => t.id)

interface TopNavigationProps {
  readonly activeTab: AppTab
  readonly onTabChange: (tab: AppTab) => void
}

export function TopNavigation({ activeTab, onTabChange }: TopNavigationProps) {
  const tabRefs = useRef<Map<AppTab, HTMLButtonElement | null>>(new Map())

  const focusTab = useCallback((tab: AppTab) => {
    tabRefs.current.get(tab)?.focus()
  }, [])

  const handleKeyDown = useCallback(
    (currentTabId: AppTab) => (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.nativeEvent.isComposing) return
      const idx = TAB_IDS.indexOf(currentTabId)
      let targetIdx: number | null = null
      switch (e.key) {
        case 'ArrowLeft':  targetIdx = idx === 0 ? TAB_IDS.length - 1 : idx - 1; break
        case 'ArrowRight': targetIdx = idx === TAB_IDS.length - 1 ? 0 : idx + 1; break
        case 'Home':       targetIdx = 0; break
        case 'End':        targetIdx = TAB_IDS.length - 1; break
        case 'Enter': case ' ':
          e.preventDefault(); onTabChange(currentTabId); return
        default: return
      }
      e.preventDefault()
      if (targetIdx !== null) focusTab(TAB_IDS[targetIdx])
    },
    [focusTab, onTabChange],
  )

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
          role="tab"
          id={`top-tab-${id}`}
          aria-selected={activeTab === id}
          aria-controls={`top-panel-${id}`}
          tabIndex={activeTab === id ? 0 : -1}
          onKeyDown={handleKeyDown(id)}
          onClick={() => onTabChange(id)}
          ref={(el) => { tabRefs.current.set(id, el) }}
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

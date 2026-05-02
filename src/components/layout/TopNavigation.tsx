import { useRef, useCallback, useMemo } from 'react'
import type { KeyboardEvent } from 'react'
import type { AppTab } from '@/store/types'
import { cn } from '@/lib/utils'

/**
 * One entry in the top-nav `tabs` prop. Either a focusable tab or a
 * vertical separator that visually groups adjacent tabs without joining
 * the keyboard-navigation ring.
 *
 * Backward-compat: `kind` defaults to `'tab'` when omitted by a caller, so
 * existing test fixtures and configurations that pass plain `{ id, label }`
 * objects continue to work. New code should set `kind: 'tab'` explicitly so
 * the discriminated union narrows cleanly.
 */
export type TopNavTab = { kind?: 'tab'; id: AppTab; label: string }
export type TopNavSeparator = { kind: 'separator' }
export type TopNavItem = TopNavTab | TopNavSeparator

interface TopNavigationProps {
  readonly activeTab: AppTab
  readonly onTabChange: (tab: AppTab) => void
  /** Ordered list of tabs and separators. Constructed by AppShell to support role-based filtering and visual grouping. */
  readonly tabs: readonly TopNavItem[]
}

function isTab(item: TopNavItem): item is TopNavTab {
  return item.kind !== 'separator'
}

function isSeparator(item: TopNavItem): item is TopNavSeparator {
  return item.kind === 'separator'
}

export function TopNavigation({ activeTab, onTabChange, tabs }: TopNavigationProps) {
  // Memoize so `useCallback` consumers downstream see a stable array reference
  // across renders that don't change the tabs prop (the prop is a module-level
  // constant in AppShell, so this effectively runs once per mount).
  const tabIds = useMemo(() => tabs.filter(isTab).map((t) => t.id), [tabs])
  const tabRefs = useRef<Map<AppTab, HTMLButtonElement | null>>(new Map())

  const focusTab = useCallback((tab: AppTab) => {
    tabRefs.current.get(tab)?.focus()
  }, [])

  const handleKeyDown = useCallback(
    (currentTabId: AppTab) => (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.nativeEvent.isComposing) return
      const idx = tabIds.indexOf(currentTabId)
      let targetIdx: number | null = null
      switch (e.key) {
        case 'ArrowLeft':  targetIdx = idx === 0 ? tabIds.length - 1 : idx - 1; break
        case 'ArrowRight': targetIdx = idx === tabIds.length - 1 ? 0 : idx + 1; break
        case 'Home':       targetIdx = 0; break
        case 'End':        targetIdx = tabIds.length - 1; break
        case 'Enter': case ' ':
          e.preventDefault(); onTabChange(currentTabId); return
        default: return
      }
      e.preventDefault()
      if (targetIdx !== null) focusTab(tabIds[targetIdx])
    },
    [tabIds, focusTab, onTabChange],
  )

  return (
    <nav
      role="tablist"
      aria-label="メインナビゲーション"
      aria-orientation="horizontal"
      className="flex items-end border-b bg-card shrink-0 px-2"
    >
      {tabs.map((item, index) => {
        if (isSeparator(item)) {
          return (
            <span
              key={`sep-${index}`}
              role="separator"
              aria-orientation="vertical"
              className="self-center mx-2 h-4 w-px bg-border"
            />
          )
        }
        const { id, label } = item
        return (
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
        )
      })}
    </nav>
  )
}

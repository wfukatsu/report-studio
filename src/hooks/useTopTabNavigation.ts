import { useRef, useCallback } from 'react'
import type { KeyboardEvent } from 'react'
import type { AppTab } from '@/store/types'

interface UseTopTabNavigationOptions {
  tabs: AppTab[]
  selectedTab: AppTab
  onSelect: (tab: AppTab) => void
}

interface TabProps {
  role: 'tab'
  id: string
  'aria-selected': boolean
  'aria-controls': string
  tabIndex: number
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
  onClick: () => void
  ref: (el: HTMLButtonElement | null) => void
}

export function useTopTabNavigation({
  tabs,
  selectedTab,
  onSelect,
}: UseTopTabNavigationOptions) {
  const tabRefs = useRef<Map<AppTab, HTMLButtonElement | null>>(new Map())

  const focusTab = useCallback((tab: AppTab) => {
    tabRefs.current.get(tab)?.focus()
  }, [])

  const handleKeyDown = useCallback(
    (currentTabId: AppTab) => (e: KeyboardEvent<HTMLButtonElement>) => {
      // 日本語IME変換中はショートカットを無効化
      if (e.nativeEvent.isComposing) return

      const idx = tabs.indexOf(currentTabId)
      let targetIdx: number | null = null

      switch (e.key) {
        case 'ArrowLeft':
          targetIdx = idx === 0 ? tabs.length - 1 : idx - 1
          break
        case 'ArrowRight':
          targetIdx = idx === tabs.length - 1 ? 0 : idx + 1
          break
        case 'Home':
          targetIdx = 0
          break
        case 'End':
          targetIdx = tabs.length - 1
          break
        case 'Enter':
        case ' ':
          // マニュアルアクティベーション: Enter/Space でのみ選択確定
          e.preventDefault()
          onSelect(currentTabId)
          return
        default:
          return
      }

      e.preventDefault()
      // フォーカス移動のみ（アクティベートしない）
      if (targetIdx !== null) {
        focusTab(tabs[targetIdx])
      }
    },
    [tabs, focusTab, onSelect],
  )

  const getTabProps = useCallback(
    (tabId: AppTab): TabProps => ({
      role: 'tab' as const,
      id: `top-tab-${tabId}`,
      'aria-selected': tabId === selectedTab,
      'aria-controls': `top-panel-${tabId}`,
      // Roving tabindex: 選択中タブのみ tabIndex=0
      tabIndex: tabId === selectedTab ? 0 : -1,
      onKeyDown: handleKeyDown(tabId),
      onClick: () => onSelect(tabId),
      ref: (el: HTMLButtonElement | null) => tabRefs.current.set(tabId, el),
    }),
    [selectedTab, handleKeyDown, onSelect],
  )

  return { getTabProps }
}

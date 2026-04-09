/**
 * Manages localStorage-backed preferences for builtin templates.
 * Allows hiding builtin templates and overriding their category/tags
 * without modifying the hardcoded template data.
 */

import { useSyncExternalStore, useCallback } from 'react'

const STORAGE_KEY = 'rds2:builtin-template-prefs'

interface BuiltinOverride {
  category?: string
  tags?: string[]
}

interface BuiltinPrefs {
  hidden: string[]
  overrides: Record<string, BuiltinOverride>
}

const DEFAULT_PREFS: BuiltinPrefs = { hidden: [], overrides: {} }

function readPrefs(): BuiltinPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PREFS
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_PREFS
  }
}

function writePrefs(prefs: BuiltinPrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  // Dispatch storage event so all subscribers update
  window.dispatchEvent(new Event('builtin-prefs-change'))
}

// External store for useSyncExternalStore
let cachedPrefs = readPrefs()

function subscribe(callback: () => void): () => void {
  const handler = () => {
    cachedPrefs = readPrefs()
    callback()
  }
  window.addEventListener('builtin-prefs-change', handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener('builtin-prefs-change', handler)
    window.removeEventListener('storage', handler)
  }
}

function getSnapshot(): BuiltinPrefs {
  return cachedPrefs
}

export function useBuiltinPrefs() {
  const prefs = useSyncExternalStore(subscribe, getSnapshot)

  const hideTemplate = useCallback((id: string) => {
    const current = readPrefs()
    if (current.hidden.includes(id)) return
    writePrefs({ ...current, hidden: [...current.hidden, id] })
  }, [])

  const showTemplate = useCallback((id: string) => {
    const current = readPrefs()
    writePrefs({ ...current, hidden: current.hidden.filter((h) => h !== id) })
  }, [])

  const toggleHidden = useCallback((id: string) => {
    const current = readPrefs()
    const isHidden = current.hidden.includes(id)
    writePrefs({
      ...current,
      hidden: isHidden ? current.hidden.filter((h) => h !== id) : [...current.hidden, id],
    })
  }, [])

  const setOverride = useCallback((id: string, override: BuiltinOverride) => {
    const current = readPrefs()
    const existing = current.overrides[id] ?? {}
    writePrefs({
      ...current,
      overrides: { ...current.overrides, [id]: { ...existing, ...override } },
    })
  }, [])

  const clearOverride = useCallback((id: string) => {
    const current = readPrefs()
    const { [id]: _, ...rest } = current.overrides
    writePrefs({ ...current, overrides: rest })
  }, [])

  const isHidden = useCallback((id: string) => prefs.hidden.includes(id), [prefs.hidden])

  const getOverride = useCallback((id: string) => prefs.overrides[id], [prefs.overrides])

  return {
    prefs,
    hideTemplate,
    showTemplate,
    toggleHidden,
    isHidden,
    setOverride,
    clearOverride,
    getOverride,
  }
}

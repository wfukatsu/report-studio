/**
 * Manages localStorage-backed color preferences:
 *   - Brand colors (rds2:brandColors): named palette, max 12 entries
 *   - Recent colors (rds2:recentColors): auto-tracked MRU list, max 8 entries
 *
 * Implemented with useSyncExternalStore over localStorage + a custom
 * change event so every consumer re-renders on any update.
 */

import { useSyncExternalStore, useCallback } from 'react'
import type { ParseKeys, TFunction } from 'i18next'

const BRAND_KEY = 'rds2:brandColors'
const RECENT_KEY = 'rds2:recentColors'
const MAX_BRAND = 12
const MAX_RECENT = 8
const CHANGE_EVENT = 'color-prefs-change'

export interface BrandColor {
  hex: string
  /** User-given name. Empty for untouched default colors (see nameKey). */
  name: string
  /**
   * i18n key (`elements` namespace) for the default palette names (#410).
   * Resolved at display time via {{brandColorName}} so the default names
   * follow language switches; a user-entered `name` always wins.
   */
  nameKey?: ParseKeys<'elements'>
}

export const DEFAULT_BRAND_COLORS: BrandColor[] = [
  { hex: '#000000', name: '', nameKey: 'base.brandColors.black' },
  { hex: '#FFFFFF', name: '', nameKey: 'base.brandColors.white' },
  { hex: '#1E40AF', name: '', nameKey: 'base.brandColors.blue' },
  { hex: '#DC2626', name: '', nameKey: 'base.brandColors.red' },
  { hex: '#16A34A', name: '', nameKey: 'base.brandColors.green' },
  { hex: '#D97706', name: '', nameKey: 'base.brandColors.amber' },
]

/**
 * Display name for a brand color: user-given name → localized default name
 * → hex fallback. `t` must be bound to the `elements` namespace.
 */
export function brandColorName(color: BrandColor, t: TFunction<'elements'>): string {
  if (color.name) return color.name
  if (color.nameKey) return t(color.nameKey)
  return color.hex
}

// ---------------------------------------------------------------------------
// Read / write helpers
// ---------------------------------------------------------------------------

function readBrandColors(): BrandColor[] {
  try {
    const raw = localStorage.getItem(BRAND_KEY)
    if (!raw) return DEFAULT_BRAND_COLORS
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_BRAND_COLORS
    return parsed as BrandColor[]
  } catch {
    return DEFAULT_BRAND_COLORS
  }
}

function writeBrandColors(colors: BrandColor[]): void {
  try {
    localStorage.setItem(BRAND_KEY, JSON.stringify(colors))
  } catch {
    // QuotaExceededError or disabled localStorage — continue in-memory only
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function readRecentColors(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as string[]
  } catch {
    return []
  }
}

function writeRecentColors(colors: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(colors))
  } catch {
    // silent fail
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

// ---------------------------------------------------------------------------
// External store (shared module-level cache)
// ---------------------------------------------------------------------------

let cachedBrand = readBrandColors()
let cachedRecent = readRecentColors()

function subscribe(callback: () => void): () => void {
  const handler = () => {
    cachedBrand = readBrandColors()
    cachedRecent = readRecentColors()
    callback()
  }
  window.addEventListener(CHANGE_EVENT, handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}

function getBrandSnapshot(): BrandColor[] { return cachedBrand }
function getRecentSnapshot(): string[] { return cachedRecent }

/** Re-reads localStorage into the module-level cache. Used in tests only. */
export function _resetColorPrefsCache(): void {
  cachedBrand = readBrandColors()
  cachedRecent = readRecentColors()
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useBrandColors() {
  const colors = useSyncExternalStore(subscribe, getBrandSnapshot)

  const add = useCallback((color: BrandColor) => {
    const current = readBrandColors()
    if (current.length >= MAX_BRAND) return
    if (current.some((c) => c.hex.toLowerCase() === color.hex.toLowerCase())) return
    writeBrandColors([...current, color])
  }, [])

  const remove = useCallback((hex: string) => {
    const current = readBrandColors()
    writeBrandColors(current.filter((c) => c.hex.toLowerCase() !== hex.toLowerCase()))
  }, [])

  const update = useCallback((hex: string, patch: Partial<BrandColor>) => {
    const current = readBrandColors()
    writeBrandColors(
      current.map((c) =>
        c.hex.toLowerCase() === hex.toLowerCase() ? { ...c, ...patch } : c,
      ),
    )
  }, [])

  return {
    colors,
    add,
    remove,
    update,
    isFull: colors.length >= MAX_BRAND,
  }
}

export function useRecentColors() {
  const colors = useSyncExternalStore(subscribe, getRecentSnapshot)

  /** Add a hex color to the front of the MRU list. Existing duplicates are moved to front. */
  const push = useCallback((hex: string) => {
    const normalized = hex.toLowerCase()
    const current = readRecentColors()
    const without = current.filter((c) => c.toLowerCase() !== normalized)
    writeRecentColors([normalized, ...without].slice(0, MAX_RECENT))
  }, [])

  return { colors, push }
}

/**
 * Shared debounce timer for history push operations.
 *
 * Module-level singleton shared across layoutSlice and clipboardSlice.
 * Using a mutable reference avoids coupling slices via the store state.
 */

export const historyTimerRef: { current: ReturnType<typeof setTimeout> | null } = { current: null }

export function clearHistoryTimer(): void {
  if (historyTimerRef.current !== null) {
    clearTimeout(historyTimerRef.current)
    historyTimerRef.current = null
  }
}

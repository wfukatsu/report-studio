/**
 * Small dot shown at the top-right corner of a toolbar button to signal
 * "something is set / available" without looking like a pressed button (#498).
 * The parent button must be `relative`. Purely decorative — the state it
 * reflects must also be exposed elsewhere (a menu checkmark, an enabled
 * sibling button, a count badge, ...).
 */
export function ToolbarIndicatorDot() {
  return (
    <span
      aria-hidden="true"
      data-testid="toolbar-indicator-dot"
      className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-primary pointer-events-none"
    />
  )
}

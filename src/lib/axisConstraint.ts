/**
 * Constrains a drag delta to a single axis when Shift is held.
 * The dominant axis (larger absolute value) is preserved; the other is zeroed.
 * Tie-breaker: horizontal axis wins when |dx| === |dy|.
 */
export function constrainDelta(
  delta: { x: number; y: number },
  shift: boolean,
): { x: number; y: number } {
  if (!shift) return delta
  if (Math.abs(delta.x) >= Math.abs(delta.y)) {
    return { x: delta.x, y: 0 }
  }
  return { x: 0, y: delta.y }
}

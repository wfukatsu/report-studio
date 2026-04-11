const MIN_SIZE_MM = 5

/**
 * Constrains a resize operation to maintain the original aspect ratio when Shift is held.
 * The dominant axis (larger change) determines the base; the other is derived from ratio.
 * After clamping to MIN_SIZE_MM, the opposite axis is re-derived to keep the ratio honest.
 */
export function constrainAspectRatio(
  newWidth: number,
  newHeight: number,
  startWidth: number,
  startHeight: number,
  ratio: number,
): { width: number; height: number } {
  const widthChange = Math.abs(newWidth - startWidth)
  const heightChange = Math.abs(newHeight - startHeight)

  let w = newWidth
  let h = newHeight

  if (widthChange >= heightChange) {
    // Width is dominant — derive height from width
    h = Math.max(MIN_SIZE_MM, w / ratio)
    // If height hit the floor, re-derive width to restore the ratio
    if (h === MIN_SIZE_MM) w = Math.max(MIN_SIZE_MM, MIN_SIZE_MM * ratio)
  } else {
    // Height is dominant — derive width from height
    w = Math.max(MIN_SIZE_MM, h * ratio)
    // If width hit the floor, re-derive height to restore the ratio
    if (w === MIN_SIZE_MM) h = Math.max(MIN_SIZE_MM, MIN_SIZE_MM / ratio)
  }

  return { width: w, height: h }
}

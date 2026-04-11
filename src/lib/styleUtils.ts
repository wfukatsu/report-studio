import type { TextStyle } from '@/types'

/**
 * Merge element-level style overrides on top of report-level defaults.
 *
 * Rules:
 * - undefined values in elStyle mean "inherit from defaultStyle"
 * - Only explicitly set (non-undefined) properties in elStyle override defaults
 * - Returns a new object — never mutates either input
 *
 * Note: Do NOT use `{ ...defaultStyle, ...elStyle }` — that spread passes undefined
 * values from elStyle which would incorrectly override defaultStyle values.
 */
export function resolveStyle(
  elStyle: TextStyle | undefined,
  defaultStyle: TextStyle,
): TextStyle {
  if (!elStyle) return { ...defaultStyle }
  const result: TextStyle = { ...defaultStyle }
  let key: keyof TextStyle
  for (key in elStyle) {
    const val = elStyle[key]
    if (val !== undefined) {
      ;(result as Record<keyof TextStyle, TextStyle[keyof TextStyle]>)[key] = val
    }
  }
  return result
}

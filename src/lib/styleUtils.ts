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

/** 帳票キャンバスの標準ゴシック体スタック（PDF の埋め込み Noto Sans JP と同一リリース、#317） */
export const REPORT_SANS_STACK = "'Noto Sans JP', sans-serif"
/** 帳票キャンバスの標準明朝体スタック（PDF の埋め込み Noto Serif JP と同一リリース、#317） */
export const REPORT_SERIF_STACK = "'Noto Serif JP', serif"

/**
 * Resolve an element's fontFamily for canvas rendering (#317).
 *
 * The generic keywords the font picker labels ゴシック体（標準）/ 明朝体（標準）
 * resolve to the self-hosted Noto webfonts so the canvas matches the server PDF
 * (FontProvider maps the same families to its embedded Noto fonts). Explicit
 * families pass through; undefined inherits `.report-page` (= Noto Sans JP).
 */
export function resolveFontFamily(family: string | undefined): string | undefined {
  if (family === undefined || family === '') return undefined
  if (family === 'sans-serif') return REPORT_SANS_STACK
  if (family === 'serif') return REPORT_SERIF_STACK
  return family
}

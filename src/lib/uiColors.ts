/**
 * #438: semantic accent colors used by the binding editor / schema UI.
 *
 * Single source for JS/SVG usage (connection lines, inline styles). Tailwind
 * className usage goes through the `binding` color tokens in tailwind.config.ts,
 * which imports these constants — change them here and both layers follow.
 */

/** Binding-editor accent (indigo) — connections, drag affordances, fx badges. */
export const BINDING_ACCENT = '#6366f1'

/**
 * Connection-success green — rings, badges, connection lines (graphics only).
 * For TEXT on light backgrounds use {@link BINDING_SUCCESS_TEXT}: this shade
 * is ~2.2:1 against white and fails WCAG AA for text.
 */
export const BINDING_SUCCESS = '#00C853'

/** Darker green for small text/icons on light backgrounds (≥4.5:1 on white). */
export const BINDING_SUCCESS_TEXT = '#15803d'

/** Lookup-relation amber in the relationship view. */
export const RELATION_LOOKUP = '#f59e0b'

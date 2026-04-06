/**
 * Application-wide constants.
 * Import from here instead of using magic numbers in hooks/components.
 */

/** Auto-save debounce in milliseconds (2 seconds) */
export const AUTOSAVE_DEBOUNCE_MS = 2000

/** Expression evaluation debounce in milliseconds (800ms) */
export const EVAL_DEBOUNCE_MS = 800

// ── Canvas layout ────────────────────────────────────────────────────────────

/** Height/width of the ruler strip (px) */
export const RULER_SIZE = 20

/** Padding around the paper within the scroll container (px) */
export const CANVAS_PADDING = 32

/** Zoom bounds */
export const ZOOM_MIN = 0.1
export const ZOOM_MAX = 3.0

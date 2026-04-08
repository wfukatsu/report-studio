/**
 * Custom SVG icons for text alignment and writing direction.
 *
 * == Text Vertical Alignment ==
 * Custom SVG icons for text vertical alignment within a bounding box.
 *
 * These differ from Lucide's AlignStartVertical/AlignCenterVertical/AlignEndVertical,
 * which represent object-to-object alignment (Figma-style multi-object alignment).
 *
 * These icons show horizontal text lines positioned at top/middle/bottom
 * of a rectangular frame — matching the Figma/InDesign convention for
 * "text vertical alignment within a text frame."
 */

interface IconProps {
  className?: string
}

/** Text lines at the top of a frame */
export function TextAlignTopIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <rect x="1" y="1" width="12" height="12" rx="1" strokeWidth="1" />
      <line x1="3" y1="4" x2="11" y2="4" />
      <line x1="3" y1="6.5" x2="9" y2="6.5" />
    </svg>
  )
}

/** Text lines at the vertical center of a frame */
export function TextAlignMiddleIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <rect x="1" y="1" width="12" height="12" rx="1" strokeWidth="1" />
      <line x1="3" y1="5.75" x2="11" y2="5.75" />
      <line x1="3" y1="8.25" x2="9" y2="8.25" />
    </svg>
  )
}

/** Text lines at the bottom of a frame */
export function TextAlignBottomIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <rect x="1" y="1" width="12" height="12" rx="1" strokeWidth="1" />
      <line x1="3" y1="7.5" x2="11" y2="7.5" />
      <line x1="3" y1="10" x2="9" y2="10" />
    </svg>
  )
}

// == Writing Direction Icons ==

/** Horizontal text direction (横書き): "A" with horizontal arrow */
export function WritingHorizontalIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <text x="3" y="8" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif" fontWeight="bold">A</text>
      <line x1="2" y1="11.5" x2="12" y2="11.5" />
      <polyline points="10,10 12,11.5 10,13" strokeWidth="1" />
    </svg>
  )
}

/** Vertical text direction (縦書き): "A" with downward arrow */
export function WritingVerticalIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <text x="3" y="7" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif" fontWeight="bold">A</text>
      <line x1="11.5" y1="2" x2="11.5" y2="12" />
      <polyline points="10,10 11.5,12 13,10" strokeWidth="1" />
    </svg>
  )
}

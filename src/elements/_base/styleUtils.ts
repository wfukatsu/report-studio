/**
 * Convert vertical/horizontal alignment values to CSS flex alignment.
 * Used by text-family renderers (Text, Label, DataField) for justifyContent.
 */
export function toFlexAlign(value: string | undefined): string {
  if (value === 'center' || value === 'middle') return 'center'
  if (value === 'right' || value === 'bottom' || value === 'end') return 'flex-end'
  return 'flex-start'
}

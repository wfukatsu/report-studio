/** Returns true for valid 6-digit hex colors like #RRGGBB */
export function isValidHex(s: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(s)
}

/**
 * Preset color palette — 10 columns × 6 rows, inspired by Google Slides.
 * Each column is a color family (light → dark, top → bottom).
 * Column order: Gray, Red, Orange, Yellow, Lt.Green, Teal, Sky, Blue, Purple, Pink
 */
export const PRESET_COLOR_COLUMNS: readonly (readonly string[])[] = [
  // Gray / White / Black
  ['#FFFFFF', '#D9D9D9', '#B7B7B7', '#808080', '#434343', '#000000'],
  // Red
  ['#FFCCCC', '#FF6666', '#FF0000', '#CC0000', '#990000', '#660000'],
  // Orange
  ['#FFE0B2', '#FFAB40', '#FF9800', '#E65100', '#BF360C', '#6D1B00'],
  // Yellow
  ['#FFF9C4', '#FFF176', '#FFD600', '#F9A825', '#F57F17', '#6D3B00'],
  // Light Green
  ['#DCEDC8', '#AED581', '#8BC34A', '#558B2F', '#33691E', '#1B5E20'],
  // Teal / Emerald
  ['#B2DFDB', '#4DB6AC', '#009688', '#00695C', '#004D40', '#00251A'],
  // Sky Blue
  ['#BBDEFB', '#64B5F6', '#2196F3', '#1565C0', '#0D47A1', '#002171'],
  // Royal Blue / Indigo
  ['#C5CAE9', '#7986CB', '#3F51B5', '#283593', '#1A237E', '#0D1259'],
  // Purple
  ['#E1BEE7', '#BA68C8', '#9C27B0', '#6A1B9A', '#4A148C', '#2E005E'],
  // Pink / Rose
  ['#F8BBD9', '#F06292', '#E91E63', '#AD1457', '#880E4F', '#4A0028'],
] as const

/** Expands 3-digit #RGB shorthand to 6-digit #RRGGBB. Returns input unchanged otherwise. */
export function expandHex(s: string): string {
  if (/^#[0-9A-Fa-f]{3}$/.test(s)) {
    return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]
  }
  return s
}

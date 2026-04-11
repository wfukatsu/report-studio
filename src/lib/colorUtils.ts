/** Returns true for valid 6-digit hex colors like #RRGGBB */
export function isValidHex(s: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(s)
}

/** Expands 3-digit #RGB shorthand to 6-digit #RRGGBB. Returns input unchanged otherwise. */
export function expandHex(s: string): string {
  if (/^#[0-9A-Fa-f]{3}$/.test(s)) {
    return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]
  }
  return s
}

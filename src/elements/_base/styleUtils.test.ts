import { describe, it, expect } from 'vitest'
import { toFlexAlign } from './styleUtils'

describe('toFlexAlign', () => {
  it.each([
    ['left', 'flex-start'],
    ['center', 'center'],
    ['right', 'flex-end'],
    ['top', 'flex-start'],
    ['middle', 'center'],
    ['bottom', 'flex-end'],
    ['end', 'flex-end'],
    [undefined, 'flex-start'],
  ] as const)('maps %s → %s', (input, expected) => {
    expect(toFlexAlign(input)).toBe(expected)
  })
})

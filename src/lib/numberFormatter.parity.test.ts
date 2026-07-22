import { describe, it, expect } from 'vitest'
import { applyFormat } from './numberFormatter'
import type { CalculationFormat } from '@/types'
import golden from './formatGolden.json'

/**
 * Front<->server formatter parity (#329 Phase 4).
 *
 * This suite and the server-side `ValueFormatterParityTest` load the SAME
 * `formatGolden.json` and assert `applyFormat(value, format) === expected`.
 * Keeping one shared fixture (instead of two hand-mirrored test files) means a
 * new case, or any drift between the TS and Java formatters, fails on exactly
 * one side and is caught before it can break preview/PDF parity (#311-#325).
 */
interface GoldenCase {
  name: string
  value: unknown
  format: { type: string; decimalPlaces?: number; customPattern?: string }
  expected: string
}

describe('formatter parity (shared golden fixture)', () => {
  const cases = golden.cases as GoldenCase[]

  it('has cases', () => {
    expect(cases.length).toBeGreaterThan(20)
  })

  for (const c of cases) {
    it(`applyFormat: ${c.name}`, () => {
      expect(applyFormat(c.value, c.format as CalculationFormat)).toBe(c.expected)
    })
  }
})

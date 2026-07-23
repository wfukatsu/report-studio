import { describe, it, expect } from 'vitest'
import { DEFAULT_TAX_RATES, resolveTaxRates } from './taxRates'
import golden from './taxRatesGolden.json'

describe('resolveTaxRates (#333)', () => {
  it('defaults match the shared golden fixture (front/server parity source)', () => {
    expect(DEFAULT_TAX_RATES).toEqual(golden)
    expect(DEFAULT_TAX_RATES.standard).toBe(0.1)
    expect(DEFAULT_TAX_RATES.reduced).toBe(0.08)
    expect(DEFAULT_TAX_RATES.none).toBe(0)
  })

  it('returns defaults when tenant is null/undefined', () => {
    expect(resolveTaxRates(null)).toEqual(DEFAULT_TAX_RATES)
    expect(resolveTaxRates(undefined)).toEqual(DEFAULT_TAX_RATES)
    expect(resolveTaxRates({})).toEqual(DEFAULT_TAX_RATES)
  })

  it('applies tenant overrides and keeps defaults for the rest', () => {
    const r = resolveTaxRates({ taxRates: { standard: 0.12 } })
    expect(r.standard).toBe(0.12)
    expect(r.reduced).toBe(0.08)
    expect(r.none).toBe(0)
  })

  it('ignores non-finite overrides', () => {
    const r = resolveTaxRates({ taxRates: { standard: NaN as unknown as number } })
    expect(r.standard).toBe(0.1)
  })

  it('does not mutate the shared defaults object', () => {
    const r = resolveTaxRates({ taxRates: { standard: 0.2 } })
    r.reduced = 0.99
    expect(DEFAULT_TAX_RATES.reduced).toBe(0.08)
  })
})

import type { TaxType, TenantInfo } from '@/types'
import taxRatesGolden from './taxRatesGolden.json'

/**
 * Tax-type → rate resolution (#333 Part 2).
 *
 * The tenant's `taxRates` map is the single source of truth for consumption-tax
 * rates. Rates are decimal fractions (0.10 = 10%). Where the tenant has not set a
 * rate, the statutory default is used. These defaults MUST stay in sync with the
 * server (`TaxRates.DEFAULTS` in `server/.../TaxRates.java`) — the shared
 * `taxRatesGolden.json` fixture is asserted by tests on both sides to enforce it.
 *
 * The resolved map is injected into JEXL calculation contexts as `taxRates`, so
 * templates reference `taxRates.standard` or `taxRates[item.taxType]` instead of
 * hard-coding 0.10 / 0.08 in every formula (which breaks on a tax-law change).
 */
export const DEFAULT_TAX_RATES: Record<TaxType, number> = taxRatesGolden as Record<TaxType, number>

/** Resolve the effective tax-rate map for a tenant, applying defaults per type. */
export function resolveTaxRates(tenant?: TenantInfo | null): Record<TaxType, number> {
  const overrides = tenant?.taxRates ?? {}
  const out = { ...DEFAULT_TAX_RATES }
  for (const type of Object.keys(out) as TaxType[]) {
    const v = overrides[type]
    if (typeof v === 'number' && isFinite(v)) out[type] = v
  }
  return out
}

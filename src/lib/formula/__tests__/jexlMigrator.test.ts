import { describe, it, expect } from 'vitest'
import { migrateJexlExpression } from '../jexlMigrator'

describe('jexlMigrator', () => {
  // ── Function renames ────────────────────────────────────────────────────

  describe('function renames', () => {
    it('sum → SUM', () => {
      expect(migrateJexlExpression('sum(items)').formula).toBe('SUM(items)')
    })

    it('count → COUNT', () => {
      expect(migrateJexlExpression('count(rows)').formula).toBe('COUNT(rows)')
    })

    it('round with 2 args → ROUND', () => {
      expect(migrateJexlExpression('round(val, 2)').formula).toBe('ROUND(val, 2)')
    })

    it('avg → AVG', () => {
      expect(migrateJexlExpression('avg(prices)').formula).toBe('AVG(prices)')
    })

    it('min → MIN', () => {
      expect(migrateJexlExpression('min(scores)').formula).toBe('MIN(scores)')
    })

    it('max → MAX', () => {
      expect(migrateJexlExpression('max(scores)').formula).toBe('MAX(scores)')
    })

    it('concat → CONCAT', () => {
      expect(migrateJexlExpression('concat(a, b)').formula).toBe('CONCAT(a, b)')
    })

    it('ifExpr → IF', () => {
      expect(migrateJexlExpression('ifExpr(x > 0, "yes", "no")').formula)
        .toBe("IF(x > 0, 'yes', 'no')")
    })
  })

  // ── formatNumber → TEXT ────────────────────────────────────────────────

  describe('formatNumber → TEXT', () => {
    it('no pattern → integer default', () => {
      expect(migrateJexlExpression('formatNumber(price)').formula)
        .toBe("TEXT(price, '#,##0')")
    })

    it("pattern 'integer'", () => {
      expect(migrateJexlExpression('formatNumber(price, "integer")').formula)
        .toBe("TEXT(price, '#,##0')")
    })

    it("pattern 'decimal2'", () => {
      expect(migrateJexlExpression('formatNumber(price, "decimal2")').formula)
        .toBe("TEXT(price, '#,##0.00')")
    })

    it("pattern 'currency' → manual_review warning", () => {
      const result = migrateJexlExpression('formatNumber(price, "currency")')
      expect(result.warnings.some((w) => w.kind === 'manual_review')).toBe(true)
      expect(result.hasUnmigrable).toBe(false)
    })
  })

  // ── formatDate → FORMAT_DATE ──────────────────────────────────────────

  describe('formatDate → FORMAT_DATE', () => {
    it('with format arg', () => {
      expect(migrateJexlExpression('formatDate(date, "yyyy/MM/dd")').formula)
        .toBe("FORMAT_DATE(date, 'yyyy/MM/dd')")
    })

    it('no format arg → inject default', () => {
      expect(migrateJexlExpression('formatDate(date)').formula)
        .toBe("FORMAT_DATE(date, 'yyyy/MM/dd')")
    })
  })

  // ── String literal conversion ──────────────────────────────────────────

  describe('string literals', () => {
    it('double-quoted → single-quoted (== also becomes =)', () => {
      expect(migrateJexlExpression('name == "Alice"').formula).toBe("name = 'Alice'")
    })

    it('double-equals → single equals', () => {
      expect(migrateJexlExpression('x == 5').formula).toBe('x = 5')
    })

    it('!= is preserved', () => {
      expect(migrateJexlExpression('x != 5').formula).toBe('x != 5')
    })
  })

  // ── Unmigrable syntax ──────────────────────────────────────────────────

  describe('unmigrable syntax', () => {
    it('ternary ?: produces warning', () => {
      const result = migrateJexlExpression('x > 0 ? "yes" : "no"')
      expect(result.hasUnmigrable).toBe(true)
      expect(result.warnings[0].kind).toBe('unmigrable_syntax')
    })

    it('pipe operator | produces warning', () => {
      const result = migrateJexlExpression('price|currency')
      expect(result.hasUnmigrable).toBe(true)
    })
  })

  // ── Nested function calls ──────────────────────────────────────────────

  describe('nested calls', () => {
    it('round(sum(items), 2) → ROUND(SUM(items), 2)', () => {
      expect(migrateJexlExpression('round(sum(items), 2)').formula)
        .toBe('ROUND(SUM(items), 2)')
    })

    it('ifExpr with formatNumber inside', () => {
      const result = migrateJexlExpression('ifExpr(total > 0, formatNumber(total, "integer"), "0")')
      expect(result.formula).toBe("IF(total > 0, TEXT(total, '#,##0'), '0')")
      expect(result.hasUnmigrable).toBe(false)
    })
  })

  // ── Passthrough ────────────────────────────────────────────────────────

  describe('passthrough', () => {
    it('plain field ref', () => {
      expect(migrateJexlExpression('price').formula).toBe('price')
    })

    it('arithmetic expression', () => {
      expect(migrateJexlExpression('a + b * 2').formula).toBe('a + b * 2')
    })

    it('dotted property access', () => {
      expect(migrateJexlExpression('order.total').formula).toBe('order.total')
    })

    it('no warnings for clean expression', () => {
      expect(migrateJexlExpression('sum(items) + 1').warnings).toHaveLength(0)
    })
  })
})

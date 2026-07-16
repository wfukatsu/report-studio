import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildReportDefinitionJsonSchema } from './jsonSchema'
import { REPORT_DEFINITION_LIMITS } from './limits'

const SCHEMA_PATH = resolve(__dirname, '../../../schemas/report-definition.schema.json')

describe('report-definition.schema.json artifact', () => {
  it('is in sync with the Zod schema (run `npm run generate:schema` if this fails)', () => {
    const checkedIn = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'))
    expect(checkedIn).toEqual(buildReportDefinitionJsonSchema())
  })

  it('carries the structural limits from report-definition-limits.json', () => {
    const checkedIn = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'))
    expect(checkedIn.properties.pages.maxItems).toBe(REPORT_DEFINITION_LIMITS.maxPages)
    expect(checkedIn.properties.calculationRules.maxItems).toBe(REPORT_DEFINITION_LIMITS.maxCalculationRules)
    expect(checkedIn.properties.validationRules.maxItems).toBe(REPORT_DEFINITION_LIMITS.maxValidationRules)
    expect(checkedIn.properties.outputVariants.maxItems).toBe(REPORT_DEFINITION_LIMITS.maxOutputVariants)
  })
})

/**
 * JSON Schema artifact builder for ReportDefinition.
 *
 * The Zod schema (reportDefinition.ts) is the source of truth; this converts
 * it to a standard JSON Schema document. The generated artifact is checked in
 * at schemas/report-definition.schema.json (regenerate with
 * `npm run generate:schema`; a drift test guards the checked-in copy).
 */
import { z } from 'zod'
import { ReportDefinitionSchema } from './reportDefinition'

export function buildReportDefinitionJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(ReportDefinitionSchema, {
    io: 'input',
    unrepresentable: 'any',
    target: 'draft-2020-12',
  }) as Record<string, unknown>

  return {
    $id: 'https://github.com/wfukatsu/report-studio/schemas/report-definition.schema.json',
    title: 'ReportDefinition',
    description:
      'Report Studio template definition (formatVersion 2). Generated from src/lib/schemas/reportDefinition.ts — do not edit by hand.',
    ...schema,
  }
}

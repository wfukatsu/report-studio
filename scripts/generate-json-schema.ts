/**
 * Regenerates schemas/report-definition.schema.json from the Zod schema.
 *
 * Usage: npm run generate:schema
 * (runs via vite-node so path aliases and JSON imports resolve like the app)
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildReportDefinitionJsonSchema } from '../src/lib/schemas/jsonSchema'

const outPath = resolve(__dirname, '../schemas/report-definition.schema.json')
const schema = buildReportDefinitionJsonSchema()
writeFileSync(outPath, JSON.stringify(schema, null, 2) + '\n')
console.log(`wrote ${outPath}`)

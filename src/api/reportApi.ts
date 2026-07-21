/**
 * Report API — barrel re-exporting every backend API call.
 *
 * The former single-file module was split by domain (#276); all existing
 * `import { ... } from '@/api/reportApi'` sites keep working unchanged.
 *
 * Design decisions (unchanged):
 * - No services/ layer (DHH): async operations live in the domain modules directly
 * - loadFromBackend lives in templateApi (not in a separate service file)
 * - Zod validation on every response (ReportDefinitionSchema)
 * - full PUT only — no JSON Patch (YAGNI for single-user tool)
 * - generation counter prevents concurrent load overwrite
 */
export * from './apiHelpers'
export * from './templateApi'
export * from './responseApi'
export * from './authApi'
export * from './adminApi'
export * from './healthApi'
export * from './pdfApi'
export * from './jobsApi'
export * from './schemaApi'
export * from './scalardbApi'
export * from './tenantApi'
export * from './productApi'
export * from './webhookApi'
export * from './sequenceApi'

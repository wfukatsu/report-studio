/**
 * Zod schemas and types for the expression evaluation API.
 *
 * Types are defined here (not in reportApi.ts) to avoid circular imports:
 *   reportApi.ts → evaluateResponse.ts → @/store/types, @/lib/schemas/reportDefinition
 * No back-import to @/api/reportApi is made.
 */
import { z } from 'zod'
import type { ComputedValue, ValidationViolation } from '@/store/types'

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface EvaluateResponse {
  results: Record<string, ComputedValue>
  errors: Record<string, string>
}

export interface ValidateResponse {
  violations: ValidationViolation[]
}

// ---------------------------------------------------------------------------
// Zod schemas
// satisfies z.ZodType<T> catches divergence between the schema and the TS type
// at compile time — if ComputedValue gains a new variant, the build fails here.
// ---------------------------------------------------------------------------

export const EvaluateResponseSchema = z.object({
  results: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])),
  errors: z.record(z.string(), z.string()),
}) satisfies z.ZodType<EvaluateResponse>

export const ValidateResponseSchema = z.object({
  violations: z.array(
    z.object({
      ruleKey: z.string().max(100),
      message: z.string().max(500),
      elementId: z.string().max(100).optional(),
    }),
  ).max(200),
}) satisfies z.ZodType<ValidateResponse>

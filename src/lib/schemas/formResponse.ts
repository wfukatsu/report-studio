import { z } from 'zod'
import type { SummaryItem } from '@/lib/summaryFormat'

export interface FormResponse {
  id: string
  templateId: string
  data: Record<string, unknown>
  submittedAt: number
  submittedBy: string
}

export interface FormResponseList {
  items: FormResponseSummary[]
  total: number
  offset: number
  limit: number
  hasMore: boolean
  fieldSummary?: Record<string, { count: number; topValues: unknown[] }>
  aggregationTruncated?: boolean
}

/** Document lifecycle status (#163). */
export type ReportStatus = 'draft' | 'issued' | 'sent' | 'void'
export const REPORT_STATUSES: readonly ReportStatus[] = ['draft', 'issued', 'sent', 'void']

export interface FormResponseSummary {
  id: string
  templateId: string
  submittedAt: number
  submittedBy: string
  status?: ReportStatus
  summary: string[]
  /** Structured summary (#412): `{key, text}` for scalar leaves, `{key, count}` for arrays. */
  summaryItems?: SummaryItem[]
}

export const SummaryItemSchema = z.object({
  key: z.string(),
  text: z.string().optional(),
  count: z.number().optional(),
}) satisfies z.ZodType<SummaryItem>

export const FormResponseSummarySchema = z.object({
  id: z.string(),
  templateId: z.string(),
  submittedAt: z.number(),
  submittedBy: z.string(),
  status: z.enum(['draft', 'issued', 'sent', 'void']).optional(),
  summary: z.array(z.string()),
  summaryItems: z.array(SummaryItemSchema).optional(),
}) satisfies z.ZodType<FormResponseSummary>

export const FormResponseSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  data: z.record(z.string(), z.unknown()),
  submittedAt: z.number(),
  submittedBy: z.string(),
}) satisfies z.ZodType<FormResponse>

export const FormResponseListSchema = z.object({
  items: z.array(FormResponseSummarySchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  hasMore: z.boolean(),
  fieldSummary: z.record(z.string(), z.object({
    count: z.number(),
    topValues: z.array(z.unknown()),
  })).optional(),
  aggregationTruncated: z.boolean().optional(),
}) satisfies z.ZodType<FormResponseList>

export const SubmitResponseResultSchema = z.object({ id: z.string() })
export const DuplicateReportResultSchema = z.object({ id: z.string(), name: z.string() })

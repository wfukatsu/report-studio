/**
 * ビルトインテンプレート一覧
 *
 * JSONファイルから ReportDefinition を読み込み、
 * テンプレートメタデータ（名前・カテゴリ・タグ）を付与する。
 */
import { ReportDefinitionSchema } from '@/lib/schemas/reportDefinition'
import type { ReportDefinition } from '@/types'

// ---------------------------------------------------------------------------
// JSON ファイル読み込み（Vite import.meta.glob — eager で同期読み込み）
// ---------------------------------------------------------------------------

const templateModules = import.meta.glob('./builtin/*.json', { eager: true }) as Record<
  string,
  { default: { formatVersion: number; definition: unknown } }
>

// ---------------------------------------------------------------------------
// BuiltinEntry 型定義
// ---------------------------------------------------------------------------

export interface BuiltinEntry {
  id: string
  name: string
  description?: string
  category?: string
  tags?: string[]
  definition: ReportDefinition
}

// ---------------------------------------------------------------------------
// テンプレートメタデータ（JSON ファイルは純粋な ReportDefinition のみ）
// ---------------------------------------------------------------------------

const BUILTIN_META: Omit<BuiltinEntry, 'definition'>[] = [
  { id: 'quotation-modern', name: '御見積書（モダン）', category: 'business', tags: ['modern', 'invoice'] },
  { id: 'purchase-order-modern', name: '御注文書', category: 'business', tags: ['modern', 'invoice'] },
  { id: 'invoice-modern', name: '御請求書', category: 'business', tags: ['modern', 'invoice'] },
  { id: 'quotation-basic-invoice', name: '見積書（インボイス対応）' },
  { id: 'quotation-discount-invoice', name: '見積書（値引対応・インボイス対応）' },
  { id: 'quotation-english', name: 'Quotation (English)' },
  { id: 'fuyou-kojo-r7', name: '不要小銃等除去通知書（様式第7号）' },
  { id: 'element-showcase', name: '要素ショーケース', category: '検証・サンプル' },
  { id: 'binding-editor-sample', name: 'バインドエディタ検証用納品書', category: '検証・サンプル' },
]

// ---------------------------------------------------------------------------
// ビルドして公開
// ---------------------------------------------------------------------------

function loadBuiltinEntries(): BuiltinEntry[] {
  const entries: BuiltinEntry[] = []
  for (const meta of BUILTIN_META) {
    const key = `./builtin/${meta.id}.json`
    const mod = templateModules[key]
    if (!mod) {
      console.error(`[builtinTemplates] Missing JSON file for: ${meta.id}`)
      continue
    }
    const envelope = mod.default
    if (envelope.formatVersion !== 2 || !envelope.definition) {
      console.error(`[builtinTemplates] Invalid envelope for: ${meta.id}`)
      continue
    }
    const result = ReportDefinitionSchema.safeParse(envelope.definition)
    if (!result.success) {
      console.error(`[builtinTemplates] Zod validation failed for: ${meta.id}`, result.error)
      continue
    }
    entries.push({ ...meta, definition: result.data as ReportDefinition })
  }
  return entries
}

export const BUILTIN_TEMPLATES: BuiltinEntry[] = loadBuiltinEntries()

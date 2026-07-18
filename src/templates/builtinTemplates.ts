/**
 * ビルトインテンプレート一覧
 *
 * 同梱テンプレートはすべて削除済み。空のレジストリを公開する。
 * テンプレートはサーバに保存されたもの（公開テンプレート）を利用する。
 */
import type { ReportDefinition } from '@/types'

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

/**
 * Category reserved for developer/QA templates (engine showcase, binding-editor
 * fixtures). Hidden from the gallery by default so the non-technical persona
 * isn't shown fixtures alongside business templates (#109).
 */
export const SAMPLE_CATEGORY = '検証・サンプル'

// ---------------------------------------------------------------------------
// ビルトインテンプレートは存在しない（すべて削除済み）
// ---------------------------------------------------------------------------

export const BUILTIN_TEMPLATES: BuiltinEntry[] = []

<<<<<<< HEAD
/**
 * ビルトインテンプレート一覧
 *
 * JSONファイルから ReportDefinition を読み込み、
 * テンプレートメタデータ（名前・カテゴリ・タグ）を付与する。
 */
import { ReportDefinitionSchema } from '@/lib/schemas/reportDefinition'
import type { ReportDefinition } from '@/types'
=======
import { v4 as uuidv4 } from 'uuid'
import type { Template } from '@/types'
import { FUYOU_KOJO_TEMPLATE } from './fuyouKojoTemplate'
import { QUOTATION_TEMPLATE } from './quotationTemplate'
import { QUOTATION_DISCOUNT_TEMPLATE } from './quotationDiscountTemplate'
import { QUOTATION_ENGLISH_TEMPLATE } from './quotationEnglishTemplate'
import { ELEMENT_SHOWCASE_TEMPLATE } from './elementShowcaseTemplate'
>>>>>>> feat/formtable-excel-editing

// ---------------------------------------------------------------------------
// JSON ファイル読み込み（Vite import.meta.glob — eager で同期読み込み）
// ---------------------------------------------------------------------------

<<<<<<< HEAD
const templateModules = import.meta.glob('./builtin/*.json', { eager: true }) as Record<
  string,
  { formatVersion: number; definition: unknown; default?: unknown }
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
=======
export const BUILTIN_TEMPLATES: Template[] = [
  ELEMENT_SHOWCASE_TEMPLATE,
  FUYOU_KOJO_TEMPLATE,
  QUOTATION_TEMPLATE,
  QUOTATION_DISCOUNT_TEMPLATE,
  QUOTATION_ENGLISH_TEMPLATE,
  {
    id: 'blank',
    name: '白紙',
    description: '空のキャンバス。自由にレイアウトを作成できます',
    pages: [
      {
        id: uuidv4(),
        name: 'ページ 1',
        background: '#ffffff',
        width: A4_WIDTH,
        height: A4_HEIGHT,
        sections: [
          {
            id: uuidv4(),
            sectionType: 'body',
            height: A4_HEIGHT,
            elements: [],
          },
        ],
      },
    ],
    settings: {
      paperSize: 'A4',
      orientation: 'portrait',
      margin: { top: 20, right: 20, bottom: 20, left: 20 },
      unit: 'mm',
    },
  },
  {
    id: 'simple-report',
    name: 'シンプルレポート',
    description: 'タイトル・サマリー付きのシンプルなレポートテンプレート',
    pages: [
      {
        id: uuidv4(),
        name: 'ページ 1',
        background: '#ffffff',
        width: A4_WIDTH,
        height: A4_HEIGHT,
        sections: [
          {
            id: uuidv4(),
            sectionType: 'body',
            height: A4_HEIGHT,
            elements: [
              {
                id: uuidv4(),
                type: 'text',
                // ~10mm from left/top, width ~190mm, height ~16mm
                position: { x: 10, y: 10 },
                size: { width: 190, height: 16 },
                zIndex: 1,
                locked: false,
                visible: true,
                content: 'レポートタイトル',
                style: { fontSize: 32, fontWeight: 'bold', color: '#1a1a1a', textAlign: 'center' },
              },
              {
                id: uuidv4(),
                type: 'shape',
                position: { x: 10, y: 29 },
                size: { width: 190, height: 0.5 },
                zIndex: 2,
                locked: false,
                visible: true,
                shape: 'line',
                stroke: '#3b82f6',
                strokeWidth: 2,
              },
              {
                id: uuidv4(),
                type: 'text',
                position: { x: 10, y: 33 },
                size: { width: 190, height: 32 },
                zIndex: 3,
                locked: false,
                visible: true,
                content: '概要\n\nここにレポートの概要を入力してください。このテンプレートはビジネスレポートの出発点としてご利用いただけます。',
                style: { fontSize: 14, color: '#374151', textAlign: 'left' },
              },
            ],
          },
        ],
      },
    ],
    settings: {
      paperSize: 'A4',
      orientation: 'portrait',
      margin: { top: 20, right: 20, bottom: 20, left: 20 },
      unit: 'mm',
    },
  },
>>>>>>> feat/formtable-excel-editing
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
    // import.meta.glob with eager:true exposes fields both at top level and under .default
    const envelope = (mod.formatVersion !== undefined) ? mod : (mod.default as typeof mod)
    if (!envelope || envelope.formatVersion !== 2 || !envelope.definition) {
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

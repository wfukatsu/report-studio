/**
 * ビジネス文書テンプレート共通定数
 *
 * 見積書・注文書・請求書テンプレートで使用する寸法定数、カラーパレット、
 * フォントサイズ。テンプレート本体はJSON（src/templates/builtin/）に外出し済み。
 */
import type { CalculationFormat } from '@/types'

// ─── 寸法定数 ─────────────────────────────────────────────
export const A4_W = 210
export const A4_H = 297
export const ML = 10 // 左マージン
export const MT = 10 // 上マージン
export const MR = 10 // 右マージン
export const CONTENT_W = A4_W - ML - MR // 190mm

// テーブル
export const TABLE_ROW_H = 7 // mm per row
export const TABLE_HDR_H = 7 // header row height
export const TABLE_ROWS = 10 // 明細行数

// 6カラム幅（合計 = CONTENT_W = 190mm）
export const COL_CODE_W = 28
export const COL_NAME_W = 72
export const COL_QTY_W = 18
export const COL_UNIT_W = 14
export const COL_PRICE_W = 28
export const COL_AMOUNT_W = 30

// 右ブロック（テナント情報エリア）
export const RIGHT_BLOCK_X = 120
export const RIGHT_BLOCK_W = A4_W - MR - RIGHT_BLOCK_X // 80

// 集計エリア
export const SUMM_LABEL_W = 40
export const SUMM_AMT_W = 40
export const SUMM_ROW_H = 7
export const SUMM_X = ML + CONTENT_W - SUMM_LABEL_W - SUMM_AMT_W // 120

// ─── カラーパレット ───────────────────────────────────────────
export const COLORS = {
  accent: '#3b82f6',
  headerBg: '#f5f5f5',
  headerText: '#333333',
  oddRow: '#ffffff',
  evenRow: '#fafafa',
  border: '#e0e0e0',
  totalBoxBg: '#f0f7ff',
  text: '#1a1a1a',
  label: '#666666',
} as const

// ─── フォントサイズ (pt) ─────────────────────────────────────
export const FONT = {
  title: 20,
  section: 11,
  body: 8.5,
  table: 8,
  small: 7,
} as const

// ─── フォーマット定数 ────────────────────────────────────────
export const JPY_FMT: CalculationFormat = { type: 'currency_jpy' }
export const COMMA_FMT: CalculationFormat = { type: 'comma' }

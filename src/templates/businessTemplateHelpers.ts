/**
 * ビジネス文書テンプレート共通ヘルパー
 *
 * 見積書・注文書・請求書テンプレートで共有する寸法定数、カラーパレット、
 * フォントサイズ、要素生成ヘルパー関数。
 */
import { v4 as uuidv4 } from 'uuid'
import type { ReportElement, TextStyle, CalculationFormat } from '@/types'

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
// 28+72+18+14+28+30 = 190 ✓

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

// ─── フォントサイズ (mm) ─────────────────────────────────────
export const FONT = {
  title: 7,
  section: 4,
  body: 3,
  table: 2.8,
  small: 2.5,
} as const

// ─── フォーマット定数 ────────────────────────────────────────
export const JPY_FMT: CalculationFormat = { type: 'currency_jpy' }
export const COMMA_FMT: CalculationFormat = { type: 'comma' }

// ─── ヘルパー関数 ────────────────────────────────────────────

export function lbl(
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  style?: Partial<TextStyle>,
): ReportElement {
  return {
    id: uuidv4(),
    type: 'text',
    position: { x, y },
    size: { width: w, height: h },
    zIndex: 3,
    locked: true,
    visible: true,
    content: text,
    style: {
      fontSize: FONT.body,
      textAlign: 'left',
      verticalAlign: 'middle',
      color: COLORS.text,
      ...style,
    },
  }
}

export function df(
  fieldKey: string,
  x: number,
  y: number,
  w: number,
  h: number,
  style?: Partial<TextStyle>,
  format?: CalculationFormat,
  placeholder?: string,
): ReportElement {
  return {
    id: uuidv4(),
    type: 'dataField',
    position: { x, y },
    size: { width: w, height: h },
    zIndex: 3,
    locked: false,
    visible: true,
    fieldKey,
    format,
    fallbackText: placeholder ?? ' ',
    label: placeholder ?? fieldKey.split('.').pop() ?? fieldKey,
    style: {
      fontSize: FONT.body,
      textAlign: 'left',
      verticalAlign: 'middle',
      color: COLORS.text,
      ...style,
    },
  }
}

export function rect(
  x: number,
  y: number,
  w: number,
  h: number,
  opts?: { fill?: string; stroke?: string; strokeWidth?: number; borderRadius?: number },
): ReportElement {
  return {
    id: uuidv4(),
    type: 'shape',
    position: { x, y },
    size: { width: w, height: h },
    zIndex: 1,
    locked: true,
    visible: true,
    shape: 'rectangle',
    fill: opts?.fill ?? 'transparent',
    stroke: opts?.stroke ?? COLORS.border,
    strokeWidth: opts?.strokeWidth ?? 0.2,
    borderRadius: opts?.borderRadius,
  }
}

export function hline(
  x: number,
  y: number,
  w: number,
  opts?: { strokeWidth?: number; color?: string },
): ReportElement {
  return {
    id: uuidv4(),
    type: 'shape',
    position: { x, y },
    size: { width: w, height: 0.1 },
    zIndex: 1,
    locked: true,
    visible: true,
    shape: 'line',
    stroke: opts?.color ?? COLORS.border,
    strokeWidth: opts?.strokeWidth ?? 0.2,
  }
}

export function vline(
  x: number,
  y: number,
  h: number,
  opts?: { color?: string; strokeWidth?: number },
): ReportElement {
  return {
    id: uuidv4(),
    type: 'shape',
    position: { x, y },
    size: { width: 0.1, height: h },
    zIndex: 1,
    locked: true,
    visible: true,
    shape: 'line',
    stroke: opts?.color ?? COLORS.border,
    strokeWidth: opts?.strokeWidth ?? 0.2,
  }
}

/**
 * 集計行（ラベル + 値）を生成する共通パターン
 */
export function summaryRow(
  label: string,
  fieldKey: string,
  y: number,
  opts?: { bold?: boolean; highlight?: boolean; format?: CalculationFormat; fallback?: string },
): ReportElement[] {
  const bold = opts?.bold ?? false
  const highlight = opts?.highlight ?? false
  const fmt = opts?.format ?? JPY_FMT
  const bgColor = highlight ? COLORS.totalBoxBg : undefined
  const elements: ReportElement[] = []

  if (bgColor) {
    elements.push(rect(SUMM_X, y, SUMM_LABEL_W + SUMM_AMT_W, SUMM_ROW_H, {
      fill: bgColor,
      stroke: COLORS.border,
    }))
  }

  elements.push(
    lbl(label, SUMM_X + 2, y, SUMM_LABEL_W - 4, SUMM_ROW_H, {
      fontSize: FONT.table,
      textAlign: 'left',
      fontWeight: bold ? 'bold' : 'normal',
    }),
    df(fieldKey, SUMM_X + SUMM_LABEL_W + 2, y, SUMM_AMT_W - 4, SUMM_ROW_H, {
      fontSize: FONT.table,
      textAlign: 'right',
      fontWeight: bold ? 'bold' : 'normal',
    }, fmt, opts?.fallback ?? '¥0'),
  )

  return elements
}

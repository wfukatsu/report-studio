/**
 * 令和７年分 給与所得者の扶養控除等（異動）申告書 テンプレート
 *
 * 国税庁公定様式に基づいて作成。
 * 実際の帳票との差異は docs/issues/fuyou-kojo-template-issues.md に記録。
 */
import { v4 as uuidv4 } from 'uuid'
import type { Template, ReportElement, TextStyle } from '@/types'

// ─── 寸法定数 ───────────────────────────────────────────
const A4_W = 210
const A4_H = 297
const ML = 3  // left margin
const MT = 3  // top margin

// ─── ヘルパー関数 ────────────────────────────────────────

function lbl(
  text: string,
  x: number, y: number, w: number, h: number,
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
      fontSize: 3.0,
      textAlign: 'center',
      verticalAlign: 'middle',
      color: '#000000',
      ...style,
    },
  }
}

function vlbl(
  text: string,
  x: number, y: number, w: number, h: number,
  fontSize = 2.8,
): ReportElement {
  return lbl(text, x, y, w, h, { writingMode: 'vertical-rl', fontSize })
}

function rect(
  x: number, y: number, w: number, h: number,
  opts?: { fill?: string; stroke?: string; strokeWidth?: number },
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
    stroke: opts?.stroke ?? '#000000',
    strokeWidth: opts?.strokeWidth ?? 0.25,
  }
}

function line(
  x: number, y: number, w: number,
  opts?: { strokeWidth?: number; vertical?: boolean },
): ReportElement {
  const vertical = opts?.vertical ?? false
  return {
    id: uuidv4(),
    type: 'shape',
    position: { x, y },
    size: { width: vertical ? 0.1 : w, height: vertical ? w : 0.1 },
    zIndex: 1,
    locked: true,
    visible: true,
    shape: 'line',
    stroke: '#000000',
    strokeWidth: opts?.strokeWidth ?? 0.25,
  }
}

function input(
  x: number, y: number, w: number, h: number,
  opts?: {
    label?: string; gridCount?: number; fontSize?: number
    displayMode?: 'line' | 'box' | 'grid' | 'none'
    furiganaEnabled?: boolean; furiganaDataSource?: string; furiganaRatio?: number
  },
): ReportElement {
  return {
    id: uuidv4(),
    type: 'manualEntry',
    position: { x, y },
    size: { width: w, height: h },
    zIndex: 4,
    locked: false,
    visible: true,
    label: opts?.label ?? '',
    labelPosition: 'none',
    displayMode: opts?.displayMode ?? 'none',
    lineColor: '#555555',
    gridCount: opts?.gridCount,
    furiganaEnabled: opts?.furiganaEnabled,
    furiganaDataSource: opts?.furiganaDataSource,
    furiganaRatio: opts?.furiganaRatio,
    style: {
      fontSize: opts?.fontSize ?? 3.0,
      verticalAlign: 'bottom',
      color: '#1a1a1a',
    },
  }
}

function checkbox(
  x: number, y: number, size = 3.5,
): ReportElement {
  return {
    id: uuidv4(),
    type: 'manualEntry',
    position: { x, y },
    size: { width: size, height: size },
    zIndex: 4,
    locked: false,
    visible: true,
    label: '',
    labelPosition: 'none',
    displayMode: 'box',
    lineColor: '#000000',
    style: {
      fontSize: 3.0,
      textAlign: 'center',
      verticalAlign: 'middle',
    },
  }
}

function eraSelect(
  x: number, y: number, w: number, h: number,
  dataSource?: string,
): ReportElement {
  return {
    id: uuidv4(),
    type: 'eraSelect',
    position: { x, y },
    size: { width: w, height: h },
    zIndex: 3,
    locked: true,
    visible: true,
    dataSource,
  }
}

// ─── レイアウト定数 ──────────────────────────────────────
// 列 X 座標 (mm, 左端 ML=3 から)
const COL = {
  //   左の垂直ラベル帯
  leftBand:  { x: ML,      w: 5  },
  //   区分等
  kubun:     { x: ML + 5,  w: 14 },
  //   フリガナ/氏名
  name:      { x: ML + 19, w: 22 },   // DIFF-10: 24→22 (-2mm)
  //   続柄
  kankei:    { x: ML + 41, w: 8  },   // cascade -2mm
  //   個人番号
  myNumber:  { x: ML + 49, w: 22 },   // cascade -2mm
  //   生年月日
  birthday:  { x: ML + 71, w: 17 },   // cascade -2mm
  //   特定扶養年月日（H15.1.2〜H19.1.1生）
  tokutei:   { x: ML + 88, w: 9  },   // cascade -2mm
  //   令和7年中の所得の見積額
  income:    { x: ML + 97, w: 14 },   // cascade -2mm
  //   非居住者チェック+住所欄
  nonRes:    { x: ML + 111, w: 21 },  // cascade -2mm
  //   住所又は居所
  address:   { x: ML + 132, w: 30 },  // cascade -2mm, DIFF-10: 28→30 (+2mm)
  //   生計を一にする事実
  seikei:    { x: ML + 162, w: 18 },
  //   異動月日及び事由
  ido:       { x: ML + 180, w: 27 },
}
const TABLE_RIGHT = ML + 207  // = 210
// 表全体の幅
const TABLE_W = TABLE_RIGHT - ML  // 207mm

// ─── Y 座標 ──────────────────────────────────────────────
const Y = {
  title:    MT,          // 3
  header:   MT + 6,      // 9
  warn:     MT + 33,     // 36
  colHead:  MT + 37,     // 40
  rowA:     MT + 47,     // 50
  rowB1:    MT + 63,     // 66
  rowB2:    MT + 79,     // 82
  rowB3:    MT + 95,     // 98
  rowB4:    MT + 111,    // 114
  rowC:     MT + 127,    // 130
  rowD:     MT + 149,    // 152
  note1:    MT + 169,    // 172
  juminHdr: MT + 189,    // 192 (+6mm: note1拡張)
  jumin1:   MT + 195,    // 198 (+6mm)
  jumin2:   MT + 209,    // 212 (+6mm)
  taishoku: MT + 223,    // 226 (+6mm)
  bottom:   MT + 240,    // 243 (+6mm)
}

// 行高さ
const ROW_H = {
  title:   6,
  header:  27,
  warn:    4,
  colHead: 10,
  rowA:    16,
  rowB:    16,
  rowC:    22,
  rowD:    20,
  note1:   20,
  jumin:   14,
  taishoku:14,
}

// ─── 要素生成 ────────────────────────────────────────────

const elements: ReportElement[] = []

// ════════════════════════════════════════════════════════
// 1. タイトル行
// ════════════════════════════════════════════════════════
elements.push(
  rect(ML, Y.title, TABLE_W, ROW_H.title, { fill: '#ffffff' }),
  lbl('令和７年分　給与所得者の扶養控除等（異動）申告書',
    ML + 10, Y.title, TABLE_W - 30, ROW_H.title,
    { fontSize: 4.5, fontWeight: 'bold', textAlign: 'center' }),
  // 「扶」スタンプ
  rect(ML + TABLE_W - 14, Y.title, 14, 14, { fill: '#f0f0f0' }),
  lbl('扶', ML + TABLE_W - 14, Y.title, 14, 14,
    { fontSize: 7, fontWeight: 'bold', textAlign: 'center' }),
  // 従たる給与についての扶養控除等申告書の提出
  rect(ML + TABLE_W - 14, Y.title + 14, 14, 20),
  lbl('従たる給与についての\n扶養控除等申告書の提出\n（副から分けている場合のみ\n○をつけてください）',
    ML + TABLE_W - 14, Y.title + 14, 14, 16, { fontSize: 1.6, textAlign: 'center' }),
  lbl('○', ML + TABLE_W - 9, Y.title + 30, 4, 4, { fontSize: 3.5, textAlign: 'center' }),
  // DIFF-04: 右端縦書き帳票説明文（DIFF-03チェックエリア下部）
  vlbl(
    '○この申告書は、あなたの給与について扶養控除等を受けるために提出するものです。○パートやアルバイトの人についても、この申告書を提出する必要があります。○この申告書は、あなたの給与の支払者を経由して、提出先の各長に提出してください。なお、記載に当たっては、裏面の「2 記載についてのご注意」をお読みください。',
    ML + TABLE_W - 14, Y.title + 34, 14, Y.bottom - (Y.title + 34), 1.6,
  ),
)

// ════════════════════════════════════════════════════════
// 2. ヘッダーブロック
// ════════════════════════════════════════════════════════
const HY = Y.header
const HH = ROW_H.header  // 27mm (3 rows × 9mm)
const ROW_HH = 9

// 外枠
elements.push(rect(ML, HY, TABLE_W, HH))

// 左列（給与支払者情報）幅55mm
const LEFT_COL_W = 55
// 区切り線（縦）
elements.push(line(ML + LEFT_COL_W, HY, HH, { vertical: true }))

// Row 1: 所轄税務署長等
elements.push(
  rect(ML, HY, LEFT_COL_W, ROW_HH),
  lbl('所轄税務署長等', ML, HY, 12, ROW_HH, { fontSize: 2.8, writingMode: 'vertical-rl' }),
  lbl('給与の支払者の\n名称（氏名）', ML + 12, HY, 18, ROW_HH, { fontSize: 2.5, textAlign: 'left', paddingLeft: 1 }),
  input(ML + 30, HY + 1, LEFT_COL_W - 31, ROW_HH - 2, { fontSize: 3.0 }),
  // 右列 Row1
  lbl('（フリガナ）', ML + LEFT_COL_W + 1, HY, 25, 4, { fontSize: 2.5, textAlign: 'left' }),
  lbl('あなたの氏名', ML + LEFT_COL_W + 1, HY + 4, 25, 5, { fontSize: 2.8, textAlign: 'left' }),
  input(ML + LEFT_COL_W + 26, HY + 1, 40, ROW_HH - 2, {
    label: '氏名', fontSize: 3.5,
    furiganaEnabled: true, furiganaRatio: 0.55,
    furiganaDataSource: 'employee.furigana',
  }),
  lbl('あなたの生年月日', ML + LEFT_COL_W + 68, HY, 22, 4, { fontSize: 2.5, textAlign: 'left' }),
  eraSelect(ML + LEFT_COL_W + 68, HY + 4, 12, 5, 'employee.era'),
  input(ML + LEFT_COL_W + 80, HY + 4, 10, 5, { label: '年', fontSize: 3.0 }),
  input(ML + LEFT_COL_W + 91, HY + 4, 7, 5, { label: '月', fontSize: 3.0 }),
  input(ML + LEFT_COL_W + 99, HY + 4, 7, 5, { label: '日', fontSize: 3.0 }),
  lbl('世帯主の氏名', ML + LEFT_COL_W + 108, HY, 22, 4, { fontSize: 2.5, textAlign: 'left' }),
  input(ML + LEFT_COL_W + 108, HY + 4, 22, 5, { fontSize: 3.0 }),
  lbl('あなたとの続柄', ML + LEFT_COL_W + 131, HY, 20, 4, { fontSize: 2.5, textAlign: 'left' }),
  input(ML + LEFT_COL_W + 131, HY + 4, 20, 5, { fontSize: 3.0 }),
)

// Row 2: 税務署長
elements.push(
  rect(ML, HY + ROW_HH, LEFT_COL_W, ROW_HH),
  lbl('税務署長', ML, HY + ROW_HH, 12, ROW_HH, { fontSize: 2.8, writingMode: 'vertical-rl' }),
  lbl('給与の支払者の\n法人（個人）番号', ML + 12, HY + ROW_HH, 18, ROW_HH, { fontSize: 2.5, textAlign: 'left', paddingLeft: 1 }),
  lbl('※この申告書の提出を受けた給与の支払者が記載してください。', ML + 30, HY + ROW_HH, LEFT_COL_W - 31, 4, { fontSize: 2.2, textAlign: 'left' }),
  // 個人番号欄（13桁グリッド）
  lbl('あなたの個人番号', ML + LEFT_COL_W + 1, HY + ROW_HH, 25, 4, { fontSize: 2.5, textAlign: 'left' }),
  input(ML + LEFT_COL_W + 26, HY + ROW_HH + 4, 80, 5, { gridCount: 12, displayMode: 'grid', fontSize: 3.5 }),
  lbl('あなたとの続柄', ML + LEFT_COL_W + 108, HY + ROW_HH, 20, 4, { fontSize: 2.5, textAlign: 'left' }),
  input(ML + LEFT_COL_W + 108, HY + ROW_HH + 4, 20, 5, { fontSize: 3.0 }),
)

// Row 3: 市区町村長
elements.push(
  rect(ML, HY + ROW_HH * 2, LEFT_COL_W, ROW_HH),
  lbl('市区町村長', ML, HY + ROW_HH * 2, 12, ROW_HH, { fontSize: 2.8, writingMode: 'vertical-rl' }),
  lbl('給与の支払者の\n所在地（住所）', ML + 12, HY + ROW_HH * 2, 18, ROW_HH, { fontSize: 2.5, textAlign: 'left', paddingLeft: 1 }),
  input(ML + 30, HY + ROW_HH * 2 + 1, LEFT_COL_W - 31, ROW_HH - 2, { fontSize: 3.0 }),
  // 住所欄
  lbl('あなたの住所\n又は居所', ML + LEFT_COL_W + 1, HY + ROW_HH * 2, 20, ROW_HH, { fontSize: 2.5, textAlign: 'left' }),
  lbl('（郵便番号', ML + LEFT_COL_W + 21, HY + ROW_HH * 2, 18, 4, { fontSize: 2.5, textAlign: 'left' }),
  input(ML + LEFT_COL_W + 21, HY + ROW_HH * 2 + 4, 18, 5, { fontSize: 3.0 }),
  input(ML + LEFT_COL_W + 40, HY + ROW_HH * 2 + 1, 68, ROW_HH - 2, { fontSize: 3.0 }),
  lbl('配偶者\nの有無', ML + LEFT_COL_W + 110, HY + ROW_HH * 2, 15, ROW_HH, { fontSize: 2.5 }),
  lbl('有', ML + LEFT_COL_W + 126, HY + ROW_HH * 2 + 2, 8, 5, { fontSize: 3.0 }),
  checkbox(ML + LEFT_COL_W + 124, HY + ROW_HH * 2 + 7, 4),
  lbl('無', ML + LEFT_COL_W + 133, HY + ROW_HH * 2 + 2, 8, 5, { fontSize: 3.0 }),
  checkbox(ML + LEFT_COL_W + 131, HY + ROW_HH * 2 + 7, 4),
)

// ════════════════════════════════════════════════════════
// 3. 注意書き
// ════════════════════════════════════════════════════════
elements.push(
  lbl('あなたに源泉控除対象配偶者、控除対象扶養親族がなく、かつ、あなた自身が障害者、寡婦、ひとり親又は勤労学生のいずれにも該当しない場合は、以下の各欄に記入する必要はありません',
    ML, Y.warn, TABLE_W, ROW_H.warn,
    { fontSize: 2.5, textAlign: 'left', paddingLeft: 1 }),
)

// ════════════════════════════════════════════════════════
// 4. メインテーブル（列ヘッダー）
// ════════════════════════════════════════════════════════
const CH_Y = Y.colHead
const CH_H = ROW_H.colHead

// 外枠
elements.push(rect(ML, CH_Y, TABLE_W, CH_H))

// 縦仕切り（列ヘッダー）
const colBoundaries = [
  COL.kubun.x + COL.kubun.w,
  COL.name.x + COL.name.w,
  COL.kankei.x + COL.kankei.w,
  COL.myNumber.x + COL.myNumber.w,
  COL.birthday.x + COL.birthday.w,
  COL.tokutei.x + COL.tokutei.w,
  COL.income.x + COL.income.w,
  COL.nonRes.x + COL.nonRes.w,
  COL.address.x + COL.address.w,
  COL.seikei.x + COL.seikei.w,
]
for (const bx of colBoundaries) {
  elements.push(line(bx, CH_Y, CH_H, { vertical: true }))
}

// 列ヘッダーラベル
elements.push(
  lbl('区\n分\n等', COL.kubun.x, CH_Y, COL.kubun.w, CH_H, { fontSize: 2.8 }),
  lbl('（フリガナ）\n氏　　　名', COL.name.x, CH_Y, COL.name.w, CH_H, { fontSize: 2.5 }),
  lbl('あなたとの\n続柄', COL.kankei.x, CH_Y, COL.kankei.w, CH_H, { fontSize: 2.5 }),
  lbl('個　人　番　号', COL.myNumber.x, CH_Y, COL.myNumber.w, CH_H, { fontSize: 2.2 }),
  lbl('生　年　月　日\n（明11.1.1〜）', COL.birthday.x, CH_Y, COL.birthday.w, CH_H, { fontSize: 2.2 }),
  lbl('特定扶養親族等\n（平15.1.2〜\n平19.1.1生）', COL.tokutei.x, CH_Y, COL.tokutei.w, CH_H, { fontSize: 1.8 }),
  lbl('令和7年中の\n所得の見積額', COL.income.x, CH_Y, COL.income.w, CH_H, { fontSize: 2.2 }),
  lbl('非居住者で\nある親族', COL.nonRes.x, CH_Y, COL.nonRes.w, CH_H, { fontSize: 2.2 }),
  lbl('住　所　又　は　居　所', COL.address.x, CH_Y, COL.address.w, CH_H, { fontSize: 2.5 }),
  lbl('生計を一に\nする事実', COL.seikei.x, CH_Y, COL.seikei.w, CH_H, { fontSize: 2.2 }),
  lbl('異動月日及び事由', COL.ido.x, CH_Y, COL.ido.w, CH_H, { fontSize: 2.2 }),
)

// ════════════════════════════════════════════════════════
// 5. 左の垂直ラベル帯「主たる給与から控除を受ける」
// ════════════════════════════════════════════════════════
const MAIN_ROWS_H = (Y.rowA - CH_Y - CH_H) + ROW_H.rowA + ROW_H.rowB * 4 + ROW_H.rowC + ROW_H.rowD
elements.push(
  rect(ML, CH_Y + CH_H, COL.leftBand.w, MAIN_ROWS_H, { fill: '#f5f5f5' }),
  vlbl('主たる給与から控除を受ける',
    ML, CH_Y + CH_H, COL.leftBand.w, MAIN_ROWS_H, 2.5),
)

// ════════════════════════════════════════════════════════
// ヘルパー: 各行のセル入力欄を生成
// ════════════════════════════════════════════════════════
function buildPersonRow(rowY: number, rowH: number): ReportElement[] {
  const els: ReportElement[] = []
  // 外枠
  els.push(rect(COL.kubun.x, rowY, TABLE_W - COL.kubun.x + ML, rowH))

  // 縦仕切り
  for (const bx of colBoundaries) {
    els.push(line(bx, rowY, rowH, { vertical: true }))
  }

  // フリガナ行 (上半分)
  const halfH = rowH / 2
  els.push(
    lbl('フリガナ', COL.name.x + 1, rowY + 1, COL.name.w - 2, 3.5, { fontSize: 2.2, textAlign: 'left' }),
    input(COL.name.x + 8, rowY + 1, COL.name.w - 9, 3.5, { fontSize: 2.8 }),
    lbl('氏名', COL.name.x + 1, rowY + halfH, COL.name.w - 2, halfH, { fontSize: 2.8, textAlign: 'left', verticalAlign: 'middle' }),
    input(COL.name.x + 8, rowY + halfH + 1, COL.name.w - 9, halfH - 2, { fontSize: 3.5 }),
  )

  // 続柄
  els.push(input(COL.kankei.x + 1, rowY + 1, COL.kankei.w - 2, rowH - 2, { fontSize: 3.0 }))

  // 個人番号 (12桁)
  els.push(input(COL.myNumber.x + 1, rowY + 1, COL.myNumber.w - 2, rowH - 2, { gridCount: 12, displayMode: 'grid', fontSize: 3.0 }))

  // 生年月日
  els.push(
    eraSelect(COL.birthday.x + 1, rowY + 1, 7, rowH - 2),
    input(COL.birthday.x + 8, rowY + 1, 8, 5, { label: '年', fontSize: 3.0 }),
    lbl('年', COL.birthday.x + 16, rowY + 2, 3, 4, { fontSize: 2.5 }),
    input(COL.birthday.x + 8, rowY + 6, 4, 5, { label: '月', fontSize: 3.0 }),
    lbl('月', COL.birthday.x + 12, rowY + 7, 3, 4, { fontSize: 2.5 }),
    input(COL.birthday.x + 14, rowY + 6, 4, 5, { label: '日', fontSize: 3.0 }),
    lbl('日', COL.birthday.x + 18, rowY + 7, 3, 4, { fontSize: 2.5 }),
  )

  // 令和7年中所得の見積額
  els.push(
    input(COL.income.x + 1, rowY + 1, COL.income.w - 2, rowH - 6, { fontSize: 3.0 }),
    lbl('円', COL.income.x + COL.income.w - 4, rowY + rowH - 6, 4, 5, { fontSize: 2.5 }),
  )

  // 非居住者チェック
  els.push(
    checkbox(COL.nonRes.x + 1, rowY + 2, 3.5),
    lbl('非居住者\nである親族', COL.nonRes.x + 5, rowY + 1, COL.nonRes.w - 6, rowH - 2, { fontSize: 2.2 }),
  )

  // 住所又は居所
  els.push(input(COL.address.x + 1, rowY + 1, COL.address.w - 2, rowH - 2, { fontSize: 2.8 }))

  // 生計を一にする事実
  els.push(input(COL.seikei.x + 1, rowY + 1, COL.seikei.w - 2, rowH - 2, { fontSize: 2.8 }))

  // 異動月日及び事由
  els.push(input(COL.ido.x + 1, rowY + 1, COL.ido.w - 2, rowH - 2, { fontSize: 2.8 }))

  return els
}

// ════════════════════════════════════════════════════════
// 6. セクション A — 源泉控除対象配偶者（注1）
// ════════════════════════════════════════════════════════
elements.push(
  rect(COL.kubun.x, Y.rowA - 4, COL.kubun.w, ROW_H.rowA + 4, { fill: '#f9f9f9' }),
  lbl('源泉控除\n対象配偶者\n（注1）',
    COL.kubun.x, Y.rowA - 4, COL.kubun.w, ROW_H.rowA + 4,
    { fontSize: 2.5, fontWeight: 'bold' }),
  lbl('A', COL.leftBand.x, Y.rowA - 2, COL.leftBand.w, 5, { fontSize: 3.5, fontWeight: 'bold' }),
  ...buildPersonRow(Y.rowA, ROW_H.rowA),
)

// DIFF-09: Section A「生計を一にする事実」欄の注記テキスト
elements.push(
  lbl('（該当する場合は□を\n付けてください）',
    COL.seikei.x + 1, Y.rowA + ROW_H.rowA - 7,
    COL.seikei.w - 2, 6,
    { fontSize: 1.6, textAlign: 'left', verticalAlign: 'bottom' }),
)

// ════════════════════════════════════════════════════════
// 7. セクション B — 控除対象扶養親族（16歳以上）
// ════════════════════════════════════════════════════════
const B_LABEL_Y = Y.rowB1
const B_LABEL_H = ROW_H.rowB * 4
elements.push(
  rect(COL.kubun.x, B_LABEL_Y, COL.kubun.w, B_LABEL_H, { fill: '#f9f9f9' }),
  lbl('控除対象\n扶養親族\n（16歳以上）\n（平22.1.1以前生）',
    COL.kubun.x, B_LABEL_Y, COL.kubun.w, B_LABEL_H,
    { fontSize: 2.2, fontWeight: 'bold' }),
  lbl('B', COL.leftBand.x, B_LABEL_Y, COL.leftBand.w, 5, { fontSize: 3.5, fontWeight: 'bold' }),
)

const B_ROWS = [Y.rowB1, Y.rowB2, Y.rowB3, Y.rowB4]
B_ROWS.forEach((rowY, idx) => {
  elements.push(
    lbl(String(idx + 1), COL.kubun.x + 1, rowY + 1, 4, ROW_H.rowB - 2, { fontSize: 3.0, fontWeight: 'bold' }),
    ...buildPersonRow(rowY, ROW_H.rowB),
  )
  // B 行専用チェックボックス
  const cbX = COL.tokutei.x + 1
  elements.push(
    checkbox(cbX, rowY + 1, 3.5),
    lbl('同居老親等', cbX + 4, rowY + 1, 10, 4, { fontSize: 2.2, textAlign: 'left' }),
    checkbox(cbX, rowY + 6, 3.5),
    lbl('その他', cbX + 4, rowY + 6, 10, 4, { fontSize: 2.2, textAlign: 'left' }),
    checkbox(cbX, rowY + 11, 3.5),
    lbl('特定扶養親族', cbX + 4, rowY + 11, COL.tokutei.w - 5, 4, { fontSize: 2.2, textAlign: 'left' }),
  )
  // 非居住者詳細チェック（4項目）
  const nbX = COL.nonRes.x + 1
  elements.push(
    checkbox(nbX, rowY + 1, 3.0),
    lbl('16歳以上30歳未満\n又は70歳以上', nbX + 4, rowY + 1, COL.nonRes.w - 5, 5, { fontSize: 1.9, textAlign: 'left' }),
    checkbox(nbX, rowY + 6, 3.0),
    lbl('留学', nbX + 4, rowY + 6, 10, 3.5, { fontSize: 2.0, textAlign: 'left' }),
    checkbox(nbX, rowY + 10, 3.0),
    lbl('障害者', nbX + 4, rowY + 10, 10, 3.5, { fontSize: 2.0, textAlign: 'left' }),
    checkbox(nbX, rowY + 13, 3.0),
    lbl('38万円以上の支払', nbX + 4, rowY + 13, COL.nonRes.w - 5, 3, { fontSize: 1.8, textAlign: 'left' }),
  )
})

// ════════════════════════════════════════════════════════
// 8. セクション C — 障害者、寡婦、ひとり親又は勤労学生
// ════════════════════════════════════════════════════════
const CY = Y.rowC
const CH2 = ROW_H.rowC
elements.push(
  rect(ML, CY, TABLE_W, CH2),
  rect(COL.kubun.x, CY, COL.kubun.w, CH2, { fill: '#f9f9f9' }),
  lbl('障害者、寡婦、\nひとり親\n又は勤労学生',
    COL.kubun.x, CY, COL.kubun.w, CH2,
    { fontSize: 2.2, fontWeight: 'bold' }),
  lbl('C', COL.leftBand.x, CY, COL.leftBand.w, 5, { fontSize: 3.5, fontWeight: 'bold' }),
)

// C行 — DIFF-08: 「区分」列ラベル
elements.push(
  lbl('区分', COL.kubun.x, CY, COL.kubun.w, 5,
    { fontSize: 2.2, fontWeight: 'bold', verticalAlign: 'top' }),
)

// C行 — 障害者区分
const C_COLS = ['一般障害者', '特別障害者', '同居特別障害者']
const C_ROLES = ['本人', '同一生計配偶者\n(注2)', '扶養親族']
const C_COL_W = 22
const C_ROW_H = 7

C_COLS.forEach((ctype, ci) => {
  const cx = COL.name.x + ci * (C_COL_W + 2)
  elements.push(
    rect(cx, CY, C_COL_W + 2, CH2),
    lbl(ctype, cx, CY, C_COL_W + 2, 5, { fontSize: 2.5, fontWeight: 'bold', backgroundColor: '#eeeeee' }),
  )
  C_ROLES.forEach((role, ri) => {
    const ry = CY + 5 + ri * C_ROW_H
    elements.push(
      checkbox(cx + 1, ry + 1, 3.5),
      lbl(role, cx + 5, ry, C_COL_W - 4, C_ROW_H, { fontSize: 2.2, textAlign: 'left', verticalAlign: 'middle' }),
    )
  })
})

// 寡婦・ひとり親・勤労学生 チェック
const MISC_X = COL.name.x + (C_COL_W + 2) * 3 + 2
elements.push(
  checkbox(MISC_X, CY + 2, 4),
  lbl('寡婦', MISC_X + 5, CY + 2, 12, 5, { fontSize: 2.8, textAlign: 'left' }),
  checkbox(MISC_X, CY + 9, 4),
  lbl('ひとり親', MISC_X + 5, CY + 9, 12, 5, { fontSize: 2.8, textAlign: 'left' }),
  checkbox(MISC_X, CY + 16, 4),
  lbl('勤労学生', MISC_X + 5, CY + 16, 12, 5, { fontSize: 2.8, textAlign: 'left' }),
)

// C行 — 障害者又は勤労学生の内容
elements.push(
  lbl('障害者又は勤労学生の内容（この欄の記載に当たっては、裏面の「2 記載についてのご注意」の9をお読みください。）',
    COL.seikei.x, CY, COL.seikei.w + COL.ido.w, 5, { fontSize: 2.0, textAlign: 'left' }),
  input(COL.seikei.x, CY + 5, COL.seikei.w + COL.ido.w, CH2 - 6, { fontSize: 2.8 }),
  lbl('異動月日及び事由', COL.ido.x, CY, COL.ido.w, 5, { fontSize: 2.2, textAlign: 'left' }),
)

// ════════════════════════════════════════════════════════
// 9. セクション D — 他の所得者が控除を受ける扶養親族等
// ════════════════════════════════════════════════════════
const DY = Y.rowD
const DH = ROW_H.rowD
elements.push(
  rect(ML, DY, TABLE_W, DH),
  rect(COL.kubun.x, DY, COL.kubun.w + COL.name.w, DH / 2, { fill: '#f9f9f9' }),
  lbl('D', COL.leftBand.x, DY, COL.leftBand.w, 5, { fontSize: 3.5, fontWeight: 'bold' }),
  lbl('他の所得者が\n控除を受ける\n扶養親族等',
    COL.kubun.x, DY, COL.kubun.w, DH, { fontSize: 2.2, fontWeight: 'bold' }),
)

// D行 2件
for (let di = 0; di < 2; di++) {
  const dRowY = DY + di * (DH / 2)
  elements.push(
    lbl('氏名', COL.name.x, dRowY, 6, DH / 2, { fontSize: 2.5, textAlign: 'left', paddingLeft: 1 }),
    input(COL.name.x + 6, dRowY + 1, COL.name.w - 7, DH / 2 - 2, { fontSize: 3.0 }),
    lbl('あなたとの\n続柄', COL.kankei.x, dRowY, COL.kankei.w, DH / 2, { fontSize: 2.2 }),
    input(COL.kankei.x + 1, dRowY + 1, COL.kankei.w - 2, DH / 2 - 2, { fontSize: 3.0 }),
    lbl('生年月日', COL.myNumber.x, dRowY, COL.myNumber.w, 4, { fontSize: 2.2, textAlign: 'left', paddingLeft: 1 }),
    eraSelect(COL.myNumber.x + 1, dRowY + 4, 7, DH / 2 - 5),
    input(COL.myNumber.x + 9, dRowY + 4, COL.myNumber.w - 10, DH / 2 - 5, { fontSize: 2.5 }),
    lbl('住所又は居所', COL.birthday.x, dRowY, COL.birthday.w + COL.tokutei.w, 4, { fontSize: 2.2, textAlign: 'left', paddingLeft: 1 }),
    input(COL.birthday.x + 1, dRowY + 4, COL.birthday.w + COL.tokutei.w - 2, DH / 2 - 5, { fontSize: 3.0 }),
    lbl('控除を受ける他の所得者\n氏名', COL.income.x, dRowY, COL.income.w + COL.nonRes.w, DH / 2, { fontSize: 2.2 }),
    input(COL.income.x + 1, dRowY + 1, COL.income.w + COL.nonRes.w - 2, DH / 2 - 2, { fontSize: 3.0 }),
    lbl('続柄', COL.address.x, dRowY, COL.address.w / 3, DH / 2, { fontSize: 2.2 }),
    input(COL.address.x + COL.address.w / 3, dRowY + 1, COL.address.w - COL.address.w / 3 - 1, DH / 2 - 2, { fontSize: 3.0 }),
    lbl('異動月日及び事由', COL.seikei.x, dRowY, COL.seikei.w + COL.ido.w, 4, { fontSize: 2.2, textAlign: 'left', paddingLeft: 1 }),
    input(COL.seikei.x + 1, dRowY + 4, COL.seikei.w + COL.ido.w - 2, DH / 2 - 5, { fontSize: 3.0 }),
  )
}

// ════════════════════════════════════════════════════════
// 10. 注1 (脚注ボックス)
// ════════════════════════════════════════════════════════
elements.push(
  rect(ML, Y.note1, TABLE_W, ROW_H.note1),
  lbl(
    '（注1）源泉控除対象配偶者とは、所得者（令和7年中の所得の見積額が900万円以下の人に限ります。）と生計を一にする配偶者（青色事業専従者として給与の支払を受ける人及び白色事業専従者を除きます。）で、令和7年中の所得の見積額が95万円以下（給与所得だけの場合は、給与の収入金額が150万円以下）の人をいいます。',
    ML + 1, Y.note1 + 1, TABLE_W - 2, ROW_H.note1 / 2 - 1,
    { fontSize: 2.2, textAlign: 'left', verticalAlign: 'top' }),
  lbl(
    '（注2）同一生計配偶者とは、所得者と生計を一にする配偶者（青色事業専従者として給与の支払を受ける人及び白色事業専従者を除きます。）で、令和7年中の所得の見積額が48万円以下の人をいいます。',
    ML + 1, Y.note1 + ROW_H.note1 / 2 + 1, TABLE_W - 2, ROW_H.note1 / 2 - 2,
    { fontSize: 2.2, textAlign: 'left', verticalAlign: 'top' }),
)

// ════════════════════════════════════════════════════════
// 11. 住民税に関する事項
// ════════════════════════════════════════════════════════
const JY = Y.juminHdr
elements.push(
  rect(ML, JY, TABLE_W, 6, { fill: '#e8e8e8' }),
  lbl('○住民税に関する事項（この欄は、地方税法第45条の3の2及び第317条の3の2に基づき、給与の支払を経由して市区町村長に提出する給与所得者の扶養親族等申告書の記載欄を兼ねています。）',
    ML + 1, JY + 1, TABLE_W - 2, 4,
    { fontSize: 2.2, textAlign: 'left' }),
)

// ─── 住民税: 16歳未満の扶養親族 ──────────────────────────
const JH = ROW_H.jumin
const J_COL_W = [16, 22, 8, 8, 20, 35, 22, 14, 20]  // 各列幅
const J_COL_LABELS = ['（フリガナ）\n氏名', '個人番号', 'あなたとの\n続柄', '生\n年\n月\n日', '住所又は居所', '控除対象外国外扶養親族', '令和7年中の\n所得の見積額', '障害者\n区分', '異動月日\n及び事由']
const jLabels_y = Y.jumin1 - 8
elements.push(
  rect(ML, jLabels_y, TABLE_W, 8, { fill: '#f0f0f0' }),
  rect(ML, jLabels_y, 16, 8, { fill: '#f0f0f0' }),
  lbl('16歳未満の\n扶養親族\n（平22.1.2以後生）',
    ML, jLabels_y, 16, 8, { fontSize: 2.2, fontWeight: 'bold' }),
)

let jX = ML + 16
for (let ci = 0; ci < J_COL_W.length; ci++) {
  elements.push(
    line(jX, jLabels_y, 8, { vertical: true }),
    lbl(J_COL_LABELS[ci], jX, jLabels_y, J_COL_W[ci], 8, { fontSize: 2.0 }),
  )
  jX += J_COL_W[ci]
}

// 2行
const J_BIRTHDAY_CI = 3  // 生年月日列のインデックス
for (let ji = 0; ji < 2; ji++) {
  const jRowY = Y.jumin1 + ji * JH
  elements.push(
    rect(ML, jRowY, TABLE_W, JH),
    lbl(String(ji + 1), ML + 1, jRowY, 14, JH, { fontSize: 3.0, fontWeight: 'bold' }),
  )
  let jix = ML + 16
  for (let ci = 0; ci < J_COL_W.length; ci++) {
    elements.push(line(jix, jRowY, JH, { vertical: true }))
    if (ci === J_BIRTHDAY_CI) {
      // 生年月日: 「平」固定プレフィックス + 年月日入力
      elements.push(
        lbl('平', jix + 1, jRowY + 1, 3, JH - 2, { fontSize: 2.0, textAlign: 'left', verticalAlign: 'top' }),
        input(jix + 4, jRowY + 1, J_COL_W[ci] - 5, JH - 2, { fontSize: 2.5 }),
      )
    } else {
      elements.push(input(jix + 1, jRowY + 1, J_COL_W[ci] - 2, JH - 2, { fontSize: 2.8 }))
    }
    jix += J_COL_W[ci]
  }
}

// ─── 住民税: 退職手当等を有する配偶者・扶養親族 ─────────────
const TY = Y.taishoku
elements.push(
  rect(ML, TY, TABLE_W, ROW_H.taishoku),
  rect(ML, TY, 16, ROW_H.taishoku, { fill: '#f0f0f0' }),
  lbl('退職手当等を有する\n配偶者・扶養親族',
    ML, TY, 16, ROW_H.taishoku, { fontSize: 2.2, fontWeight: 'bold' }),
)

const T_BIRTHDAY_LABEL = '生年月日'
const T_COLS: [string, number][] = [
  ['（フリガナ）\n氏名', 16], ['個人番号', 22], ['あなたとの続柄', 10],
  [T_BIRTHDAY_LABEL, 10], ['住所又は居所', 25], ['非居住者', 12],
  ['令和7年中の所得（退職所得を除く）', 28], ['障害者区分', 10], ['異動月日及び事由', 18],
]
let tX = ML + 16
for (const [tLabel, tW] of T_COLS) {
  elements.push(
    line(tX, TY, ROW_H.taishoku, { vertical: true }),
    lbl(tLabel, tX, TY, tW, 5, { fontSize: 2.0 }),
  )
  if (tLabel === T_BIRTHDAY_LABEL) {
    // 生年月日: 元号選択 + 年月日入力
    elements.push(
      eraSelect(tX + 1, TY + 5, 6, ROW_H.taishoku - 6),
      input(tX + 7, TY + 5, tW - 8, ROW_H.taishoku - 6, { fontSize: 2.5 }),
    )
  } else {
    elements.push(input(tX + 1, TY + 5, tW - 2, ROW_H.taishoku - 6, { fontSize: 2.8 }))
  }
  tX += tW
}

// ════════════════════════════════════════════════════════
// 12. 下部脚注エリア
// ════════════════════════════════════════════════════════
elements.push(
  rect(ML, Y.bottom, TABLE_W, A4_H - Y.bottom - MT),
  lbl('（注）退職手当等（源泉徴収をされるものに限ります。）の支払を受ける配偶者又は扶養親族がいる場合に記載してください。なお、退職所得の金額の計算については、給与の支払者にお尋ねください。',
    ML + 1, Y.bottom + 1, TABLE_W - 2, 8,
    { fontSize: 2.2, textAlign: 'left', verticalAlign: 'top' }),
  // 寡婦・ひとり親チェック（退職欄右端）
  checkbox(ML + TABLE_W - 40, TY + 2, 4),
  lbl('寡婦', ML + TABLE_W - 35, TY + 2, 10, 5, { fontSize: 2.5, textAlign: 'left' }),
  checkbox(ML + TABLE_W - 40, TY + 8, 4),
  lbl('ひとり親', ML + TABLE_W - 35, TY + 8, 12, 5, { fontSize: 2.5, textAlign: 'left' }),
)

// ─── テンプレート定義 ────────────────────────────────────
export const FUYOU_KOJO_TEMPLATE: Template = {
  id: 'fuyou-kojo-r7',
  name: '扶養控除等申告書（令和7年分）',
  description: '令和7年分 給与所得者の扶養控除等（異動）申告書（国税庁様式）',
  pages: [
    {
      id: uuidv4(),
      name: '申告書',
      background: '#ffffff',
      width: A4_W,
      height: A4_H,
      sections: [
        {
          id: uuidv4(),
          sectionType: 'body',
          height: A4_H,
          elements,
        },
      ],
    },
  ],
  settings: {
    paperSize: 'A4',
    orientation: 'portrait',
    margin: { top: 3, right: 3, bottom: 3, left: 3 },
    unit: 'mm',
  },
}

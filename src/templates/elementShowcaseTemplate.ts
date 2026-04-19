/**
 * Element Showcase Template — contains all 15 element types for PDF export testing.
 * Used to verify that every element type renders correctly in both canvas and PDF output.
 */
import { v4 as uuidv4 } from 'uuid'
import type { Template, ReportElement } from '@/types'

const A4_W = 210
const A4_H = 297

let z = 1
function el(type: string, x: number, y: number, w: number, h: number, props: Record<string, unknown>): ReportElement {
  return {
    id: uuidv4(),
    type,
    position: { x, y },
    size: { width: w, height: h },
    zIndex: z++,
    locked: false,
    visible: true,
    ...props,
  } as ReportElement
}

// --- Page 1: Text + Data ---
const page1Elements: ReportElement[] = [
  // 1. text (horizontal + token)
  el('text', 10, 10, 190, 10, {
    content: '要素ショーケース — {{title}}',
    style: { fontSize: 17, fontWeight: 'bold', textAlign: 'center', color: '#1a1a1a' },
  }),
  // 2. text (vertical + furigana)
  el('text', 10, 25, 15, 50, {
    content: '縦書きテスト',
    style: { fontSize: 11, writingMode: 'vertical-rl', color: '#000000' },
    furigana: 'たてがきてすと',
    furiganaScale: 0.5,
  }),
  // 3. dataField (currency format)
  el('dataField', 30, 25, 60, 8, {
    fieldKey: 'amount',
    label: '金額',
    fallbackText: '¥0',
    style: { fontSize: 11, textAlign: 'right', color: '#000000' },
    format: { type: 'currency_jpy' },
  }),
  // 4. dataField (wareki format)
  el('dataField', 30, 35, 60, 8, {
    fieldKey: 'date',
    label: '日付',
    style: { fontSize: 10, color: '#000000' },
    format: { type: 'wareki_full' },
  }),
  // 5. image
  el('image', 100, 25, 40, 30, {
    src: '',
    alt: 'テスト画像',
    objectFit: 'contain',
  }),
  // 6. shape (rectangle)
  el('shape', 145, 25, 55, 30, {
    shape: 'rectangle',
    fill: '#eff6ff',
    stroke: '#3b82f6',
    strokeWidth: 0.5,
    borderRadius: 2,
  }),
  // 7. shape (line)
  el('shape', 10, 80, 190, 0.5, {
    shape: 'line',
    stroke: '#d1d5db',
    strokeWidth: 0.3,
  }),
  // 8. chart (bar)
  el('chart', 10, 85, 90, 60, {
    chartType: 'bar',
    title: '月別売上',
    xAxisKey: 'month',
    yAxisKeys: ['revenue'],
    showLegend: true,
    showGrid: true,
  }),
  // 9. chart (pie)
  el('chart', 110, 85, 90, 60, {
    chartType: 'pie',
    title: 'カテゴリ別',
    xAxisKey: 'name',
    yAxisKeys: ['value'],
    showLegend: true,
  }),
  // 10. barcode (QR)
  el('barcode', 10, 150, 25, 25, {
    kind: 'qr',
    value: 'https://example.com/showcase',
    errorCorrection: 'M',
  }),
  // 11. barcode (CODE128)
  el('barcode', 40, 150, 55, 15, {
    kind: 'code128',
    value: '1234567890',
    showText: true,
  }),
  // 12. barcode (CODE39)
  el('barcode', 100, 150, 50, 15, {
    kind: 'code39',
    value: 'HELLO',
    showText: true,
  }),
  // 13. barcode (JAN13/EAN-13)
  el('barcode', 155, 150, 50, 15, {
    kind: 'jan13',
    value: '4902778913406',
    showText: true,
  }),
]

// --- Page 2: Form + Japanese elements ---
const page2Elements: ReportElement[] = [
  // 14. checkbox (right label)
  el('checkbox', 10, 10, 40, 5, {
    checked: true,
    checkmark: '✓',
    label: '同意する',
    labelPosition: 'right',
  }),
  // 15. checkbox (left label)
  el('checkbox', 60, 10, 40, 5, {
    checked: false,
    checkmark: '×',
    label: '却下',
    labelPosition: 'left',
  }),
  // 16. eraSelect
  el('eraSelect', 10, 20, 80, 15, {
    layout: 'row',
    eras: ['明', '大', '昭', '平', '令'],
  }),
  // 17. hanko (circle)
  el('hanko', 10, 40, 15, 15, {
    text: '田',
    shape: 'circle',
    borderColor: '#cc0000',
    textColor: '#cc0000',
    fontSize: 14,
    writingMode: 'horizontal-tb',
    doubleBorder: false,
  }),
  // 18. hanko (rectangle + double border)
  el('hanko', 30, 40, 15, 15, {
    text: '承認',
    shape: 'rectangle',
    borderColor: '#cc0000',
    textColor: '#cc0000',
    fontSize: 11,
    writingMode: 'vertical-rl',
    doubleBorder: true,
  }),
  // 19. manualEntry (line)
  el('manualEntry', 10, 60, 80, 10, {
    label: '氏名',
    labelPosition: 'left',
    displayMode: 'line',
    lineColor: '#000000',
    style: { fontSize: 10 },
  }),
  // 20. manualEntry (grid)
  el('manualEntry', 10, 75, 80, 10, {
    label: '電話番号',
    labelPosition: 'top',
    displayMode: 'grid',
    gridCount: 11,
    lineColor: '#000000',
    style: { fontSize: 10 },
  }),
  // 21. manualEntry (box + furigana)
  el('manualEntry', 10, 92, 80, 15, {
    label: 'フリガナ付き',
    labelPosition: 'top',
    displayMode: 'box',
    lineColor: '#000000',
    style: { fontSize: 10 },
    furiganaEnabled: true,
    furiganaRatio: 0.35,
  }),
  // 22. approvalStampRow
  el('approvalStampRow', 100, 40, 100, 20, {
    cells: [
      { role: '担当', width: 25 },
      { role: '主任', width: 25 },
      { role: '課長', width: 25 },
      { role: '部長', width: 25 },
    ],
    labelPosition: 'top',
    borderColor: '#000000',
    borderWidth: 0.3,
    cellHeight: 15,
  }),
  // 23. revenueStamp
  el('revenueStamp', 100, 65, 30, 20, {
    amount: '200円',
    borderColor: '#000000',
    borderWidth: 0.3,
    showLabel: true,
    showCancellationGuide: true,
  }),
  // 24. repeatingBand
  el('repeatingBand', 10, 115, 190, 80, {
    dataSource: 'items',
    itemHeight: 6,
    maxItems: 10,
    showHeader: true,
    showFooter: true,
    showEmptyRowLines: true,
    fields: [
      { key: 'name', label: '品名', width: 60, align: 'left' },
      { key: 'qty', label: '数量', width: 25, align: 'right' },
      { key: 'price', label: '単価', width: 35, align: 'right' },
      { key: 'total', label: '金額', width: 40, align: 'right' },
    ],
    totals: [
      { fieldKey: 'total', formula: 'sum', label: '合計' },
    ],
    headerStyle: { backgroundColor: '#f3f4f6' },
    oddRowColor: '#ffffff',
    evenRowColor: '#f9fafb',
    borderColor: '#000000',
    borderWidth: 0.3,
  }),
]

export const ELEMENT_SHOWCASE_TEMPLATE: Template = {
  id: 'element-showcase',
  name: '要素ショーケース',
  description: '全15要素タイプを含むテストテンプレート。PDF出力検証用',
  pages: [
    {
      id: uuidv4(),
      name: 'テキスト・データ・グラフ',
      background: '#ffffff',
      width: A4_W,
      height: A4_H,
      sections: [{
        id: uuidv4(),
        sectionType: 'body',
        height: A4_H,
        elements: page1Elements,
      }],
    },
    {
      id: uuidv4(),
      name: 'フォーム・日本語帳票',
      background: '#ffffff',
      width: A4_W,
      height: A4_H,
      sections: [{
        id: uuidv4(),
        sectionType: 'body',
        height: A4_H,
        elements: page2Elements,
      }],
    },
  ],
  settings: {
    paperSize: 'A4',
    orientation: 'portrait',
    margin: { top: 10, right: 10, bottom: 10, left: 10 },
    unit: 'mm',
  },
}

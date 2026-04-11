---
status: complete
priority: p2
issue_id: "222"
tags: [code-review, performance, export, memory]
dependencies: []
---

# `exportReportToPdfBlob` が全ページを `Promise.all` で同時レンダリング — 20ページでOOM

## Problem Statement

`exportUtils.ts` の `exportReportToPdfBlob` は全ページを `Promise.all` で同時に `html2canvas` 処理する。
html2canvas が `scale: 2` で A4 ページをレンダリングすると約 14MB のキャンバスメモリを使用。
20ページのレポートでは同時に 280MB のキャンバスメモリを確保し、OOM またはブラウザフリーズを引き起こす。

## Findings

**File:** `src/lib/exportUtils.ts:232-233`

```typescript
const canvases = await Promise.all(
  pageEls.map((el) => html2canvas(el, { useCORS: true, scale: EXPORT_SCALE }))
)
// ← 20ページ = 20 × ~14MB = ~280MB 同時確保
```

**既存の `exportReportToPdf` も同じパターン** — こちらも同様に修正が必要。

## Proposed Solutions

### Option A: 逐次処理でキャンバスをすぐに解放（推奨）

```typescript
export async function exportReportToPdfBlob(pageEls: HTMLElement[]): Promise<Blob> {
  if (pageEls.length === 0) throw new Error('No pages to export')
  const totalPages = pageEls.length
  const allSnapshots = pageEls.map((el, i) => resolveAutoFields(el, i + 1, totalPages))
  try {
    const firstCanvas = await html2canvas(pageEls[0], { useCORS: true, scale: EXPORT_SCALE })
    const pdfWidth = firstCanvas.width / EXPORT_SCALE
    const pdfHeight = firstCanvas.height / EXPORT_SCALE
    const pdf = new jsPDF({ ... })
    
    for (let i = 0; i < pageEls.length; i++) {
      if (i > 0) pdf.addPage()
      const canvas = i === 0 ? firstCanvas : await html2canvas(pageEls[i], { useCORS: true, scale: EXPORT_SCALE })
      const imgData = canvas.toDataURL('image/png')
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
      // GPUメモリを即解放
      canvas.width = 0
      canvas.height = 0
    }
    return pdf.output('blob')
  } finally {
    pageEls.forEach((_, i) => restoreAutoFields(allSnapshots[i]))
  }
}
```

**Pros:** ピークメモリが O(1) ページ分のみ（~14MB）、大規模レポートに安全
**Cons:** 逐次処理で wall-clock 時間がやや長くなる（バックグラウンド処理なので許容範囲）
**Effort:** Small | **Risk:** Low

### Option B: バッチサイズ 3-4 で並列処理

最大メモリ削減と速度のバランス。

**Effort:** Small | **Risk:** Low

## Recommended Action

**Option A** を `exportReportToPdfBlob` と `exportReportToPdf` の両方に適用。

## Technical Details

**Affected file:** `src/lib/exportUtils.ts:228-248`

## Acceptance Criteria

- [ ] 20ページレポートのPDF生成がブラウザのOOMを引き起こさない
- [ ] ピーク Canvas メモリ使用量が O(n) でなく O(1) ページ分に収まる
- [ ] テスト: 20要素以上のページで pdf.output('blob') が成功する

## Work Log

- 2026-04-12: Discovered by Performance reviewer (P2)

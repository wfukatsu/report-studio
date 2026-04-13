---
status: complete
priority: p2
issue_id: "264"
tags: [code-review, architecture, output-variants, pii]
dependencies: []
---

# バリアントマスキングが dataField / repeatingBand に非対応

## Problem Statement

`variantApplicator.ts` のマスキング処理は `text` と `label` 要素のみに対応しており、`dataField`・`repeatingBand`・`chart`・`formTable` など動的データを表示する要素のマスキングができない。個人情報（税番号、給与など）を含む動的フィールドを対象読者ごとに隠すことが出来ず、バリアント機能の主用途を満たせない。

## Findings

`src/lib/variantApplicator.ts:30-47`:
```ts
function applyMaskingToElement(el, rules) {
  if (rule.type === 'fullReplace') {
    if (el.type === 'text' || el.type === 'label') {  // dataField 未対応
      return { ...el, content: rule.replaceValue }
    }
  }
}
```

`dataField`・`repeatingBand`・`formTable` 要素は `dataField`（フィールドキー）でデータソースを参照するが、この参照をマスキングするメカニズムが存在しない。

## Proposed Solutions

### Solution A: dataField 要素に maskingOverride フィールドを追加

```ts
// types/index.ts
interface DataFieldElement extends ElementBase {
  dataField: string
  maskingOverride?: string  // バリアント適用時に表示する代替値
}

// variantApplicator.ts
if (el.type === 'dataField' && rule.type === 'fullReplace') {
  return { ...el, maskingOverride: rule.replaceValue }
}
```

サーバーサイド PDF レンダラーおよびクライアントサイドレンダラーも `maskingOverride` を参照するよう更新が必要。

- Effort: Large
- Risk: Medium

### Solution B: hiddenElementIds でフィールドを全非表示（暫定）

完全マスキングの代わりに要素を非表示にすることで PII を隠す（代替値は表示できない）。

- Effort: Small（既存機能）
- Risk: Low（但し機能制限あり）

## Acceptance Criteria

- [ ] `dataField` 要素に対して `fullReplace` マスキングルールが適用できる
- [ ] サーバーサイドPDFでもマスクされた値が出力される
- [ ] バリアントプレビューでマスキング結果が確認できる

## Work Log

- 2026-04-13: architecture-strategist による code-review で発見（YELLOW — 機能ギャップ）

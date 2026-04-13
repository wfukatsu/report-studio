---
status: pending
priority: p1
issue_id: "247"
tags: [code-review, security, pii, output-variants, pdf-export]
dependencies: []
---

# バリアントマスキングがサーバーサイドPDFエクスポートでバイパスされる — PII漏洩

## Problem Statement

`doExportPdf(variant)` でサーバーサイドPDF生成パスが成功した場合、`variant` パラメータが完全に無視されており、マスキングが適用されていない生の `definition` オブジェクトがサーバーに送信される。出力バリアント機能の目的（対象者別のマスキングPDF）が機能しておらず、個人情報（PII）が漏洩する。

## Findings

**Location:** `src/components/toolbar/Toolbar.tsx:206-219`

```ts
const defJson = JSON.parse(JSON.stringify(definition)) as Record<string, unknown>
// ❌ variant が defJson に適用されていない
const blob = await generateStatelessPdf(defJson, dataJson)
downloadBlob(blob, filename)
return  // ← マスキングなしで終了
```

`applyVariant()` 関数 (`src/lib/variantApplicator.ts`) がこのパスでは一切呼ばれていない。

クライアントサイドフォールバック（lines 227–244）でも:
- `hiddenElementIds` による非表示は CSS `visibility: hidden` のみ（DOMから削除されない）
- `maskingRules` によるテキストマスキングが適用されない

**影響:**
- 外部向けコピーとして「社員番号マスク済み」バリアントを選択したユーザーが、完全なPIIを含むPDFを受け取る
- 日本の法的書類における個人情報保護法違反リスク

## Proposed Solutions

### Solution A: エクスポート前に applyVariant() を適用（推奨）

```ts
const defJson = JSON.parse(JSON.stringify(definition)) as Record<string, unknown>

// バリアントが指定されている場合はマスキングを適用
if (variant) {
  defJson.pages = applyVariant(definition.pages, variant)
}

const blob = await generateStatelessPdf(defJson, dataJson)
```

クライアントサイドフォールバックも同様に修正:
1. `applyVariant` で pages を変換
2. `hiddenElementIds` の要素を DOM から非表示にする（`display: none` or 削除）
3. `html2canvas` でキャプチャ

- Pros: 最小変更で根本解決
- Cons: サーバー側でも再マスキングが必要か検証が必要
- Effort: Small
- Risk: Medium（applyVariant のロジック検証が必要）

### Solution B: サーバーサイドでのマスキング適用

サーバーAPIにバリアントIDを渡し、サーバー側でマスキングを適用する。

- Pros: サーバー側で一元管理、改ざん防止
- Cons: バックエンド変更が必要、バリアント情報をサーバーが知っている必要がある
- Effort: Large
- Risk: High

## Acceptance Criteria

- [ ] バリアントを選択してPDFエクスポート時に `applyVariant()` が呼ばれる
- [ ] サーバーサイドPDF生成パスでマスキング済みの definition が送信される
- [ ] クライアントサイドフォールバックでも `maskingRules` が適用される
- [ ] 単体テスト: マスキング対象フィールドが出力PDFの定義から除外されていること

## Work Log

- 2026-04-13: security-sentinel による code-review で発見（CRITICAL）

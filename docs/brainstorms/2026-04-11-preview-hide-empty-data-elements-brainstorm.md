---
title: プレビュー・PDF出力でデータが空の要素を非表示にする
date: 2026-04-11
status: draft
feature_type: enhancement
scope: preview, pdf-export, data-binding
---

# プレビュー・PDF 出力でデータが空の要素を非表示にする

## What We're Building

プレビューモードおよび PDF 出力時に、データバインディングが設定されているが
実際のデータが空（未解決・null・空文字列・0件）の要素を自動的に非表示にする機能。

**現在の問題:**
- `dataField` 要素でデータが未設定 → フィールド名をグレーイタリックで表示してしまう
- `text` 要素で `{{customer_name}}` が未解決 → `{{customer_name}}` のまま表示される
- `repeatingBand` でデータ0件 → 空のバンド領域が表示される

**望ましい挙動（readonly / PDF 出力時）:**
これらの要素は `null` を返して非表示にする。

## Scope

### 対象要素・判定ルール

| 要素タイプ | 非表示条件 |
|---|---|
| `dataField` | `resolveField(data, el.fieldKey)` が空文字または未解決 |
| `text` ({{}} あり) | `interpolate(el.content, data)` が空文字 OR `{{...}}` が残存 |
| `repeatingBand` | データ配列が 0 件 |
| `chart` | `el.dataBinding` が設定済みかつデータ配列が 0 件 |
| その他（静的要素） | 変更なし（常に表示） |

**対象外（常に表示する要素）:**
- `dataBinding` も `{{}}` も持たない静的テキスト
- `shape` / `image` / `pageNumber` / `currentDate` などの静的要素
- `visible = false` が明示的に設定されている要素（既存ロジックで処理）

### 適用モード

- **プレビューパネル**（右サイドのライブプレビュー）
- **プレビューモーダル**（全ページ表示）
- **PDF 出力 / PNG 出力**

`readonly = true` のとき適用する（エディタ上では既存の表示を維持）。

## Chosen Approach: A — ElementRenderer に集中フィルタ

### 実装方針

`ElementRenderer.tsx` の既存可視性チェックに追加する:

```tsx
// 既存
if (!element.visible || !isConditionVisible) return null

// 追加（readonly かつデータが空のとき）
if (readonly && isDataEmpty(element, mergedData)) return null
```

### `isDataEmpty` 関数の仕様

```typescript
// src/lib/dataBinding.ts または新規 src/lib/previewUtils.ts に追加
function isDataEmpty(element: ReportElement, data: Record<string, unknown>): boolean
```

要素タイプごとの判定ロジック：

```typescript
switch (element.type) {
  case 'dataField':
    return resolveField(data, element.fieldKey) === ''

  case 'text':
  case 'label': {
    // {{...}} を持たない静的テキストは対象外
    if (!/\{\{[^}]+\}\}/.test(element.content)) return false
    const resolved = interpolate(element.content, data)
    // 解決後も {{...}} が残る、または完全に空の場合は非表示
    return resolved === '' || /\{\{[^}]+\}\}/.test(resolved)
  }

  case 'repeatingBand': {
    if (!element.dataSource) return false
    const items = data[element.dataSource]
    return !Array.isArray(items) || items.length === 0
  }

  case 'chart': {
    if (!element.dataBinding) return false
    const items = data[element.dataBinding]
    return !Array.isArray(items) || items.length === 0
  }

  default:
    return false
}
```

### 変更ファイル

| ファイル | 変更内容 |
|---|---|
| `src/components/canvas/ElementRenderer.tsx` | `isDataEmpty` チェックを追加（readonly 時） |
| `src/lib/dataBinding.ts` または `src/lib/previewUtils.ts` | `isDataEmpty()` 関数を追加 |
| `src/components/canvas/ElementRenderer.test.tsx`（新規） | readonly + empty data = null を検証するテスト |

## Key Decisions

1. **静的要素は変更なし** — データバインディングを持たない要素（図形、固定テキスト等）は影響を受けない
2. **エディタモードでは既存表示を維持** — `readonly = false` のときは現在の動作を保つ（デザイン中はプレースホルダーが見えるほうが有用）
3. **部分解決テキストの扱い** — `{{name}}` が空でも「注文者: 」のような静的テキストが残るケースは表示する（空文字 OR 未解決パターン残存のみ非表示）
4. **`repeatingBand` の 0件非表示** — ヘッダー行を含む帯全体を非表示にする

## Open Questions

なし（ユーザーとの対話で主要な決定事項は解決済み）

## Resolved Questions

- **Q: プレビューのみ vs PDF 出力も？** → 両方に適用（`readonly = true` 全体に適用）
- **Q: どの要素タイプが対象？** → dataField, text({{}}あり), repeatingBand, chart（全データバインド要素）
- **Q: 静的テキストは？** → 変更なし（常に表示）

## Success Criteria

- プレビュー時、dataField でデータが空 → 要素が表示されない
- プレビュー時、`{{customer_name}}` が未解決 → テキスト要素が表示されない
- プレビュー時、repeatingBand でデータ0件 → バンド全体が表示されない
- エディタモードでは既存の表示（グレーイタリック等）を維持する
- PDF 出力にも同じルールが適用される

## Out of Scope

- エディタ上での空データ表示の変更
- 要素ごとに「空データ時に非表示」を ON/OFF する設定 UI（将来的な拡張として検討可能）
- `formTable` セルレベルの空判定（テーブル全体の非表示は対象）

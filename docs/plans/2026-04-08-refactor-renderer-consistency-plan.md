---
title: "refactor: テキスト系レンダラーの一貫性改善"
type: refactor
status: completed
date: 2026-04-08
---

# refactor: テキスト系レンダラーの一貫性改善

## Overview

コードレビュー（5エージェント並列レビュー）で検出された、Text / Label / DataField レンダラー間の
コード重複・動作不整合・小さなバグを修正するリファクタリング。

## Problem Statement

1. **`toFlexAlign` が3ファイルに同一コピー** — 変更時に3箇所を同期する必要がある
2. **`wordBreak` の挙動がレンダラーごとに異なる** — Label は縦書き時 `break-all`、Text は常に `break-word`、DataField は未設定
3. **DataField に `whiteSpace: 'pre-wrap'` がない** — 改行・空白が潰される
4. **DataField に `fontStyle` がない** — イタリック設定が無視される
5. **`DEFAULT_ERAS` / `ALL_ERAS` が3箇所で重複** — Renderer, PropertiesPanel, elementFactories
6. **EraSelect のフォントサイズ計算で `eras: []` 時にゼロ除算** — `Infinity` フォントサイズ
7. **不要な `as React.CSSProperties['textAlign']` キャスト** — 型が既に正しい
8. **EraSelect PropertiesPanel の不要な Fragment** — 単一子要素を `<>` で包んでいる
9. **Label の `'break-all' as const`** — 不要な型アサーション

## Proposed Solution

### Phase 1: 共有ユーティリティ抽出

**`src/elements/_base/styleUtils.ts`** を新規作成:

```typescript
// src/elements/_base/styleUtils.ts
export function toFlexAlign(value: string | undefined): string {
  if (value === 'center' || value === 'middle') return 'center'
  if (value === 'right' || value === 'bottom' || value === 'end') return 'flex-end'
  return 'flex-start'
}
```

- [x] `src/elements/_base/styleUtils.ts` を作成し `toFlexAlign` をエクスポート
- [x] `src/elements/_base/styleUtils.test.ts` を作成（テスト内容: 全入力値 `'left'`, `'center'`, `'right'`, `'top'`, `'middle'`, `'bottom'`, `'end'`, `undefined` に対する出力を検証）
- [x] `src/elements/text/Renderer.tsx` — ローカル `toFlexAlign` を削除、共有モジュールからインポート
- [x] `src/elements/label/Renderer.tsx` — 同上
- [x] `src/elements/dataField/Renderer.tsx` — 同上

### Phase 2: レンダラー間の一貫性修正

- [x] **`wordBreak` の統一**: 全レンダラーで `isVertical ? 'break-all' : 'break-word'` に統一。縦書き時に `break-all` が必要な理由: `vertical-rl` ではインライン方向が縦になるため、`break-word` だと長い英単語が折り返されずコンテナからはみ出す
- [x] **DataField に `whiteSpace: 'pre-wrap'` を追加**: Text / Label と同じ挙動にする
- [x] **DataField に `fontStyle: style.fontStyle ?? 'normal'` を追加**: Text / Label と同じ挙動にする
- [x] **不要な `as React.CSSProperties['textAlign']` キャストを全3ファイルから除去**: `TextStyle.textAlign` は `'left' | 'center' | 'right' | 'justify'` で既に有効な部分型。ただし `?? 'left'` のフォールバックで型が `string` に広がる場合はキャスト維持
- [x] **Label の `'break-all' as const` を `'break-all'` に簡略化**

### Phase 3: EraSelect 定数統一 + バグ修正

**`src/elements/eraSelect/constants.ts`** を新規作成:

```typescript
// src/elements/eraSelect/constants.ts
export const DEFAULT_ERAS: string[] = ['明', '大', '昭', '平', '令']
```

- [x] `src/elements/eraSelect/constants.ts` を作成
- [x] `src/elements/eraSelect/Renderer.tsx` — ローカル `DEFAULT_ERAS` を削除、`constants.ts` からインポート
- [x] `src/elements/eraSelect/PropertiesPanel.tsx` — ローカル `ALL_ERAS` を削除、`constants.ts` の `DEFAULT_ERAS` をインポート
- [x] `src/lib/elementFactories.ts` — インライン配列を `DEFAULT_ERAS` インポートに置換
- [x] **ゼロ除算ガード追加**: `const count = Math.max(eras.length, 1)` （`Renderer.tsx:17`付近）
- [x] **不要な Fragment 除去**: `PropertiesPanel.tsx` で `<>...</>` を除去し `<PropSection>` を直接返す

### Phase 4: テスト実行・確認

- [x] `npm test -- --run` で全テスト通過を確認（1419 tests passed）
- [x] `npm run lint` でリント通過を確認（変更ファイルにエラーなし）
- [x] `npm run build` でビルド通過を確認（変更ファイルに型エラーなし）

## Technical Considerations

- **破壊的変更なし**: 全てリファクタリング。外部API・型の公開インターフェースに変更なし
- **`DEFAULT_ERAS` は `string[]` でエクスポート**: `as const` や branded type は不要。目的は3箇所の重複を1箇所にすることのみ
- **`toFlexAlign` の引数型は `string | undefined` を維持**: 呼び出し元で `textAlign` と `verticalAlign` の両方を渡すため、union型に絞るメリットが薄い

## Acceptance Criteria

- [ ] `toFlexAlign` が `src/elements/_base/styleUtils.ts` に1箇所のみ存在する
- [ ] Text / Label / DataField の `wordBreak` 挙動が統一されている
- [ ] DataField で `whiteSpace: 'pre-wrap'` と `fontStyle` が適用される
- [ ] `DEFAULT_ERAS` が `src/elements/eraSelect/constants.ts` に1箇所のみ存在する
- [ ] `eras: []` でもゼロ除算が発生しない
- [ ] 不要な型キャスト・Fragment が除去されている
- [ ] 全テスト通過、リント通過、ビルド通過

## Sources

- コードレビュー結果: 5エージェント並列レビュー（TypeScript, Security, Performance, Architecture, Simplicity）
- 対象コミット: `afc1318` 〜 `9d38661`（直近10コミット）

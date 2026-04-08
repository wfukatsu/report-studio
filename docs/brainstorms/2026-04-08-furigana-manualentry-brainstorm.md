---
date: 2026-04-08
topic: furigana-manualentry
---

# フリガナ入力欄 — ManualEntry 拡張

## What We're Building

`ManualEntryField` にフリガナ対応フィールドを追加し、氏名欄を1要素で表現できるようにする。

**解決する問題:**
- 現在は フリガナ行 + 氏名行 = 2つの ManualEntry 要素が必要
- 両者に構造上の紐付けがなく、データバインドが別々
- テンプレートの要素数が増加し、移動・調整が煩雑

## Why This Approach

**ManualEntry 拡張を選択した理由:**
- 新規要素型（NameInputElement 等）を作るより変更量が少ない
- パレットアイテム・ElementRenderer・layerUtils への追加が不要
- `furiganaEnabled: false` がデフォルトなので既存動作に影響なし

**新規要素型（不採用）の理由:**
- CheckboxElement と同等の工数がかかる割に、ManualEntry の薄いラッパーになる
- YAGNI: フリガナ専用の追加機能は今のところ必要ない

## Key Decisions

### 追加フィールド

```typescript
// src/types/index.ts — ManualEntryField に追加
furiganaEnabled?: boolean   // デフォルト: false
furiganaDataSource?: string // フリガナのデータプレビュー値（resolveField で解決）
furiganaRatio?: number      // フリガナ行の高さ割合 (0〜1、デフォルト: 0.35)
```

> **Note**: `ManualEntryField` にはメイン入力の `dataSource` が現状存在しない。
> 今回追加する `furiganaDataSource` は「フリガナゾーンのプレビュー値」に限定したスコープ。
> メイン入力へのデータバインドは別タスクで検討する。

### Renderer の分岐

`furiganaEnabled === true` のとき、要素を縦 2 分割してレンダリング:

```
┌─────────────────────────────────┐
│ フリガナ                         │  ← furiganaRatio (35%)
│ ___________________________      │
├─────────────────────────────────┤
│ 氏名                             │  ← 残り (65%)
│ ___________________________      │
└─────────────────────────────────┘
```

- 上ゾーン: 「フリガナ」ラベル + `displayMode` に応じた入力行（`furiganaDataSource` でバインド）
- 下ゾーン: 既存の `label` + 入力行（`dataSource` でバインド）
- `furiganaEnabled === false` のときは現行と同一の動作

### テンプレート書き換え例

```typescript
// Before: 2要素
input(x, y,        w, h * 0.35, { label: 'フリガナ', fontSize: 2.8 }),
input(x, y + h * 0.35, w, h * 0.65, { label: '氏名',   fontSize: 3.5 }),

// After: 1要素
input(x, y, w, h, {
  label: '氏名',
  fontSize: 3.5,
  furiganaEnabled: true,
  furiganaRatio: 0.35,
  furiganaDataSource: 'employee.furigana',
})
```

### スコープ

**変更対象:**
- `src/types/index.ts` — `ManualEntryField` に 3 フィールド追加
- `src/elements/manualEntry/Renderer.tsx` — furiganaEnabled 分岐レンダリング
- `src/elements/manualEntry/PropertiesPanel.tsx` — furiganaEnabled / furiganaRatio / furiganaDataSource 入力 UI
- `src/elements/manualEntry/Renderer.test.tsx` — 縦分割レンダリングのテスト追加
- `src/elements/manualEntry/PropertiesPanel.test.tsx` — 新フィールドのテスト追加
- `src/templates/fuyouKojoTemplate.ts` — 氏名欄を1要素に統合（デモ）

**変更しない:**
- 型 union `ReportElement` — ManualEntry は既存
- `ElementRenderer.tsx` — case 追加不要
- `layerUtils.ts` — 追加不要
- `ElementPalette.tsx` — 追加不要

## Resolved Questions

- **アプローチ**: ManualEntry 拡張（新規型は不採用）✅
- **解決する問題**: 要素数削減 + データバインド紐付けの両方 ✅
- **高さ割合**: `furiganaRatio?: number`（デフォルト 0.35）で設定可能 ✅

## Open Questions

なし — 方針確定。

## Next Steps

→ `/workflows:plan` で実装計画を作成する。
参照パターン: `src/elements/manualEntry/Renderer.tsx`、`src/types/index.ts`

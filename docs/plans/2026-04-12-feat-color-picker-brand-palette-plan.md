---
title: "feat: カラーピッカー刷新 — ブランドカラーパレット＋最近使った色"
type: feat
status: active
date: 2026-04-12
origin: docs/brainstorms/2026-04-12-color-picker-improvement-brainstorm.md
---

# feat: カラーピッカー刷新 — ブランドカラーパレット＋最近使った色

## Overview

現在の `ColorInput`（`<input type="color">` ＋ HEX テキスト入力）をポップオーバー型 UI に刷新する。
会社・ブランドカラーを localStorage に登録・永続化し、どのレポートでもワンクリックで選択できるようにする。
最近使った色の自動追跡も追加し、登録なしでも繰り返し作業を削減する。

（see brainstorm: docs/brainstorms/2026-04-12-color-picker-improvement-brainstorm.md）

---

## Problem Statement

- **現状**: `<input type="color">` はブラウザネイティブ UI で使いにくく、HEX を毎回手入力している
- **困り事**: 会社・ブランドカラーを複数要素に毎回手入力する手間がかかる
- **影響**: `ColorInput` は 22 箇所以上で使われており、全ユーザーに影響する頻度の高い操作

---

## Proposed Solution

### ポップオーバー UI

```
文字色  [■ #E74C3C ▼]
         ┌─────────────────────────┐
         │ ブランドカラー   [管理] │
         │ ■ ■ ■ ■ ■ ■            │  ← 最大12件、名前付き（ホバーでツールチップ）
         │─────────────────────────│
         │ 最近使った色            │
         │ ■ ■ ■ ■ ■ ■            │  ← 最大8件、自動追跡
         │─────────────────────────│
         │ カスタム: [#______] ✓  │  ← 既存HEX入力を継承
         └─────────────────────────┘
```

### 管理モーダル（「[管理]」クリックで開く）

```
┌────────────────────────────────────┐
│  ブランドカラー管理                │
│  ■ メインレッド  #E74C3C  [編集][–] │
│  ■ ネイビー     #2C3E50  [編集][–] │
│  ■ アクセント   #F39C12  [編集][–] │
│  [ + 色を追加 ]                    │
│                       [ 閉じる ]   │
└────────────────────────────────────┘
```

---

## Technical Considerations

### 既存パターンの活用

| 用途 | 再利用するもの | ファイル |
|------|--------------|---------|
| localStorage 永続化 | `useSyncExternalStore` パターン | `src/hooks/useBuiltinPrefs.ts` |
| ポップオーバー外クリック検知 | `useDropdownDismiss` | `src/hooks/useDropdownDismiss.ts` |
| モーダル実装 | `ConfirmDialog` のパターン | `src/components/common/ConfirmDialog.tsx` |
| ツールチップ | `Tooltip` コンポーネント | `src/components/common/Tooltip.tsx` |
| ポップオーバー表示 | `position: absolute` + `bg-popover` | Toolbar.tsx, ZoomControl.tsx 等 |

### @radix-ui/react-popover は**未インストール**

Radix Popover は入れない。既存の `position: absolute` + `useDropdownDismiss` パターンで実装する（see brainstorm: localStorage 保存はユーザー環境スコープで単一パレットのみ）。

### 後方互換性

`ColorInput` の props シグネチャ（`value`, `onChange`, `label`, `inherited`, `onReset`）は変更しない。
22 箇所の呼び出し元を修正不要にする。

### 仕様の決定事項（SpecFlow 分析から）

| 問題 | 決定 |
|------|------|
| 「確定」の定義 | ブランドカラークリック＋カスタム HEX の ✓/Enter が確定。最近の色クリックは先頭移動のみ |
| ポップオーバー外クリック | カスタム HEX 未確定の場合はキャンセル（入力破棄）してポップオーバーを閉じる |
| 8件満杯の削除 | リスト末尾（最古追加）を削除 |
| 重複排除 | 既存 HEX を先頭に移動（MRU 順） |
| HEX 形式 | `#RRGGBB` のみ。`#RGB` は自動展開。不正値は確定不可 |
| 空状態 | 最近使った色が 0 件のとき当該セクションを非表示 |
| 管理モーダルの保存 | 各操作で即時 localStorage に保存（キャンセルなし） |
| デフォルト色 | 初回起動時の localStorage が空なら 6 色を初期値として設定 |
| 複数ポップオーバー | 1 つが開いたら他のポップオーバーは閉じる（排他制御） |
| 名前が空の場合 | HEX 値をフォールバック表示 |

---

## localStorage スキーマ

```ts
// src/hooks/useColorPrefs.ts

// key: "rds2:brandColors"
export type BrandColor = { hex: string; name: string }
export type BrandColorsStore = BrandColor[]  // 最大 12 件

// key: "rds2:recentColors"
export type RecentColorsStore = string[]  // #RRGGBB, 最大 8 件, MRU 順

// デフォルト値（localStorage が空 or 破損時）
export const DEFAULT_BRAND_COLORS: BrandColor[] = [
  { hex: '#000000', name: 'ブラック' },
  { hex: '#FFFFFF', name: 'ホワイト' },
  { hex: '#1E40AF', name: 'ブルー' },
  { hex: '#DC2626', name: 'レッド' },
  { hex: '#16A34A', name: 'グリーン' },
  { hex: '#D97706', name: 'アンバー' },
]
```

---

## Implementation Phases

### Phase 1: ストレージ層

**ファイル**: `src/hooks/useColorPrefs.ts` (新規)

```ts
// useBuiltinPrefs.ts と同じ useSyncExternalStore パターン
export function useBrandColors(): [BrandColor[], {
  add: (color: BrandColor) => void
  remove: (hex: string) => void
  update: (hex: string, patch: Partial<BrandColor>) => void
}]

export function useRecentColors(): [string[], {
  push: (hex: string) => void   // MRU 追加・先頭移動・8件上限
}]
```

- localStorage read/write に try-catch（`QuotaExceededError` 含む）
- `window.dispatchEvent(new Event('color-prefs-change'))` でタブ間同期
- `useSyncExternalStore` の subscribe に `color-prefs-change` イベント

テスト: `src/hooks/useColorPrefs.test.ts` (新規)

---

### Phase 2: ポップオーバーコンポーネント

**ファイル**: `src/elements/_base/ColorPickerPopover.tsx` (新規)

```tsx
interface ColorPickerPopoverProps {
  value: string
  onChange: (hex: string) => void
  anchorRef: React.RefObject<HTMLElement>  // トリガーボタンの ref
  onClose: () => void
}
```

- `useDropdownDismiss` で外部クリック / Escape 検知
- `position: absolute` + `z-50 bg-popover border rounded-md shadow-lg`
- セクション構成: ブランドカラー → 最近使った色（0 件なら非表示） → カスタム HEX 入力
- ブランドカラーのスウォッチに `Tooltip` でカラー名を表示
- カスタム HEX: 入力 + ✓ボタン / Enter で確定。`#RGB` 自動展開。不正値はボタン無効化

テスト: `src/elements/_base/ColorPickerPopover.test.tsx` (新規)

---

### Phase 3: ブランドカラー管理モーダル

**ファイル**: `src/elements/_base/BrandColorManagerModal.tsx` (新規)

```tsx
interface BrandColorManagerModalProps {
  onClose: () => void
}
```

- `ConfirmDialog` と同じモーダルパターン（`fixed inset-0`, フォーカストラップ, Escape で閉じる）
- 各エントリ: カラースウォッチ + 名前テキスト + 削除ボタン
- 追加フォーム: HEX テキスト入力 + 名前入力 + 追加ボタン（同じく HEX バリデーション）
- 即時 localStorage 保存（操作ごとに `useBrandColors` のアクションを呼ぶ）
- 名前の最大文字数: 20 文字

テスト: `src/elements/_base/BrandColorManagerModal.test.tsx` (新規)

---

### Phase 4: ColorInput の刷新

**ファイル**: `src/elements/_base/sharedUI.tsx` の `ColorInput` を更新

- トリガーボタン: `[■ #E74C3C ▼]` ── カラースウォッチ + HEX 短縮表示 + 開閉矢印
- クリックでポップオーバーを開閉
- 排他制御: `ColorPickerPopover` を開くときグローバルに他を閉じる（`useId` + Context or カスタムイベント）
- `inherited` / `onReset` の既存挙動はそのまま維持

既存テスト更新: `src/elements/_base/sharedUI.test.tsx`

---

## Acceptance Criteria

### 機能要件

- [ ] プロパティパネルの色フィールドをクリックするとポップオーバーが開く
- [ ] ブランドカラーのスウォッチをクリックすると即座に色が適用され、最近使った色に追加される
- [ ] ブランドカラーのスウォッチにホバーすると名前のツールチップが表示される
- [ ] 最近使った色が 0 件のときはセクション自体が非表示になる
- [ ] カスタム HEX 入力で ✓ ボタンを押すか Enter を押すと色が適用される
- [ ] `#RGB` を入力すると `#RRGGBB` に自動展開される
- [ ] 不正な HEX 値のとき ✓ ボタンが無効化される
- [ ] [管理] ボタンをクリックすると管理モーダルが開く
- [ ] 管理モーダルでブランドカラーを追加・削除できる
- [ ] 管理モーダルでカラー名を編集できる（最大 20 文字）
- [ ] 変更は即時 localStorage に反映される
- [ ] ブラウザをリロードしてもブランドカラーが保持される
- [ ] 別タブで変更すると `storage` イベント経由で反映される
- [ ] 最近使った色は最大 8 件、MRU 順（同色は先頭移動）
- [ ] ブランドカラーは最大 12 件（超過時は追加不可）
- [ ] localStorage が空の初回起動時はデフォルト 6 色が表示される
- [ ] localStorage が壊れている場合はデフォルト値にフォールバックする
- [ ] 複数の色フィールドで 1 つのポップオーバーのみが開く（排他制御）
- [ ] ポップオーバー外クリックまたは Escape で閉じる（未確定の HEX は破棄）
- [ ] 既存の `label` / `inherited` / `onReset` props が従来通り動作する

### 非機能要件

- [ ] 22 箇所の `ColorInput` 呼び出し元を修正せずに動作する（後方互換）
- [ ] `npm run test:coverage` が 80% 閾値を維持する
- [ ] `npm run lint` がエラーなし
- [ ] ポップオーバーが画面下端に近い場合でも見切れない（`position: absolute` の配置調整）

---

## System-Wide Impact

- **影響範囲**: `ColorInput` を使う 22 ファイル全て（props 変更なしのため実質影響なし）
- **localStorage**: `rds2:brandColors` / `rds2:recentColors` の 2 キーを追加。既存 `rds-autosave` / `rds2:builtin-template-prefs` とは独立
- **新規ファイル**: 4 ファイル（`useColorPrefs.ts` / `ColorPickerPopover.tsx` / `BrandColorManagerModal.tsx` / テスト 3 ファイル）
- **修正ファイル**: `sharedUI.tsx` のみ

---

## Dependencies & Risks

| リスク | 内容 | 対策 |
|--------|------|------|
| localStorage 不可環境 | Safari プライベートモードで `setItem` が例外 | try-catch でサイレント無視、インメモリで動作継続 |
| 排他制御の実装 | 複数 ColorInput が同時に開く可能性 | カスタムイベント or React Context でグローバルな open 状態を管理 |
| ポップオーバー位置 | プロパティパネルが画面端でポップオーバーが見切れる | `getBoundingClientRect` で位置計算し上方向にフリップ |

---

## Sources & References

### Origin

- **Brainstorm:** [docs/brainstorms/2026-04-12-color-picker-improvement-brainstorm.md](../brainstorms/2026-04-12-color-picker-improvement-brainstorm.md)
  - 採用決定: ポップオーバー型 + localStorage（ユーザースコープ）+ ブランドカラー名あり + 管理モーダルは別ウィンドウ + 確定時のみ最近の色に追加

### Internal References

- `src/elements/_base/sharedUI.tsx` — 現行 `ColorInput` 実装
- `src/hooks/useBuiltinPrefs.ts` — `useSyncExternalStore` + localStorage パターン
- `src/hooks/useDropdownDismiss.ts` — ポップオーバー外クリック検知
- `src/components/common/ConfirmDialog.tsx` — モーダルパターン（フォーカストラップ, Escape 対応）
- `src/components/common/Tooltip.tsx` — ツールチップ実装
- `src/elements/_base/sharedUI.test.tsx` — 既存 ColorInput テスト/

---
date: 2026-04-08
topic: era-select-layout
---

# 元号選択レイアウトパターン対応

## What We're Building

EraSelectElement のレンダラーに複数のレイアウトパターンを追加し、
プロパティパネルから選択できるようにする。
また表示する元号を選択可能にし、4元号（大・昭・平・令）や
3元号（昭・平・令）にも対応する。

**レイアウトパターン:**
- `column`（現在の動作）: 縦1列に並べる（1×N）
- `row`: 横1行に並べる（N×1）
- `grid-2col`: 2列グリッドに並べる（2×⌈N/2⌉）

**表示元号の選択:**
- デフォルト: 5元号（明・大・昭・平・令）
- プロパティパネルで個別にオン/オフ切り替え
- 最低1つは必須

## Why This Approach

**レイアウト選択が必要な理由:**
国税庁帳票では元号が縦1列で並ぶのが標準だが、
民間の帳票やフォームでは横並び（明・大・昭・平・令）や
2列配置（明大/昭平/令）も多い。
見積書ヘッダーの生年月日欄など、横幅が限られる場所では
横並びや2列が適している。

**表示元号が選択可能な理由:**
- 平成以降の生年月日欄では「明」「大」が不要
- 4元号なら 4×1、2×2、1×4 が全て綺麗に収まる
- 3元号（昭・平・令）や2元号（平・令）のケースもある

## Key Decisions

- **レイアウトは3パターン**: `column`（縦並び）、`row`（横並び）、`grid-2col`（2列グリッド）
- **型に `layout` プロパティ追加**: `EraSelectElement.layout?: 'column' | 'row' | 'grid-2col'`（デフォルト: `column`）
- **型に `eras` プロパティ追加**: `EraSelectElement.eras?: string[]`（デフォルト: `['明','大','昭','平','令']`）
- **プロパティパネル**: レイアウト選択（3アイコンまたはセレクト）+ 元号チェックボックス
- **フォントサイズ計算**: レイアウトに応じて行数/列数から自動計算
- **後方互換**: 既存テンプレートは `layout` / `eras` 未設定 → デフォルト動作（現行と同一）

## Resolved Questions

- 元号数と余り → 表示元号を選択可能にして対応 ✅
- レイアウト数 → 3パターン（column/row/grid-2col） ✅

## Open Questions

なし。

## Scope

**変更ファイル:**
- `src/types/index.ts` — `EraSelectElement` に `layout` / `eras` 追加
- `src/elements/eraSelect/Renderer.tsx` — レイアウト分岐
- `src/elements/eraSelect/Renderer.test.tsx` — テスト追加
- `src/elements/eraSelect/PropertiesPanel.tsx` — レイアウト選択 + 元号チェックボックス
- `src/lib/elementFactories.ts` — デフォルト値

## Next Steps

→ `/workflows:plan` で実装計画を作成する。

---
date: 2026-04-08
topic: all-remaining-issues
---

# 全残件統合整理 — テンプレート修正 + 横断改善 + UI改善

## What We're Building

2つのテンプレート（扶養控除等申告書 / 見積書）のPDF忠実度残件、
見積書テンプレートの派生版（値引版・英語版）、
計算式ルール、repeatingBand 空行レンダリング、UI改善を
フェーズ分けして一括対応する。

**対象:** 6件のテンプレート修正 + 2件の新規テンプレート + 4件の横断改善 + 3件のUI改善 = 計15件
（修正済み/対応不要の7件を除外）

## Why This Approach

### フェーズ分けの根拠

**フェーズ1: テンプレート微調整（定数変更のみ）**
ファイル変更が `fuyouKojoTemplate.ts` と `quotationTemplate.ts` の2ファイルに閉じる。
新規型定義やレンダラー変更なし。リスク最小。

**フェーズ2: 新規テンプレート作成（値引版・英語版）**
既存の `quotationTemplate.ts` をベースにした派生テンプレート。
`builtinTemplates.ts` への登録のみで統合完了。
OutputVariant（要素の表示/非表示のみ）では列追加・レイアウト変更ができないため、
別テンプレートとして作成する。

**フェーズ3: 横断的改善**
レンダラー変更（repeatingBand）、バックエンド連携（CalculationRule）、
UIコンポーネント変更を含む。影響範囲が広くテストが必要。

### フェーズ1 詳細（6件）

#### 扶養控除等申告書（5件 — 計画書あり）

| # | 内容 | 方針 |
|---|------|------|
| DIFF-04 | 右端縦書き説明文 | `vlbl()` 1本追加（y=37〜237, x=196, fontSize=1.6） |
| DIFF-08 | Section C「区分」ラベル | `lbl('区分', ...)` 1行追加 |
| DIFF-09 | Section A「生計を一にする事実」注記 | `buildPersonRow` 外で `lbl()` 追加 |
| DIFF-10 | 列幅微調整 | name.w: 24→22, address.w: 28→30（合計207mm維持） |
| DIFF-11 | 注1高さ拡張 + （注2）テキスト | ROW_H.note1: 14→20, Y座標カスケード+6mm |

→ 既存計画書: `docs/plans/2026-04-08-fix-fuyou-kojo-template-remaining-diffs-plan.md`

#### 見積書（1件）

| # | 内容 | 方針 |
|---|------|------|
| DIFF-Q08 | 印鑑位置 | 社名行右端に移動（Y_SENDER_LOGO+12付近） |

※ DIFF-Q03（修正済み）、Q04（対応不要）、列幅バグ（修正済み）は除外。
※ DIFF-Q09（repeatingBand空表示）はフェーズ3のレンダラー改善で対応。

### フェーズ2 詳細（2件）

#### 値引対応版テンプレート `QUOTATION_DISCOUNT_TEMPLATE`

基本版との差分:
- 品目テーブルに「値引」列を追加（5列: 品番・品名 / 数量 / 単価 / 値引 / 金額）
- 集計に「値引合計」行を追加（赤テキスト）
- 小計は値引後の金額

実装方針: `quotationTemplate.ts` の基本構造をコピーし、
列幅定数と集計行を変更した `quotationDiscountTemplate.ts` を作成。
共通ヘルパー（`lbl`, `df`, `rect` 等）は各ファイルに個別定義（YAGNI: 共通化は後）。

#### 英語版テンプレート `QUOTATION_ENGLISH_TEMPLATE`

基本版と完全に異なるレイアウト:
- ヘッダー: 左に社名、右に "Quotation" タイトル
- 列: QUANTITY / DESCRIPTION / UNIT PRICE / AMOUNT
- 集計: SUB TOTAL / TAX (10%) / TAX (8%) / TOTAL
- Notes + Terms & Conditions セクション
- 赤テキストで "Quotation valid until" / "Prepared by"

実装方針: 新規 `quotationEnglishTemplate.ts` を作成。
日本語版とコード共有しない（レイアウトが根本的に異なるため）。

### フェーズ3 詳細（7件: 横断改善4件 + UI改善3件）

#### 改善-01: 見積書テンプレートに CalculationRule を紐付け

既存基盤:
- `CalculationRule` 型（JEXL式, `definition.calculationRules[]`）
- バックエンド `CalculationEngine`（トポロジカルソート, 依存解決）
- `CalculationEngine.apply(projection, formData)` で計算結果を返す

必要な計算式:
```
subtotal = SUM(items[].amount)
tax10Amount = FLOOR(subtotal * 0.10)
tax8Amount = FLOOR(tax8Base * 0.08)
total = subtotal + tax10Amount + tax8Amount
```

方針: テンプレートの `calculationRules` 配列にルールを定義し、
バックエンドの `/api/v2/evaluate` エンドポイント経由で計算結果を取得。
フロントエンドのプレビューではルール未実行（バックエンド依存）。

#### 改善-03: repeatingBand 空行罫線レンダリング

現状: 空データ時「データなし」テキスト1行のみ表示。
PDF見積書では空行にも罫線が必要。

方針A（テンプレート側ワークアラウンド — 実装済み）:
`hline()` を固定要素として追加。

方針B（レンダラー拡張）:
`showEmptyRowLines: boolean` プロパティを `RepeatingBandElement` に追加。
`true` のとき、`maxItems` まで空行罫線を描画。

→ 方針B を採用。テンプレート側の固定罫線は方針B 実装後に削除。

#### UI-01: キャンバスの「全体に合わせる」ズーム

現状: A4横幅210mmがウィンドウに収まらない場合がある。
方針: ズーム選択リストに「幅に合わせる」オプションを追加。
`canvasWidth / pageWidth` でズーム倍率を計算。

#### UI-02: EraSelect の最小フォントサイズ

現状: `size.height / 5 * 0.75` で計算、5mm要素では0.75mmで不可視。
方針: `Math.max(fontSize, 2.0)` で下限を設定。

#### UI-03: ロック要素のクリックスルー

現状: locked要素がクリック対象になり、入力要素を選択しにくい。
方針: Ctrl+クリックでロック要素を透過し、下の要素を選択。

## Key Decisions

- **値引版・英語版は別テンプレートで作成**: OutputVariant は列追加不可のため
- **共通ヘルパーの抽出は行わない**: YAGNI。テンプレート3つ程度なら個別定義で十分
- **CalculationRule はバックエンド依存**: フロントプレビューでは計算未実行（既存設計に従う）
- **repeatingBand 空行は方針B（レンダラー拡張）**: 汎用的で他テンプレートにも活用可能
- **フェーズ1 は既存計画書に従う**: 扶養控除等の計画書はそのまま使用

## Resolved Questions

- 値引版・英語版の実装方式 → 別テンプレート ✅
- 横断改善のスコープ → 全て含める ✅
- DIFF-Q04（条件テーブル横幅） → 対応不要（目視確認で問題なし） ✅
- DIFF-Q03（登録番号ラベル） → フォント修正で解決済み ✅

## Open Questions

なし。方針確定。

## Scope

### 変更ファイル（フェーズ1）
- `src/templates/fuyouKojoTemplate.ts` — DIFF-04/08/09/10/11
- `src/templates/quotationTemplate.ts` — DIFF-Q08

### 新規ファイル（フェーズ2）
- `src/templates/quotationDiscountTemplate.ts` — 値引対応版
- `src/templates/quotationEnglishTemplate.ts` — 英語版
- `src/templates/builtinTemplates.ts` — 2テンプレート追加

### 変更ファイル（フェーズ3）
- `src/types/index.ts` — RepeatingBandElement に `showEmptyRowLines` 追加
- `src/elements/repeatingBand/Renderer.tsx` — 空行罫線レンダリング
- `src/elements/eraSelect/Renderer.tsx` — 最小フォントサイズ
- `src/components/canvas/CanvasElement.tsx` または `ReportCanvas.tsx` — Ctrl+クリック透過
- ズーム関連コンポーネント — 「幅に合わせる」オプション
- `src/templates/quotationTemplate.ts` — CalculationRule 定義 + 固定罫線削除

## Next Steps

→ `/workflows:plan` で各フェーズの実装計画を作成する。

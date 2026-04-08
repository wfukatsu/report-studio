---
title: "fix: テンプレート残件 + 横断改善 + UI改善の統合実装"
type: fix
status: active
date: 2026-04-08
origin: docs/brainstorms/2026-04-08-all-remaining-issues-brainstorm.md
---

# fix: テンプレート残件 + 横断改善 + UI改善の統合実装

## Overview

扶養控除等申告書・見積書テンプレートのPDF忠実度残件（6件）、
見積書派生テンプレート新規作成（2件）、横断的機能改善（3件）、UI改善（2件）を
3フェーズで実装する統合計画。合計13件。

(see brainstorm: docs/brainstorms/2026-04-08-all-remaining-issues-brainstorm.md)

## Problem Statement / Motivation

PDF実物比較で特定された残件が複数テンプレートにわたって存在する。
また、見積書テンプレートの値引版・英語版の需要があり、
repeatingBand の空行表示やロック要素のクリックスルー等のUX課題もある。

**スコープ除外:**
- UI-01（幅フィットズーム）: `src/components/common/ZoomControl.tsx:126-138` に既に実装済み
- DIFF-Q03, Q04, 列幅バグ: 修正済み
- DIFF-Q09: フェーズ3の repeatingBand 改善で対応

## Proposed Solution

### フェーズ1: テンプレート微調整（6件）

変更ファイルが2つのテンプレートに限定される最小リスク作業。

### フェーズ2: 新規テンプレート作成（2件）

既存テンプレートをベースにした派生テンプレート。`builtinTemplates.ts` への登録で統合。

### フェーズ3: 横断的改善（5件）

型定義・レンダラー・UIコンポーネントの変更を含む影響範囲の広い作業。TDD必須。

## Technical Approach

### Phase 1: テンプレート微調整

#### Step 1-1: 扶養控除等申告書 DIFF-04/08/09/10/11

既存計画書 `docs/plans/2026-04-08-fix-fuyou-kojo-template-remaining-diffs-plan.md` に従う。

**実装順序（依存関係考慮）:**

1. **DIFF-11** — Y座標カスケード（他DIFFのY位置に影響）
   - `src/templates/fuyouKojoTemplate.ts`
   - `ROW_H.note1`: 14 → 20
   - Y定数: `juminHdr`/`jumin1`/`jumin2`/`taishoku`/`bottom` を各+6mm
   - （注2）テキスト追加: `lbl('（注2）同一生計配偶者とは…', ML+1, Y.note1+ROW_H.note1/2+1, …)`

2. **DIFF-10** — COL定数調整
   - `name.w`: 24→22, `kankei.x`〜`address.x` を各-2mm
   - `address.w`: 28→30
   - `ido.w` は変更しない（合計207mm維持）
   - `colBoundaries` はCOL定数から自動計算されるため手動変更不要

3. **DIFF-08** — Section C「区分」ラベル
   - `lbl('区分', COL.kubun.x, CY, COL.kubun.w, 5, { fontSize: 2.2, fontWeight: 'bold' })` 追加

4. **DIFF-09** — Section A「生計を一にする事実」注記
   - `buildPersonRow` 呼び出し後に注記lbl追加（Section A専用）
   - `lbl('（該当する場合は□を付けてください）', COL.seikei.x+1, Y.rowA+ROW_H.rowA-6, …)`

5. **DIFF-04** — 右端縦書き説明文
   - `vlbl(text, ML+TABLE_W-14, Y.title+34, 14, 200, 1.6)` 追加
   - DIFF-03のチェックエリア下端（y=37）から開始
   - テキストは国税庁公開様式PDFから転記

#### Step 1-2: 見積書 DIFF-Q08（印鑑位置微調整）

- `src/templates/quotationTemplate.ts`
- 現状: 印鑑が `Y_SENDER_LOGO` に配置（ロゴと同じ行）
- 修正: 印鑑を社名テキストの右端に重ねて配置
- 変更: `position.y` を社名行に合わせ、`position.x` を社名右端に

#### Step 1-3: ビルド・テスト確認

- [ ] `npm run build` — 新規TypeScriptエラーなし
- [ ] `npm test -- --run` — 全1377テスト通過
- [ ] dev サーバーで目視確認

---

### Phase 2: 新規テンプレート作成

#### Step 2-1: 値引対応版 `quotationDiscountTemplate.ts`

**新規ファイル:** `src/templates/quotationDiscountTemplate.ts`

基本版 (`quotationTemplate.ts`) をベースに以下を変更:

- **列幅:** 5列に拡張
  ```
  品番・品名: 88mm / 数量: 18mm / 単価: 28mm / 値引: 26mm / 金額: 32mm
  合計: 192mm
  ```
- **repeatingBand fields:** `discount` フィールドを追加（format: `currency_jpy`）
- **集計行:** 「値引合計」行を追加（赤テキスト: `color: '#cc0000'`）
  - 小計 → 値引合計 → 消費税(10%) → 消費税(8%) → 合計
- **データスキーマ追加フィールド:**
  ```json
  { "quotation": { "discountTotal": 14000 },
    "items": [{ "discount": 6000 }] }
  ```
- **ヘルパー関数:** `lbl`, `df`, `rect`, `hline`, `vline`, `input` を個別定義（YAGNI: 共通化しない）

#### Step 2-2: 英語版 `quotationEnglishTemplate.ts`

**新規ファイル:** `src/templates/quotationEnglishTemplate.ts`

PDF `quotation-english.pdf` に基づく完全新規レイアウト:

- **ヘッダー:** 左に社名/住所/電話/メール、右に "Quotation" タイトル（大文字、bold）
- **右上情報:** Date of Issue / Quotation # / Registration # (右寄せ)
- **Quotation To:** 左側、顧客名/住所
- **赤テキスト:** "Quotation valid until" / "Prepared by" (color: `#cc0000`)
- **列:** QUANTITY(20mm) / DESCRIPTION(100mm) / UNIT PRICE(36mm) / AMOUNT(36mm) = 192mm
- **集計:** SUB TOTAL / TAX(10%) / TAX(8%) / **TOTAL** (bold)
- **Notes / Terms & Conditions:** 2セクション、備考テキストエリア

#### Step 2-3: builtinTemplates.ts 登録

```typescript
import { QUOTATION_DISCOUNT_TEMPLATE } from './quotationDiscountTemplate'
import { QUOTATION_ENGLISH_TEMPLATE } from './quotationEnglishTemplate'

export const BUILTIN_TEMPLATES: Template[] = [
  FUYOU_KOJO_TEMPLATE,
  QUOTATION_TEMPLATE,
  QUOTATION_DISCOUNT_TEMPLATE,
  QUOTATION_ENGLISH_TEMPLATE,
  // ... existing templates
]
```

#### Step 2-4: ビルド・テスト・目視確認

- [ ] `npm run build` — TypeScriptエラーなし
- [ ] `npm test -- --run` — 全テスト通過
- [ ] dev サーバーで3種の見積書テンプレートを目視確認

---

### Phase 3: 横断的改善（TDD）

#### Step 3-1: repeatingBand 空行罫線レンダリング

**型定義変更:** `src/types/index.ts`
- `RepeatingBandElement` に `showEmptyRowLines?: boolean` を追加

**レンダラー変更:** `src/elements/repeatingBand/Renderer.tsx`
- `showEmptyRowLines` が `true` かつデータ行数 < `maxItems` のとき、
  残りの行スロットに水平罫線を描画
- デザインプレビュー（`RepeatingBandDesignPreview`）にも同様の処理

**テスト（TDD）:** `src/elements/repeatingBand/Renderer.test.tsx`
- showEmptyRowLines=true, maxItems=10, データ3件 → 10行分の罫線が存在
- showEmptyRowLines=false → 既存動作（「データなし」表示）
- showEmptyRowLines=true, データ0件 → 10行の空罫線

**テンプレート更新:** `src/templates/quotationTemplate.ts`
- `showEmptyRowLines: true` を repeatingBand 要素に追加
- 固定 `hline()` ループ（10本）を削除

**ファクトリ更新:** `src/lib/elementFactories.ts`
- `createRepeatingBandElement()` に `showEmptyRowLines: false` デフォルト追加

#### Step 3-2: EraSelect 最小フォントサイズ

**レンダラー変更:** `src/elements/eraSelect/Renderer.tsx:14`
```typescript
// Before:
const fontSize = `${(el.size.height / 5) * 0.75}mm`
// After:
const fontSize = `${Math.max((el.size.height / 5) * 0.75, 2.0)}mm`
```

**テスト（TDD）:** `src/elements/eraSelect/Renderer.test.tsx`
- 5mm高要素 → フォントサイズが2.0mm以上であること
- 20mm高要素 → 従来計算のフォントサイズ（3.0mm）

#### Step 3-3: ロック要素のCtrl+クリック透過

**変更ファイル:** `src/components/canvas/CanvasElement.tsx`

現状 (`CanvasElement.tsx:47`):
```typescript
disabled: element.locked || readonly,
```

修正方針:
- `onClick` ハンドラ内で `e.ctrlKey || e.metaKey` を検出
- ロック要素のクリックイベントを親コンポーネントに伝播させ、
  同位置の非ロック要素を検索して選択する
- `ReportCanvas` で `elementsFromPoint()` を使用して下層要素を特定

**テスト:**
- Ctrl+クリックでロック要素を通過し、下の非ロック要素が選択されること
- 通常クリックでは従来通りロック要素が選択されること

#### Step 3-4: CalculationRule のテンプレート組み込み

`CalculationRule` は `definition.calculationRules[]`（ストア管理）に格納される。
`Template` 型に `calculationRules` フィールドは存在しない。

**方針:** `Template` 型に `calculationRules?: CalculationRule[]` を追加し、
`loadReport()` でテンプレートロード時に `definition.calculationRules` へマージする。

**変更ファイル:**
1. `src/types/index.ts` — `Template` 型に `calculationRules?: CalculationRule[]` 追加
2. `src/store/layoutSlice.ts` — `loadReport()` 内でテンプレートの `calculationRules` を
   `definition.calculationRules` にコピー
3. `src/templates/quotationTemplate.ts` — テンプレートに以下のルールを定義:
   ```typescript
   calculationRules: [
     { id: uuidv4(), key: 'subtotal', label: '小計',
       expression: '...', resultType: 'number', onError: 'zero' },
     { id: uuidv4(), key: 'tax10Amount', label: '消費税(10%)',
       expression: '...', resultType: 'number', onError: 'zero' },
     { id: uuidv4(), key: 'total', label: '合計',
       expression: '...', resultType: 'number', onError: 'zero' },
   ]
   ```

> ⚠️ JEXL式の正確な構文はバックエンド `ExpressionEngine.java` のサンドボックス制約に依存。
> 実装時にバックエンドの JEXL 構文を確認し、`SUM(items[].amount)` 等の集約関数の使用可否を検証すること。

#### Step 3-5: 品質確認

- [ ] `npm test -- --run` で全テスト通過（新規テスト含む）
- [ ] `npm run build` でビルドエラーなし
- [ ] dev サーバーで全テンプレート目視確認
- [ ] repeatingBand 空行罫線の表示確認
- [ ] EraSelect 小サイズ要素のフォント確認
- [ ] Ctrl+クリックでロック要素透過の動作確認

---

## Implementation Checklist

### Phase 1: テンプレート微調整

- [ ] DIFF-11: `ROW_H.note1` 14→20, Y座標カスケード+6mm, （注2）テキスト追加
- [ ] DIFF-10: COL定数 name.w-2/address.w+2 + cascade
- [ ] DIFF-08: Section C `lbl('区分', ...)` 追加
- [ ] DIFF-09: Section A 注記テキスト追加
- [ ] DIFF-04: 右端縦書き説明文 `vlbl()` 追加
- [ ] DIFF-Q08: 見積書印鑑位置調整
- [ ] ビルド・テスト通過

### Phase 2: 新規テンプレート

- [ ] `quotationDiscountTemplate.ts` 作成（値引列+値引合計行）
- [ ] `quotationEnglishTemplate.ts` 作成（英語レイアウト）
- [ ] `builtinTemplates.ts` に2テンプレート追加
- [ ] ビルド・テスト・目視確認

### Phase 3: 横断改善

- [ ] `RepeatingBandElement` に `showEmptyRowLines` 追加（型定義）
- [ ] `RepeatingBandRenderer` で空行罫線描画実装
- [ ] repeatingBand テスト追加（3ケース以上）
- [ ] `elementFactories.ts` にデフォルト追加
- [ ] quotationTemplate の固定罫線削除 + `showEmptyRowLines: true`
- [ ] EraSelect 最小フォントサイズ（`Math.max(..., 2.0)`）
- [ ] EraSelect テスト追加
- [ ] Ctrl+クリック ロック要素透過
- [ ] Ctrl+クリック テスト追加
- [ ] `Template` 型に `calculationRules` フィールド追加
- [ ] `loadReport()` でテンプレートの calculationRules をストアにマージ
- [ ] quotationTemplate に CalculationRule 定義追加
- [ ] 全体ビルド・テスト通過

## Acceptance Criteria

- [ ] 扶養控除等申告書: DIFF-04/08/09/10/11 の5件が修正され、PDF目視比較で一致度向上
- [ ] 見積書（基本版）: 印鑑位置が社名行右端に配置
- [ ] 見積書（値引版）: テンプレートギャラリーから選択可能、5列テーブル+値引合計行
- [ ] 見積書（英語版）: テンプレートギャラリーから選択可能、英語ラベル+PDFレイアウト一致
- [ ] repeatingBand: `showEmptyRowLines=true` で空行罫線が描画される
- [ ] EraSelect: 5mm高要素でもフォントが2.0mm以上で表示される
- [ ] Ctrl+クリック: ロック要素を透過して下の要素が選択される
- [ ] 全テスト通過 + ビルドエラーなし
- [ ] テストカバレッジ80%以上維持

## Dependencies & Risks

| リスク | 対策 |
|--------|------|
| DIFF-11 Y座標カスケードの見落とし | 計算済み: Y.bottom=243mm, A4_H=297mm, 残51mm |
| DIFF-10 COL cascade | COL定数は全コードが参照→自動適用 |
| 値引版テンプレートの列幅合計ミス | `CONTENT_W=192mm` を検証式でチェック |
| repeatingBand 型変更がファクトリに波及 | `showEmptyRowLines` をオプショナルに（後方互換） |
| JEXL式のバックエンド構文不明 | 実装時にExpressionEngine.javaのサンドボックスを確認 |
| Ctrl+クリックがOSショートカットと競合 | macOS: ⌘+クリック、Win: Ctrl+クリックで分離 |

## File Structure

```
変更ファイル（Phase 1）:
  src/templates/fuyouKojoTemplate.ts       — DIFF-04/08/09/10/11
  src/templates/quotationTemplate.ts       — DIFF-Q08

新規ファイル（Phase 2）:
  src/templates/quotationDiscountTemplate.ts  — 値引対応版
  src/templates/quotationEnglishTemplate.ts   — 英語版

変更ファイル（Phase 2）:
  src/templates/builtinTemplates.ts        — import + 配列追加

変更ファイル（Phase 3）:
  src/types/index.ts                       — showEmptyRowLines
  src/elements/repeatingBand/Renderer.tsx  — 空行罫線レンダリング
  src/elements/repeatingBand/Renderer.test.tsx — テスト追加
  src/lib/elementFactories.ts              — デフォルト追加
  src/elements/eraSelect/Renderer.tsx      — Math.max(…, 2.0)
  src/elements/eraSelect/Renderer.test.tsx — テスト追加
  src/components/canvas/CanvasElement.tsx   — Ctrl+クリック
  src/store/layoutSlice.ts                 — loadReport() にcalculationRules マージ追加
  src/templates/quotationTemplate.ts       — showEmptyRowLines + 固定罫線削除 + calculationRules
```

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-04-08-all-remaining-issues-brainstorm.md](../brainstorms/2026-04-08-all-remaining-issues-brainstorm.md)
  — Key decisions: 値引版・英語版は別テンプレート、共通ヘルパー抽出しない、repeatingBand レンダラー拡張
- **扶養控除等 既存計画書:** [docs/plans/2026-04-08-fix-fuyou-kojo-template-remaining-diffs-plan.md](2026-04-08-fix-fuyou-kojo-template-remaining-diffs-plan.md)
- **課題レポート（扶養控除等）:** [docs/issues/fuyou-kojo-pdf-comparison-issues.md](../issues/fuyou-kojo-pdf-comparison-issues.md)
- **課題レポート（見積書）:** [docs/issues/quotation-template-pdf-comparison-issues.md](../issues/quotation-template-pdf-comparison-issues.md)
- **テンプレート:** `src/templates/fuyouKojoTemplate.ts` (732行), `src/templates/quotationTemplate.ts` (~520行)
- **ZoomControl（UI-01 既実装）:** `src/components/common/ZoomControl.tsx:126-138`
- **CanvasElement:** `src/components/canvas/CanvasElement.tsx:47` (locked 判定)
- **EraSelect:** `src/elements/eraSelect/Renderer.tsx:14` (fontSize 計算)
- **RepeatingBand:** `src/elements/repeatingBand/Renderer.tsx:135-138` (空データ表示)

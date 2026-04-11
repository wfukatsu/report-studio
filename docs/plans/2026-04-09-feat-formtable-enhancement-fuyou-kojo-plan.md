---
title: "feat: FormTable 拡張 + 扶養控除等申告書テンプレート再現度改善"
type: feat
status: completed
date: 2026-04-09
origin: docs/brainstorms/2026-04-09-formtable-enhancement-fuyou-kojo-brainstorm.md
---

# feat: FormTable 拡張 + 扶養控除等申告書テンプレート再現度改善

## Overview

FormTable 要素のセルタイプを拡張し（checkbox, eraSelect 追加）、扶養控除等申告書テンプレートを擬似テーブル方式から FormTable ベースに段階的に移行して再現度を 70-75% → 90%+ に引き上げる。

(see brainstorm: docs/brainstorms/2026-04-09-formtable-enhancement-fuyou-kojo-brainstorm.md)

## Problem Statement / Motivation

扶養控除等申告書テンプレートの再現度が低い主因:

1. **擬似テーブル方式の限界**: 300+ 個の Shape+Label+ManualEntry で罫線ずれ・保守性悪化
2. **FormTable セルタイプ不足**: checkbox/eraSelect がセル内に配置できない
3. **EraSelect の視認性**: 5mm 以下の要素でフォントが判読不能
4. **Section C のレイアウト不一致**: 公定様式と構造的に異なる

## Proposed Solution

7ステップの段階的移行（see brainstorm — 決定事項 #6）:

1. FormTable セルタイプ拡張（checkbox, eraSelect）
2. EraSelect Renderer 改修
3. ヘッダーブロック FormTable 化
4. メインテーブル（A/B/D 行）FormTable 化
5. Section C FormTable 化
6. 住民税セクション FormTable 化
7. 座標微調整 + 印刷マージン確認

## Technical Approach

### Implementation Phases

#### Phase 1: FormTable セルタイプ拡張

**目的**: FormTableCell に checkbox と eraSelect を追加し、税務帳票で必要なセル内要素を第一級でサポートする。

##### 1.1 型定義の拡張

**ファイル**: `src/types/index.ts`

```typescript
// 現在: 'label' | 'input' | 'dataField'
// 拡張後:
export type FormTableCellType = 'label' | 'input' | 'dataField' | 'checkbox' | 'eraSelect'
```

FormTableCell に追加プロパティ:
```typescript
export interface FormTableCell {
  // ... 既存プロパティ
  /** type='checkbox' で使用: チェック状態 */
  checked?: boolean
  /** type='checkbox' で使用: チェックマーク記号 */
  checkmark?: CheckmarkStyle
  /** type='eraSelect' で使用: 選択中の元号データソース */
  eraDataSource?: string
  /** type='eraSelect' で使用: レイアウト */
  eraLayout?: EraSelectLayout
}
```

- [ ] `FormTableCellType` に `'checkbox'` と `'eraSelect'` を追加
- [ ] `FormTableCell` に checkbox/eraSelect 用プロパティを追加
- [ ] セル内フリガナ用プロパティ `furiganaEnabled?: boolean`, `furiganaDataSource?: string` を追加

##### 1.2 フロントエンド Renderer 対応

**ファイル**: `src/elements/formTable/Renderer.tsx`

- [ ] セル描画ロジックに `checkbox` 分岐を追加（CheckboxElement の描画ロジックを流用）
- [ ] セル描画ロジックに `eraSelect` 分岐を追加（EraSelectElement の描画ロジックを流用）
- [ ] フリガナ対応セルの描画を追加

##### 1.3 CellPopover UI 対応

**ファイル**: `src/elements/formTable/CellPopover.tsx`

- [ ] セルタイプ選択ドロップダウンに `checkbox` と `eraSelect` を追加
- [ ] checkbox 選択時: checkmark スタイル選択 UI
- [ ] eraSelect 選択時: レイアウト選択 UI

##### 1.4 FormTablePdfRenderer 対応

**ファイル**: `server/src/main/java/com/report/server/pdf/FormTablePdfRenderer.java`

- [ ] `renderCellContent()` に checkbox セル描画を追加（チェックマーク描画）
- [ ] `renderCellContent()` に eraSelect セル描画を追加（元号テキスト描画）

##### 1.5 tableOperations 対応

**ファイル**: `src/elements/formTable/tableOperations.ts`

- [ ] 行複製時に checkbox の `checked` / `checkmark` がコピーされることを確認
- [ ] 行複製時に eraSelect の `eraDataSource` / `eraLayout` がコピーされることを確認
- [ ] 新規行追加時のデフォルトセルに checkbox/eraSelect 用の初期値が不要であることを確認（既存セルはそのまま `label` デフォルトで問題ない）

##### 1.6 テスト

- [ ] FormTableCell の checkbox/eraSelect タイプが正しく描画されることを検証
- [ ] tableOperations の行複製テストに checkbox/eraSelect セルケースを追加
- [ ] 既存テストが壊れていないことを確認: `npm test -- --run`

#### Phase 2: EraSelect Renderer 改修

**目的**: 小さい EraSelect 要素でも元号テキストが判読可能にする。

**ファイル**: `src/elements/eraSelect/Renderer.tsx`

- [ ] 最小フォントサイズ（2.0mm）を定数として定義
- [ ] フォントサイズ計算ロジックを修正: `Math.max(calculatedSize, MIN_FONT_SIZE)`
- [ ] 高さが足りない場合（5mm 以下）に `layout` を自動で `'row'` に切り替え
- [ ] テスト追加: 小さいサイズでの描画が正しいことを検証

#### Phase 3: ヘッダーブロック FormTable 化

**目的**: テンプレートのヘッダー 3行（所轄税務署長等/税務署長/市区町村長）を FormTable に置き換え。

**ファイル**: `src/templates/fuyouKojoTemplate.ts`

- [ ] ヘッダー 3行を 1つの FormTableElement で表現
  - 左列（55mm）: 3行 × 3列（縦ラベル + 説明 + 入力欄）
  - 右列: 氏名（フリガナ付き）、生年月日（eraSelect セル）、世帯主、個人番号（12桁 grid）等
- [ ] 既存の rect/line/lbl/input ヘルパー呼び出し（L262-323）を FormTable 定義に置き換え
- [ ] 要素数: 約 40 → 15 に削減

#### Phase 4: メインテーブル FormTable 化

**目的**: Section A（源泉控除対象配偶者）、Section B（控除対象扶養親族 4行）、Section D（他の所得者）を FormTable に置き換え。

**ファイル**: `src/templates/fuyouKojoTemplate.ts`

- [ ] `buildPersonRow()` 関数（L389-447）を廃止し、FormTable 行定義に置き換え
  - 列定義: 左帯 / 区分 / フリガナ+氏名 / 続柄 / 個人番号 / 生年月日(eraSelect) / 特定扶養(checkbox) / 所得見積額 / 非居住者(checkbox×4) / 住所 / 生計事実 / 異動事由
  - Section A: 1行（`rowspan` でラベル帯結合）
  - Section B: 4行（各行にチェックボックスセル）
  - Section D: 2行
- [ ] 左端の「主たる給与から控除を受ける」縦書きラベル帯を `rowspan` で表現
- [ ] 要素数: 約 150 → 30 に削減

#### Phase 5: Section C FormTable 化

**目的**: 障害者・寡婦・ひとり親・勤労学生マトリックスを FormTable に置き換え。

**ファイル**: `src/templates/fuyouKojoTemplate.ts`

- [ ] 3×3 マトリックス（一般/特別/同居特別 × 本人/配偶者/扶養親族）を FormTable の行・列で表現
  - ヘッダー行: 障害者区分名
  - ボディ 3行: 各ロール × checkbox セル
- [ ] 寡婦/ひとり親/勤労学生チェックを同じ FormTable の右列に配置（`colspan` で結合）
- [ ] 「障害者又は勤労学生の内容」テキストエリアを最右列に配置
- [ ] 要素数: 約 30 → 10 に削減

#### Phase 6: 住民税セクション FormTable 化

**目的**: 16歳未満扶養親族 2行 + 退職手当等 1行を FormTable に置き換え。

**ファイル**: `src/templates/fuyouKojoTemplate.ts`

- [ ] 住民税ヘッダー + 16歳未満扶養親族テーブル（列ラベル + 2行）を 1つの FormTable に
  - 生年月日列: `lbl('平', ...)` 固定プレフィックス → label セル + input セル
- [ ] 退職手当等テーブル（列ラベル + 1行）を 1つの FormTable に
  - 生年月日列: eraSelect セル + input セル
- [ ] 要素数: 約 40 → 15 に削減

#### Phase 7: 座標微調整 + 印刷マージン確認

- [ ] 公定様式 PDF と並べて列幅・行高さを精密調整（DIFF-10 対応）
- [ ] 右端縦書きテキストが印刷可能領域内に収まるか確認
- [ ] Playwright スクリプトで Before/After スクリーンショットを撮影して比較
- [ ] PDF エクスポートして印刷品質を確認

## Acceptance Criteria

### Functional Requirements

- [ ] FormTableCell に `checkbox` タイプが追加され、チェックボックスがセル内に描画される
- [ ] FormTableCell に `eraSelect` タイプが追加され、元号選択がセル内に描画される
- [ ] EraSelect が高さ 5mm 以下でも判読可能（最小フォントサイズ 2.0mm）
- [ ] 扶養控除等申告書テンプレートが FormTable ベースに移行完了
- [ ] テンプレート要素数が 300 → 100 以下に削減
- [ ] 罫線のずれが解消（FormTable の自動レイアウト）
- [ ] FormTablePdfRenderer が checkbox/eraSelect セルを正しく PDF 描画
- [ ] 既存の FormTable インタラクティブ編集（Excel 風 UI）が新セルタイプでも動作

### Non-Functional Requirements

- [ ] 既存テスト全件パス
- [ ] 見積書テンプレート等、他の FormTable が影響を受けない（後方互換）
- [ ] テンプレート JSON サイズが削減される（要素数減少に伴い）

### Quality Gates

- [ ] `npm test -- --run` 全パス
- [ ] `npm run lint` エラーなし
- [ ] `cd server && ./gradlew build` 成功
- [ ] Before/After スクリーンショット比較で再現度 90%+ を確認

## Dependencies & Risks

| リスク | 影響 | 対策 |
|-------|------|------|
| FormTable の既存機能への影響 | 見積書テンプレート等が壊れる | 後方互換テストを Phase 1 で実施 |
| Section C の構造が FormTable で表現しきれない | 再現度が上がらない | 困難な場合は Section C のみ擬似テーブル維持 |
| テンプレート移行工数が想定以上 | スケジュール超過 | Phase 3〜6 を独立コミットにし、途中でも価値がある状態を維持 |

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-09-formtable-enhancement-fuyou-kojo-brainstorm.md](../brainstorms/2026-04-09-formtable-enhancement-fuyou-kojo-brainstorm.md) — Key decisions: セルタイプ追加アプローチ、rowspan でラベル帯対応、段階的移行 7ステップ

### Internal References

- FormTable 型定義: `src/types/index.ts:505-580`
- FormTable Renderer: `src/elements/formTable/Renderer.tsx`
- CellPopover: `src/elements/formTable/CellPopover.tsx`
- FormTable PDF Renderer: `server/src/main/java/com/report/server/pdf/FormTablePdfRenderer.java`
- EraSelect Renderer: `src/elements/eraSelect/Renderer.tsx`
- 扶養控除テンプレート: `src/templates/fuyouKojoTemplate.ts`
- 既存課題レポート: `docs/issues/fuyou-kojo-template-issues.md`
- PDF 比較レポート: `docs/issues/fuyou-kojo-pdf-comparison-issues.md`

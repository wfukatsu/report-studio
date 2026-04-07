# 扶養控除等申告書テンプレート作成時の課題と改善提案

作成日: 2026-04-08  
対象帳票: 令和７年分 給与所得者の扶養控除等（異動）申告書  
参照ファイル: `src/templates/fuyouKojoTemplate.ts`

---

## 発見した課題

### P0（ブロッカー）

#### ISSUE-01: ネストした `elements` 二重参照
**現象**: `Template.Page.elements` と `Section.elements` が同じ配列を参照している。  
`sections: [{ id, sectionType: 'body', height: A4_H, elements }]` と `elements` トップレベルが同一オブジェクトになる。  
**影響**: 画面レンダリング時に要素が二重描画される可能性がある。  
**改善案**:  
- `Template` 型の `Page.elements` を廃止し `Page.sections` のみで管理する（または `Page.elements` を computed getter にする）。
- 暫定: テンプレート作成側で `elements: []` にし `sections[].elements` にのみ要素を格納する規約を明文化する。

---

### P1（高優先）

#### ISSUE-02: `ManualEntry` に `displayMode: 'none'` が存在しない（型定義と実装の不一致）
**現象**: `ManualEntryDisplayMode = 'line' | 'box' | 'grid' | 'none'` は型定義にあるが、`ElementRenderer` で `'none'` を処理していない場合、入力欄が非表示になる可能性がある。  
**改善案**: `'none'` の場合は背景色と枠なしで内部テキストのみ表示するよう `ElementRenderer` の `ManualEntry` 分岐を追加する。

#### ISSUE-03: `Shape('line')` の縦線は `size.height` ではなく `size.width` を使う必要がある
**現象**: `line(x, y, length, { vertical: true })` ヘルパーで縦線を作る際、`size: { width: 0.1, height: length }` とすべきだが、`shape: 'line'` の描画ロジックが水平方向のみを想定している可能性がある。  
**影響**: 縦の仕切り線がキャンバスで正しく描画されない。  
**改善案**: `ShapeElement` に `orientation: 'horizontal' | 'vertical'` プロパティを追加するか、`line` 要素の描画時に `height > width` の場合は縦線として扱うようにする。

#### ISSUE-04: テーブル型要素の不在（複雑な帳票に不可欠）
**現象**: 扶養控除等申告書のような帳票は、行・列が入れ子になった複雑なセル構造を持つ。現状は Shape(rectangle) + Label + ManualEntry を個別に積み上げて「擬似テーブル」を作るしかない。  
**影響**:  
- 要素数が大量になる（本テンプレートだけで 300+ 要素）
- 行高さ変更時に関連する全要素の Y 座標を手動で更新しなければならない
- 印刷時に枠線が途切れたりズレたりするリスクがある  
**改善案**: `FormTable` 要素型を追加する。列定義（ラベル・幅・入力タイプ）と行定義（固定ラベル or 入力行）を持ち、描画エンジンがセルを自動レイアウトする。

---

### P2（中優先）

#### ISSUE-05: チェックボックス要素の専用型がない
**現象**: チェックボックスを `ManualEntry { displayMode: 'box', gridCount: undefined }` で代替しているが、チェック済み状態を表現する方法がなく、印刷時に空の正方形が出るだけ。  
**改善案**: `CheckboxElement` 型を追加し、`checked: boolean`、`label: string`、`checkmark: '✓' | '×' | '●'` 等を持たせる。

#### ISSUE-06: 縦書きテキスト（`writingMode: 'vertical-rl'`）のサイズ計算が不正
**現象**: 縦書きラベル（例: 「主たる給与から控除を受ける」「区分等」等）を配置する際、`width` と `height` が横書きと逆の意味になる。しかし `ElementBase.size` の概念は横書き前提のため、縦書きテキストがキャンバス上で正しくフィットしない。  
**改善案**: `LabelElement` / `TextElement` の縦書き時に `size.width` と `size.height` を自動スワップするか、プロパティを `inlineSize` / `blockSize` に統一する。

#### ISSUE-07: フリガナ（ルビ）の記入欄を独立した入力フィールドとして扱えない
**現象**: 氏名欄の上部にフリガナ行を別の `ManualEntry` として配置しているが、氏名との紐付けが構造上存在しない。  
**改善案**: `ManualEntryField` に `furiganaEnabled: boolean` を追加し、1 要素でフリガナ行と本文行を持てるようにする。

#### ISSUE-08: 生年月日の元号選択 UI がない
**現象**: 「明・大・昭・平・令」の選択は Label + ManualEntry で代替しているが、ユーザーが手入力するしかない。  
**改善案**: `DateElement` に `era: 'western' | 'wareki'` と `eraSelector: boolean` を追加し、和暦元号をドロップダウンで選択できるようにする。

#### ISSUE-09: 個人番号（マイナンバー）の 12 桁グリッド入力欄が機能しない
**現象**: `ManualEntry { displayMode: 'grid', gridCount: 12 }` を使用しているが、実際にキャンバスで 12 個の区切りセルが正しく描画されるかは `ElementRenderer` の実装依存。個人番号は 12 桁固定なので、マスク表示も必要。  
**改善案**: `ManualEntry` の `displayMode: 'grid'` を確実に動作させるとともに、`masked: boolean` プロパティを追加して PDF 出力時に中央桁を `*` で置換できるようにする。

---

### P3（低優先 / UX 改善）

#### ISSUE-10: テンプレートからの帳票作成がゼロベースのキャンバス操作を前提としている
**現象**: テンプレートを選択しても、フィールドに実際のデータを入れるには手動でキャンバスを操作するか、データソースを JSON で設定する必要がある。  
**改善案**: 帳票テンプレートに `schema` を埋め込み、「テンプレート読み込み → フォーム入力 UI が自動生成」されるウィザードを追加する。

#### ISSUE-11: 300+ 要素のキャンバスでパフォーマンスが低下する
**現象**: 扶養控除等申告書テンプレートは 300 要素超になる見込み。React の差分レンダリングが発生するたびに全要素を再計算するため、ズームやドラッグ時に遅延が生じる可能性がある。  
**改善案**:  
- `locked: true` な要素を静的 SVG/Canvas レイヤーにキャッシュし、動的要素（入力欄）のみ React DOM でレンダリングする二層レンダリングアーキテクチャを導入する。
- または `react-window` / `react-virtual` による可視領域外要素の仮想化。

#### ISSUE-12: テンプレートの JSON サイズが大きすぎてローカルストレージに保存できない可能性
**現象**: 300+ 要素を含む帳票定義は数 MB になり得る。現状ローカルストレージ（5MB 制限）に保存しているため上限を超えるリスクがある。  
**改善案**: IndexedDB への移行、またはサーバー側 API への自動同期機構の追加。

---

## 改善優先度まとめ

| # | 課題 | 優先度 | 難易度 | 影響範囲 |
|---|------|--------|--------|---------|
| 01 | elements 二重参照 | P0 | 低 | テンプレート規約 |
| 02 | ManualEntry displayMode:'none' 未実装 | P1 | 低 | ElementRenderer |
| 03 | 縦線描画ロジック | P1 | 中 | ShapeElement |
| 04 | FormTable 要素型の不在 | P1 | 高 | 新要素型追加 |
| 05 | Checkbox 専用型の不在 | P2 | 中 | 新要素型追加 |
| 06 | 縦書きサイズ計算 | P2 | 中 | ElementBase |
| 07 | フリガナ入力欄 | P2 | 中 | ManualEntry 拡張 |
| 08 | 和暦元号選択 | P2 | 中 | DateElement 追加 |
| 09 | マイナンバーグリッド | P2 | 中 | ManualEntry 拡張 |
| 10 | 帳票作成ウィザード | P3 | 高 | 新機能 |
| 11 | 大量要素パフォーマンス | P3 | 高 | レンダリング層 |
| 12 | ストレージ容量 | P3 | 中 | データ保存層 |

---

## 次のアクション（推奨）

1. **ISSUE-01** を修正: テンプレートの `Page.elements: []` に統一する規約を `CLAUDE.md` に追記
2. **ISSUE-04** の `FormTable` 要素型の設計を開始（最も帳票品質に影響）
3. **ISSUE-05** の `CheckboxElement` を追加（公的帳票で必須）
4. **ISSUE-03** の縦線ロジックを `ElementRenderer` で検証・修正

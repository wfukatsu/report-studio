# FormTable 拡張 + 扶養控除等申告書テンプレート再現度改善 ブレインストーム

**日付**: 2026-04-09
**ステータス**: approved

## 何を作るか

扶養控除等申告書（令和7年分）テンプレートの再現度を 70-75% → 90%+ に引き上げるために、FormTable 要素を拡張し、テンプレートを段階的に移行する。この拡張は他の税務帳票（源泉徴収票、年末調整用紙等）にも汎用的に適用する。

### 目的
- **製品品質ベンチマーク**: 帳票デザインツールとしての品質を測る基準テンプレート
- **再現度 90%+**: 公定様式との構造的一致を目指す

### スコープ定義
**対象**: FormTable 要素の拡張 + 扶養控除等申告書テンプレートの書き換え
**前提**: FormTable 要素と FormTablePdfRenderer は既に実装済み（MVP Phase 1 で作成）

## なぜこのアプローチか

**アプローチ A: FormTable 拡張 + 段階的移行** を採用。

理由:
- 現在の擬似テーブル方式（300+ 個の Shape+Label+ManualEntry）は罫線ずれ・保守性・要素数の 3つの問題を抱えている
- FormTable に移行すれば要素数が 300→50 以下に削減され、罫線は自動計算される
- 他の税務帳票にも展開する予定があり、汎用的な拡張が必要
- 段階的に移行することでリスクを最小化

## キー決定事項

### 1. FormTable セルタイプの拡張
- **決定**: 現在の `label | input | dataField` に加えて、`checkbox` と `eraSelect` を追加
- **理由**: 税務帳票ではチェックボックスと和暦元号選択がセル内に頻出するため、セルタイプとして第一級でサポートする必要がある

### 2. セル内複合要素への対応方針
- **決定**: セルタイプを追加するアプローチ（セル内に独立した要素を埋め込むのではない）
- **理由**: セル内要素の埋め込みはレイアウト計算が複雑すぎる。セルタイプの追加は FormTableCell インターフェースの拡張のみで済む

### 3. 複数行をまたぐラベル帯の対応
- **決定**: 既存の `colspan`/`rowspan` で対応可能。テンプレート作成時に左端のラベルセルに大きな `rowspan` を設定する
- **理由**: 新しい概念（ラベル帯）を導入するより、既存の結合機能を活用する方がシンプル

### 4. Section C のマトリックス構造
- **決定**: FormTable の中に「ヘッダー行 + ボディ行」のパターンで表現する。3×3 マトリックスは 3列のヘッダー + 3行のボディで構成
- **理由**: ネストテーブルは複雑すぎる。既存の FormTable の行・列構造で十分表現可能

### 5. EraSelect Renderer の改修
- **決定**: 最小フォントサイズ（2.0mm）を設定し、高さが足りない場合は `layout: 'row'` に自動切り替え
- **理由**: 現在のフォントサイズ計算（`height / 5 * 0.75`）では 5mm 以下の要素で判読不能になる

### 6. テンプレート移行の段階
- **Step 1**: FormTable セルタイプ拡張（checkbox, eraSelect）
- **Step 2**: EraSelect Renderer 改修（最小フォントサイズ）
- **Step 3**: ヘッダーブロック（Row 1-3）を FormTable に置き換え
- **Step 4**: メインテーブル（Section A/B/D の人物行）を FormTable に置き換え
- **Step 5**: Section C（障害者等マトリックス + 寡婦/ひとり親/勤労学生エリア）を FormTable に置き換え（最も構造が複雑、難易度高）
- **Step 6**: 住民税セクション + 退職手当欄を FormTable に置き換え
- **Step 7**: 座標微調整 + 印刷マージン確認

## 不足機能一覧

### FormTable に追加が必要な機能

| # | 機能 | 説明 | 影響範囲 |
|---|------|------|---------|
| F-01 | `cellType: 'checkbox'` | セル内にチェックボックスを描画 | FormTableCell 型、Renderer、PDF Renderer、CellPopover、PropertiesPanel |
| F-02 | `cellType: 'eraSelect'` | セル内に元号選択を描画 | FormTableCell 型、Renderer、PDF Renderer、CellPopover、PropertiesPanel |
| F-03 | セル背景色の行ロール連動 | header 行のセルにデフォルト背景色を適用 | Renderer |
| F-04 | セル内フリガナ対応 | `furiganaEnabled` をセルレベルでサポート | FormTableCell 型、Renderer |
| F-05 | FormTablePdfRenderer 拡張 | checkbox/eraSelect セルの PDF 描画対応 | `server/.../pdf/FormTablePdfRenderer.java` |
| F-06 | CellPopover セルタイプ選択 UI | 新セルタイプ（checkbox, eraSelect）を選択可能に | `src/elements/formTable/CellPopover.tsx` |

### 既存要素の改修が必要な機能

| # | 機能 | 説明 | 影響範囲 |
|---|------|------|---------|
| R-01 | EraSelect 最小フォントサイズ | 高さ 5mm 以下でも判読可能に | EraSelect Renderer |
| R-02 | EraSelect 自動レイアウト切替 | 狭い場合に `column` → `row` に自動切替 | EraSelect Renderer |

### テンプレート再構築に必要な作業

| # | 作業 | 説明 | 要素数削減 |
|---|------|------|----------|
| T-01 | ヘッダーブロック FormTable 化 | Row 1-3（55mm左列 + 右側入力群）を FormTable に | 約 40→15 要素 |
| T-02 | メインテーブル FormTable 化 | A/B/D 行の buildPersonRow を FormTable に | 約 150→30 要素 |
| T-03 | Section C FormTable 化 | 障害者等マトリックスを FormTable に | 約 30→10 要素 |
| T-04 | 住民税セクション FormTable 化 | 16歳未満扶養親族 + 退職欄を FormTable に | 約 40→15 要素 |
| T-05 | 座標・サイズ精密調整 | 公定様式 PDF と突き合わせて列幅・行高さを精密化 | — |
| T-06 | 印刷マージン確認 | 右端縦書きテキストが印刷範囲内に収まるか確認 | — |

## オープンクエスチョン

_なし — 全て解決済み_

## 成功基準

1. 扶養控除等申告書テンプレートの再現度が 90%+ に達する
2. テンプレートの要素数が 300 → 100 以下に削減される
3. 罫線のずれが解消される（擬似テーブルの接合点ギャップがなくなる）
4. EraSelect が全てのサイズで判読可能になる
5. 拡張した FormTable 機能が他の帳票テンプレートでも利用可能である

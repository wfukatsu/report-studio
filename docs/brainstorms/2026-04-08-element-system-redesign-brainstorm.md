# 要素システム Clean-slate リビルド

**Date:** 2026-04-08
**Status:** brainstorm-complete

## What We're Building

報告書デザインスタジオの全17要素をゼロから再設計する。Composition型パターンで共通ビルディングブロック（TextContent, BorderFrame, DataBinder等）を作り、各要素はそれらを組み合わせて構築する。

### 目的
1. **PDF出力の安定性** — SVG依存レンダリングをCSS/HTML中心に変換し、全要素がPDFで正しく表示されることを保証
2. **コード重複の排除** — Text/Label統合、共通PropertiesPanelセクション化
3. **新要素追加の簡素化** — Compositionブロックの組み合わせで最小コードで新要素を作れる
4. **機能の一貫性** — データバインディング、書式設定、スタイリングが全要素で統一的に動作
5. **未実装要素の解消** — chart実装、barcode code39/jan13実装 or 廃止

## Why This Approach

### Clean-slate リビルドを選んだ理由
- 既存テンプレートのマイグレーションを含む破壊的変更が許容される
- 現状のコード重複が広範で、パッチ的修正では根本解決にならない
- PDF出力安定性が最優先であり、レンダリング層の設計から見直す必要がある

### Composition型を選んだ理由
- React の思想に合致（小さなコンポーネントの合成）
- Config駆動型よりも柔軟性が高く、各要素固有のレンダリングロジックに対応しやすい
- 既存の sharedUI.tsx パターンの自然な拡張

## Key Decisions

### 1. Text / Label → Text に統合
- Label要素を廃止し、Text要素に一本化
- トークン `{{fieldKey}}` を含まなければ静的テキストとして動作するだけ
- 既存Labelはマイグレーションでtextに変換

### 2. table系 → formTable + repeatingBand の2本立て
- **table要素を廃止**。formTableで完全に代替可能
- **formTable**: 静的帳票レイアウト（セル型: label/input/dataField、body行繰り返し対応）
- **repeatingBand**: データ配列駆動の行生成（ヘッダー/フッター/集計/ソート）
- 既存tableデータはformTableにマイグレーション

### 3. chart要素を実装する
- チャートライブラリ（Recharts等）を統合して実際に描画
- PDF出力はSVGベースのRechartsが適切（SVG→PDF変換は安定）

### 4. Composition型 共通ビルディングブロック

#### Renderer用ブロック（案）
| ブロック | 責務 |
|----------|------|
| `<ElementFrame>` | ボーダー、背景色、パディング |
| `<TextContent>` | テキスト描画（フォント、配置、縦書き、ルビ） |
| `<DataResolver>` | フィールド解決 + フォーマット適用 |
| `<StampShape>` | 円形/矩形のSVGスタンプ枠（hanko用） |
| `<GridLines>` | グリッド線描画（manualEntry, formTable用） |
| `<BarcodeRenderer>` | QR/CODE128/他バーコード描画 |
| `<ChartRenderer>` | チャート描画（Recharts wrapper） |

#### PropertiesPanel用ブロック（案）
| ブロック | 提供するUI |
|----------|------------|
| `<TextStyleSection>` | フォント、サイズ、太字、色、配置、縦書き |
| `<BorderSection>` | ボーダー色、幅、スタイル、角丸 |
| `<DataBindingSection>` | フィールドキー入力、フォーマット選択 |
| `<FormatSection>` | 書式設定（小数桁数、カスタムパターン含む） |
| `<LayoutSection>` | レイアウト選択（column/row/grid） |
| `<FuriganaSection>` | ふりがな設定 |
| `<ColorSection>` | 色設定（背景、交互行色など） |

### 5. PDF出力安定性のための設計指針
- **原則**: CSS/HTMLベースのレンダリングを優先
- **SVG使用は限定的**: 図形（shape）、判子（hanko）、チャート（chart）のみ
- **manualEntryのグリッド**: SVG → CSS border + grid レイアウトに変更
- **ルビ**: `<ruby>` HTML要素はPDF互換性が低い → CSS位置調整方式を検討
- **マジックナンバー排除**: mm→px変換は定数化 `MM_TO_PX = 3.7795275591` (96dpi基準)

### 6. 要素の最終ラインナップ（16種）

| 要素 | 変更 |
|------|------|
| text | Label統合。ふりがな強化 |
| ~~label~~ | **廃止** → textに統合 |
| dataField | フォーマットUI完全化（小数桁数、カスタムパターン） |
| image | 画像アップロード対応（小:Base64 / 大:サーバー） |
| shape | 変更なし（SVGで問題なし） |
| ~~table~~ | **廃止** → formTableに統合 |
| chart | **新規実装**（Recharts） |
| barcode | code39/jan13を実装 |
| checkbox | ラベル位置オプション追加 |
| eraSelect | マジックナンバー定数化 |
| hanko | PDF互換性改善 |
| manualEntry | グリッドをCSS方式に変更 |
| approvalStampRow | 画像アップロード対応 |
| revenueStamp | 変更最小 |
| repeatingBand | groupBy/pageBreak実装 |
| repeatingList | pageBreak実装 |
| formTable | table機能統合、書式設定UI完全化 |

## Resolved Questions

1. **barcode code39/jan13** → **実装する**。react-barcodeが対応していれば統合
2. **groupBy / pageBreak** → **両方実装する**。帳票ツールとして必要な機能
3. **画像アップロード方式** → **両方対応**。小さい画像はBase64 inline、大きい画像はサーバーアップロード+URL参照。閾値で自動切替
4. **チャートライブラリ** → **Recharts**。SVGベースでPDF出力と相性が良い。Reactネイティブ
5. **マイグレーション戦略** → **手動で作り直し**。テンプレート数が少ないため

## Open Questions

（なし — 全て解決済み）

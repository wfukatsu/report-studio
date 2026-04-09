---
date: 2026-04-10
topic: repeatingband-groupby
---

# RepeatingBand groupBy 機能実装

## What We're Building

RepeatingBandElement の `groupBy` フィールド（型定義に既存、レンダラー未実装）を実装し、
データ行を指定フィールドでグルーピング表示できるようにする。

具体的には、`groupBy` が設定されている場合：
1. **グループヘッダー行**: 全列を結合し、グループ名（例: `■ 開発/テスト環境`）を表示
2. **データ行**: そのグループに属するレコードを通常どおり表示
3. **グループ小計行**: 先頭列に「小計」ラベル、残りの列に `totals` 定義に従った集計値を表示
4. **空行罫線**: 全グループ処理後、maxItems からデータ行数+ヘッダー行数+小計行数を引いた残りを空行で埋める

`groupBy` 未設定時は従来どおりフラット表示（後方互換）。

## Why This Approach

### 検討したアプローチ

| アプローチ | 概要 | 採否 |
|-----------|------|------|
| A. 既存レンダラー拡張 | RepeatingBandRenderer に groupBy 処理を追加 | **採用** |
| B. 新規 Element タイプ | GroupedRepeatingBand を別コンポーネントとして新設 | 却下 |

**Approach A を選んだ理由:**
- `groupBy` フィールドが型に既に存在し、後方互換が担保される
- `totals` 定義と `aggregateField()` をグループ単位で再利用でき、新しい型追加が最小限
- 新規 Element タイプを追加するとパレット・PropertiesPanel・レンダラー全て新規作成で重複が多い

## Key Decisions

- **グループヘッダー行**: 全列を結合（colspan）してグループフィールドの値を表示
- **グループ小計行**: 先頭列に「小計」ラベル、各列は `totals` 定義に従って集計値を表示（対象外の列は空白）
- **集計方法**: 既存の `totals`（RepeatingBandTotal[]）をグループ単位でも再利用。フッター = 総合計、グループ末尾 = グループ小計
- **スタイリング**: グループヘッダーは既存 `headerStyle` を活用、小計行は新規 `groupStyle?: TextStyle` を追加（デフォルト: 薄い背景色 + 太字）
- **空行罫線（showEmptyRowLines）**: groupBy 有効時は全グループ処理後にまとめて埋める。maxItems から実際に消費した行数（データ行 + ヘッダー行 + 小計行）を引いた残り
- **ソート**: groupBy 有効時はグループの表示順をデータ出現順で維持し、グループ内のみ既存の `sortBy`/`sortOrder` を適用

## Scope

### In Scope
- RepeatingBandRenderer の groupBy 実装（フロントエンド）
- グループヘッダー行・小計行のレンダリング
- showEmptyRowLines との組み合わせ
- PropertiesPanel への groupBy フィールド露出
- Scalar 見積書テンプレートの動作確認

### Out of Scope
- サーバーサイド PDF レンダラーの groupBy 対応（別タスク）
- PropertiesPanel の groupStyle カスタマイズ UI（初期実装ではデフォルト値のみ）
- ネストした groupBy（複数階層グルーピング）

## Resolved Questions

1. **グループヘッダー行の高さ**: データ行と同じ `itemHeight` を使用する。シンプルで showEmptyRowLines の計算も容易。
2. **グループの表示順**: データ配列内の出現順を維持する。データ提供側が順序を制御できる。

## Next Steps

-> `/workflows:plan` for implementation details

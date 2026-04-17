# ビジュアル数式エディタ移植ブレインストーム

**日付**: 2026-04-17
**ステータス**: 完了

## 何を作るか

v1（report-design-studio）の CodeMirror 6 ベースのリッチ数式エディタを v2（report-studio）にフル移植する。現在の素のテキストエリアによる JEXL 式入力を、IDE ライクな数式編集体験に置き換える。

### 対象コンポーネント
1. **ComputedFieldDialog** — BindingEditor の計算フィールドダイアログ
2. **CalculationTab** — 計算ルール用のタブ（RuleRow 内の式入力）

### 移植する機能（v1 からフル移植）

| 機能 | 説明 |
|------|------|
| FormulaEditor | CodeMirror 6 の単行エディタ（`fx` プレフィックス付き） |
| Lezer 文法 | カスタム formula.grammar による構文解析 |
| 構文ハイライト | 数値=緑、文字列=琥珀、関数名=紫、演算子=灰 |
| フィールドチップ | フィールド参照をカラーチップとして視覚化（master=青、detail=別色、computed=別色） |
| オートコンプリート | フィールドパス・関数名の補完ドロップダウン |
| Calltip | 関数の引数内にカーソルがあるとき、シグネチャとヒントを表示 |
| リンター | リアルタイムの波線アンダーラインによるエラー・警告表示 |
| FieldTreePanel | 左パネル: フィールドツリー（グループ別）+ 関数リスト（検索・カテゴリフィルタ） |
| FormulaToolbar | クイックアクセスボタン（SUM, AVG, IF, ROUND） |
| FormulaStatusBar | バリデーション状態、推論型、プレビュー値、文字数 |
| VisualExpression AST | 数式の構造化表現をデータモデルに保持 |
| 式評価パイプライン | tokenize → parse → validate → infer type → serialize → cycle detection |

## なぜこのアプローチか

1. **v1 で実証済み**: すでに動作する完成度の高い実装が存在する
2. **ユーザー体験の大幅向上**: テキストエリアに生の式を打ち込む現状から、IDE ライクな体験へ
3. **エラー防止**: リアルタイムバリデーション・オートコンプリート・calltip で入力ミスを削減
4. **視認性**: フィールドチップにより数式の構造が一目でわかる

## キー決定事項

### 1. 数式言語: v1 の独自数式言語に統一
- **現状**: v2 は JEXL（`@pawel-up/jexl`）を使用
- **変更後**: v1 の Lezer 文法ベースの数式言語に移行
- **理由**: v1 の数式エディタ（構文ハイライト・補完・calltip 等）はすべて Lezer 文法に依存しており、JEXL 互換に書き換えるよりも v1 の数式言語をそのまま移植する方が効率的
- **関数名**: `ROUND`, `SUM`, `AVG` 等の大文字形式（v1 スタイル）

### 2. サーバー側: JEXL エンジンを置き換え
- **現状**: `ExpressionEngine.java` が JEXL (`commons-jexl3`) でサーバー側評価
- **変更後**: v1 の数式言語に対応した式評価エンジンに置き換え
- **スコープ**: フロントエンド UI とサーバー側エンジンの両方を対応
- **移行**: 既存テンプレートの JEXL 式を新形式にマイグレーション
- **実現アプローチの選択肢**:
  1. **v1 の JS 評価エンジンを Java に手動移植** — v1 の `expression/evaluator.ts` のロジックを Java で再実装。最も制御しやすいが工数大
  2. **ANTLR で文法を定義し Java エバリュエータを生成** — Lezer 文法を ANTLR 文法に変換。Java エコシステムと相性が良い
  3. **GraalJS で v1 の JS エバリュエータをそのまま JVM 上で実行** — 移植不要だが GraalVM 依存が増える
  - **推奨**: アプローチ 2（ANTLR）。Lezer 文法からの変換が比較的容易で、Java ネイティブのパフォーマンスと型安全性を確保できる

### 2a. JEXL の利用箇所と影響範囲
JEXL はプロジェクト内で広く使われており、置き換えの影響範囲が大きい:

**フロントエンド** (`@pawel-up/jexl`):
| ファイル | 用途 |
|----------|------|
| `src/lib/jexlEngine.ts` | コア評価エンジン（10 組み込み関数） |
| `src/components/modals/CalculationTab.tsx` | 計算ルール UI（式プレビュー） |
| `src/lib/validationRunner.ts` | バリデーションルール条件評価 |

**バックエンド** (`commons-jexl3`):
| ファイル | 用途 |
|----------|------|
| `ExpressionEngine.java` | 中央評価エンジン（evaluate + calculate） |
| `JexlFunctions.java` | カスタム関数（フロントと同じ 10 関数） |
| `CalculationEngine.java` | 計算ルールのトポロジカルソート + 評価 |
| `ValidationEngine.java` | バリデーション条件の JEXL 評価 |
| `V2EvaluateController.java` | API エンドポイント（式テスト、レート制限） |

**JEXL を使っていないもの**: `ConditionEvaluator.java` は独自のフィールド比較ロジック（JEXL 非依存）→ 変更不要

### 3. 適用範囲: ComputedFieldDialog + CalculationTab の両方
- 数式エディタコンポーネント（`FormulaEditor`）を共有コンポーネントとして設計
- 両コンポーネントで統一された式編集体験を提供

### 4. 関数セット: v1 の 42 関数に統一
- **v2 現状**: 10 関数（sum, count, round, avg, min, max, concat, ifExpr, formatNumber, formatDate）
- **v1**: 42 関数（カテゴリ別: 数学、文字列、日付、集計、条件、書式）
- **方針**: v1 の関数セットをそのまま移植。v2 の既存 10 関数は v1 に含まれているため互換性問題なし
- フロントエンド（`formulaMetadata.ts`）とバックエンド（`JexlFunctions.java` → `FormulaFunctions.java`）の両方で 42 関数を実装

### 5. データモデル: VisualExpression AST を追加
- `SchemaField.expression` を `string` から `ComputedExpression` 型に変更
  ```ts
  interface ComputedExpression {
    formula: string           // シリアライズされた数式文字列
    visual?: VisualExpression // パースされた AST
    resultType: FieldType     // 推論された結果型
  }
  ```
- `CalculationRule.expression` も同様に変更

## v1 からの移植対象ファイル

### フロントエンド（`report-design-studio` → `report-studio`）

| v1 パス | 移植先 | 役割 |
|---------|--------|------|
| `internals/formula/FormulaEditor.tsx` | `src/components/formulaEditor/FormulaEditor.tsx` | CodeMirror 6 ラッパー |
| `internals/formula/useFormulaEditor.ts` | `src/components/formulaEditor/useFormulaEditor.ts` | EditorView ライフサイクル管理 |
| `internals/formula/FieldTreePanel.tsx` | `src/components/formulaEditor/FieldTreePanel.tsx` | フィールド/関数パネル |
| `internals/formula/FunctionList.tsx` | `src/components/formulaEditor/FunctionList.tsx` | 関数リスト |
| `internals/formula/FormulaToolbar.tsx` | `src/components/formulaEditor/FormulaToolbar.tsx` | クイックボタン |
| `internals/formula/FormulaStatusBar.tsx` | `src/components/formulaEditor/FormulaStatusBar.tsx` | ステータスバー |
| `internals/formula/fieldChipPlugin.ts` | `src/components/formulaEditor/plugins/fieldChipPlugin.ts` | チップ装飾 |
| `internals/formula/calltipPlugin.ts` | `src/components/formulaEditor/plugins/calltipPlugin.ts` | 関数ヒント |
| `internals/formula/formulaCompletions.ts` | `src/components/formulaEditor/plugins/formulaCompletions.ts` | 補完 |
| `internals/formula/formulaLinter.ts` | `src/components/formulaEditor/plugins/formulaLinter.ts` | リンター |
| `internals/formula/formulaLanguage.ts` | `src/components/formulaEditor/language/formulaLanguage.ts` | 言語登録 |
| `internals/formula/formula.grammar` | `src/components/formulaEditor/language/formula.grammar` | Lezer 文法 |
| `internals/formula/formulaMetadata.ts` | `src/components/formulaEditor/formulaMetadata.ts` | 関数メタデータ |
| `expression/parser.ts` | `src/lib/expression/parser.ts` | 式パーサー |
| `expression/serializer.ts` | `src/lib/expression/serializer.ts` | シリアライザー |
| `expression/tokenizer.ts` | `src/lib/expression/tokenizer.ts` | トークナイザー |
| `expression/inferResultType.ts` | `src/lib/expression/inferResultType.ts` | 型推論 |
| `expression/validator.ts` | `src/lib/expression/validator.ts` | バリデーター |
| `expression/evaluator.ts` | `src/lib/expression/evaluator.ts` | クライアント側評価 |
| `expression/dependencyGraph.ts` | `src/lib/expression/dependencyGraph.ts` | 循環参照検出 |

### サーバー側

| 変更対象 | 内容 |
|----------|------|
| `ExpressionEngine.java` | JEXL → v1 数式言語対応のエンジンに置き換え |
| `CalculationEngine.java` | 式評価呼び出し部分の対応 |
| 新規: `FormulaParser.java` | v1 数式のサーバー側パーサー |
| 新規: `FormulaEvaluator.java` | v1 数式のサーバー側評価エンジン |

### マイグレーション

| 対象 | 内容 |
|------|------|
| 既存テンプレートの JEXL 式 | 新数式形式にマイグレーション（`round()` → `ROUND()` 等） |
| `SchemaField` 型定義 | `expression: string` → `expression: ComputedExpression` |
| `CalculationRule` 型定義 | 同様に `ComputedExpression` 型に変更 |
| `ValidationRule.condition` | JEXL 条件式を新形式に変換 |

**マイグレーション戦略**:
- フロントエンド: `migration.ts` にバージョン付きマイグレーション関数を追加。テンプレート読み込み時に自動変換
- バックエンド: サーバー起動時またはテンプレート読み込み時にオンデマンド変換
- JEXL → 新形式の変換は構文的に近いため、関数名の大文字化 + `ifExpr()` → `IF()` 等のリネームが主な変更点
- 変換スクリプト（`scripts/migrate-jexl-to-formula.mjs`）でビルトインテンプレートを一括変換

## 新規依存パッケージ

**フロントエンド (npm)**:
- `@codemirror/view`, `@codemirror/state`, `@codemirror/language` — CodeMirror 6 コア
- `@codemirror/autocomplete` — 補完
- `@codemirror/lint` — リンティング
- `@lezer/lr` — Lezer パーサーランタイム
- `@lezer/generator` — Lezer 文法コンパイラ（ビルド時のみ）

**バックエンド (Gradle)**:
- `org.antlr:antlr4-runtime` — ANTLR 4 ランタイム（JEXL の `commons-jexl3` を置き換え）

## リスクと前提

1. **v1 コードの移植性**: v1 と v2 でスタイリング手法（Tailwind クラス等）、状態管理（Zustand vs v1 の方式）、React パターンが異なる可能性がある。移植時にアダプテーションが必要
2. **サーバー側エンジンの工数**: ANTLR 文法定義 + Java エバリュエータの実装は、フロントエンドの移植より工数が大きい可能性
3. **`@pawel-up/jexl` の完全除去**: フロント側で JEXL を使う箇所がすべて新エンジンに置き換わるまで、一時的に両方の依存が共存する

## Open Questions

_なし — すべての主要決定が解決済み_

---
title: "feat: ビジュアル数式エディタの v1 → v2 フル移植"
type: feat
status: completed
date: 2026-04-17
deepened: 2026-04-17
origin: docs/brainstorms/2026-04-17-visual-formula-editor-brainstorm.md
---

# feat: ビジュアル数式エディタの v1 → v2 フル移植

## Enhancement Summary

**Deepened on:** 2026-04-17
**Research agents used:** 10 (CM6 best practices, ANTLR4 research, TypeScript review, Security audit, Performance analysis, Architecture strategy, Data migration expert, Code simplicity, Frontend races, Institutional learnings)

### Critical Architecture Changes (from research)

1. **サーバー側: ANTLR 置換ではなく JEXL 翻訳レイヤーに変更** — Simplicity review により、ANTLR エンジンの新規実装（~1,100 LOC）ではなく、`translateFormulaToJexl()` 翻訳レイヤー（~20 LOC）で既存 JEXL を維持する方針に変更。Phase 4 のスコープが大幅に削減
2. **Phase 順序変更** — Architecture review により、サーバー側対応を Phase 1 と並行実施に変更。フロントが formula-v1 式を保存してもサーバーが評価できるようにする
3. **VisualExpression AST をデータモデルから除去** — 保存時に AST は不要。linter がオンデマンドでパースする
4. **関数セット: 10 関数で開始、42 は段階的追加** — 既存 JEXL 10 関数の UPPERCASE リネームのみ初回対応
5. **`string | ComputedExpression` union 型を廃止** — import 時に即座に正規化。store には常に `string` を保持

### Key Improvements Discovered

- **Performance**: CalculationTab で 50 個同時の CM6 インスタンスは NG → フォーカス時のみインスタンス化
- **Security**: 8 件のセキュリティ所見（HIGH 2 件: prototype pollution、深度制限なし）
- **Race conditions**: v1 コードに 2 件の critical race condition が潜在（StatusBar polling、linter dispatch）
- **Migration**: トークンレベルの変換が必要（文字列置換は不安全）、サーバー保存テンプレートの移行パス必要
- **Bundle**: `manualChunks` 設定必須、`unplugin-lezer` 推奨、`import type` 強制

## Overview

v1（report-design-studio）の CodeMirror 6 ベースのリッチ数式エディタを v2（report-studio）にフル移植する。現在のプレーンな `<textarea>` による JEXL 式入力を、構文ハイライト・オートコンプリート・フィールドチップ・リアルタイムリンティングを備えた IDE ライクな数式編集体験に置き換える。

同時に、数式言語を JEXL から v1 の独自数式言語（Lezer 文法ベース、UPPERCASE 関数名）に統一する。サーバー側は JEXL を維持し、翻訳レイヤー（`translateFormulaToJexl()`）で formula-v1 式を JEXL に変換して評価する。

## Problem Statement / Motivation

**現状の問題:**
- `ComputedFieldDialog` はプレーンな `<textarea>` に生の JEXL 式を手打ち — 構文チェックなし、補完なし、エラー表示なし
- `CalculationTab` の `RuleRow` も同様にプレーンな `<textarea>` — VariablePanel でトークン挿入は可能だが、構文支援はない
- ユーザーは JEXL 構文を知っている必要があり、タイポや構文エラーはサーバー評価時まで検出されない
- v1 には完成度の高い数式エディタ UI が存在するが、v2 には移植されていない

**期待される改善:**
- リアルタイムの構文検証でエラーを即座にフィードバック
- オートコンプリートとcalltipで入力を支援
- フィールドチップで数式の構造を視覚的に把握
- 10 個の組み込み関数（既存 JEXL の UPPERCASE 版）で開始、段階的に 42 個へ拡張

## Proposed Solution

v1 の実証済みの数式エディタ実装をフル移植する。3 フェーズに分けて段階的に実装する（研究結果に基づき再構成）:

1. **Phase 1: 基盤 + サーバー翻訳レイヤー** — Lezer 文法、CodeMirror 基本エディタ、型定義変更、JEXL 翻訳レイヤー、マイグレーション（並行実施）
2. **Phase 2: リッチ UI** — フィールドチップ、オートコンプリート、calltip、リンター、ステータスバー
3. **Phase 3: 統合** — ComputedFieldDialog と CalculationTab への組み込み、ValidationTab 対応、JEXL 除去

> **変更理由 (Architecture review)**: 元の Phase 4（サーバー側 ANTLR）を Phase 1 に統合。サーバーが formula-v1 式を評価できない期間を排除。ANTLR の代わりに JEXL 翻訳レイヤー（~20 LOC）を採用し、スコープを大幅削減。

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────────────┐
│ UI Layer                                            │
│  ┌─────────────────┐  ┌──────────────────────────┐  │
│  │FieldTreePanel   │  │ FormulaEditor (CM6)      │  │
│  │ - Fields tab    │  │ ┌──────────────────────┐ │  │
│  │ - Functions tab │──│ │ fx  SUM(price * qty) │ │  │
│  └─────────────────┘  │ └──────────────────────┘ │  │
│                       │ FormulaToolbar            │  │
│                       │ FormulaStatusBar          │  │
│                       └──────────────────────────┘  │
├─────────────────────────────────────────────────────┤
│ Language Layer                                      │
│  formula.grammar (Lezer) → syntax tree              │
│  formulaCompletions.ts → autocomplete source        │
│  formulaLinter.ts → diagnostics                     │
│  fieldChipPlugin.ts → visual decorations            │
│  calltipPlugin.ts → function arg hints              │
├─────────────────────────────────────────────────────┤
│ Expression Engine (shared)                          │
│  tokenizer → parser → validator → inferResultType   │
│  → formulaToJexl() → jexlEngine (client preview)    │
│  → dependencyGraph (circular ref detection)         │
├─────────────────────────────────────────────────────┤
│ Integration Points                                  │
│  ComputedFieldDialog  CalculationTab  ValidationTab │
│  (BindingEditor)      (DataMgmt)      (DataMgmt)    │
├─────────────────────────────────────────────────────┤
│ Server (Java/Javalin)                               │
│  ExpressionEngine.java                              │
│    └─ translateFormulaToJexl() → JEXL evaluate      │
│  JexlFunctions.java (既存 10 関数を維持)             │
└─────────────────────────────────────────────────────┘
```

### Design Decisions

以下の決定はブレインストームで確定後、研究結果に基づき修正済み (see brainstorm: `docs/brainstorms/2026-04-17-visual-formula-editor-brainstorm.md`):

1. **数式言語**: v1 の独自言語に統一（UPPERCASE 関数名: `SUM`, `ROUND`, `IF` 等）
2. **サーバー側**: ~~ANTLR~~ → JEXL 翻訳レイヤーで既存 JEXL を維持 (RI-1)
3. **適用範囲**: ComputedFieldDialog + CalculationTab + ValidationTab の全 3 箇所
4. **関数セット**: ~~42 関数フル移植~~ → 10 関数で開始、段階追加 (RI-3)
5. **データモデル**: ~~ComputedExpression 型~~ → `expression: string` のまま維持 (RI-2)

### SpecFlow で特定された重要な設計判断

SpecFlow 分析で以下の問題が特定された。各判断を記載する:

**Q1: フィールド参照の大文字/小文字区別**
- **判断**: フィールド識別子は**大文字小文字を区別する（case-sensitive）**。`SchemaField.key` はそのまま小文字で保持。UPPERCASE は関数名と `AND`/`OR`/`NOT` キーワードのみ。
- **理由**: 既存のフィールドキー（`price`, `qty` 等）をそのまま使える。マイグレーション対象は関数名のみ。

**Q2: フィールド参照のワイヤーフォーマット**
- **判断**: チップは**純粋にビジュアル装飾**。保存される式文字列は生の識別子（`price * qty`）のまま。`fieldChipPlugin` が Lezer 構文木の `FieldRef` ノードを検出して装飾する。
- **理由**: ストレージ形式の変更を最小化し、マイグレーション範囲を関数名リネームに限定する。

**Q3: クライアント側プレビューのアーキテクチャ**
- **判断**: formula-v1 式を `formulaToJexl()` で JEXL に変換後、既存 `evaluateExpression()` で**クライアント側プレビュー評価**する。サーバーへの API コールは不要。(RI-1 により `bignumber.js` 移植は不要に)
- **理由**: オフライン動作可能、レート制限の影響を受けない、レスポンスが即時。既存 JEXL エンジンを再利用。

**Q4: ValidationTab の対応**
- **判断**: ValidationTab の `RuleRow` にも FormulaEditor を適用する。3 箇所すべてで統一された体験を提供する。
- **理由**: 条件式も関数名がマイグレーションされるため、新構文の入力支援が必要。

**Q5: Undo/Redo の粒度**
- **判断**: CodeMirror 内部の undo/redo（Ctrl+Z/Y）は CM 独自のヒストリで管理。Zustand の `pushHistory` は**ダイアログ保存時のみ**発火（式の途中編集は pushHistory しない）。
- **理由**: 現在の textarea も onChange で毎キーストローク pushHistory していない。CM の内部ヒストリが十分。

**Q6: 500 文字制限の UI 表示**
- **判断**: CM の `transactionFilter` で 500 文字超の入力をブロック。FormulaStatusBar に文字数を常時表示し、450 文字で警告色に変更。
- **理由**: v1 の 512 文字制限を v2 の 500 文字制限に合わせる。

**Q7: 循環依存の検出**
- **判断**: `dependencyGraph.ts` をクライアント側に移植し、FormulaLinter がリアルタイムで循環依存を検出・警告する。`calculationRules` 全体を linter コンテキストとして渡す。
- **理由**: サーバー評価時まで検出が遅延すると UX が悪い。

**Q8: `MAX_EXPRESSIONS_PER_TEMPLATE` の不整合**
- **判断**: フロントエンドの Zod スキーマを `z.array().max(50)` に修正してサーバーと一致させる。
- **理由**: 現在の `max(100)` はサーバーの `MAX_EXPRESSIONS_PER_TEMPLATE = 50` と矛盾。

**Q9: 式言語バージョンタグ**
- **判断**: `ReportDefinition` メタデータに `formulaLanguage: 'jexl' | 'formula-v1'` を追加。`importFromJSON()` でこのタグを参照してマイグレーションの要否を判断する。
- **理由**: ヒューリスティックな構文検出より確実。

### Research Insights — 設計判断の修正

以下は 10 エージェントの並列研究から得られた重要な修正事項:

#### RI-1: サーバー側は ANTLR ではなく JEXL 翻訳レイヤー (Simplicity + Architecture review)

**元の計画**: ANTLR 文法 + Java 評価器 + FormulaFunctions.java（~1,100 LOC 新規）
**修正後**: `ExpressionEngine.java` に `translateFormulaToJexl()` メソッドを追加（~20 LOC）

```java
// ExpressionEngine.java に追加
private static final Map<String, String> FORMULA_TO_JEXL = Map.of(
    "SUM(", "sum(", "COUNT(", "count(", "ROUND(", "round(",
    "AVG(", "avg(", "MIN(", "min(", "MAX(", "max(",
    "CONCAT(", "concat(", "IF(", "ifExpr(",
    "TEXT(", "formatNumber(", "FORMAT_DATE(", "formatDate("
);

static String translateFormulaToJexl(String formula) {
    String result = formula;
    for (var entry : FORMULA_TO_JEXL.entrySet()) {
        result = result.replace(entry.getKey(), entry.getValue());
    }
    return result;
}
```

**理由**: 既存 JEXL のサンドボックス、タイムアウト、セキュリティ保護をそのまま活用。ANTLR ビルドパイプライン不要。`commons-jexl3` を維持。

#### RI-2: VisualExpression AST はデータモデルから除去 (Simplicity + TypeScript review)

**元の計画**: `ComputedExpression = { formula, visual?, resultType }` を保存
**修正後**: `expression` は `string` のまま。`resultType` は linter がオンデマンドで推論

**理由**: v2 には AST を直接走査する機能（フィールドリネーム、依存グラフ UI）がない。AST は linter 内でオンデマンドでパースすれば十分。`serializer.ts` も不要に。

#### RI-3: 関数セットは 10 関数で開始 (Simplicity review)

**元の計画**: v1 の 42 関数をフル移植
**修正後**: 既存 JEXL 10 関数の UPPERCASE リネームのみ初回対応。残り 32 関数は Phase 2+ で段階追加

| 初回対応 (10) | `SUM`, `COUNT`, `ROUND`, `AVG`, `MIN`, `MAX`, `CONCAT`, `IF`, `TEXT`, `FORMAT_DATE` |
|--------------|---|
| 段階追加 (32) | `FLOOR`, `CEIL`, `ABS`, `MOD`, `POWER`, `TRUNC`, `INT`, `COALESCE`, `SWITCH`, `ISBLANK`, 文字列 12 個, 日付 6 個, 変換 2 個, `SUMIF`, `COUNTIF` |

#### RI-4: union 型の廃止 — import 時に即座正規化 (Architecture + TypeScript review)

**元の計画**: `expression: string | ComputedExpression`（移行期間中）
**修正後**: store には常に `expression: string` を保持。import 時に `migrateJexlToFormula()` で即座変換

```ts
// expressionNormalizer.ts — import boundary で使用
export function normalizeExpression(expr: string): string {
  // JEXL 関数名を UPPERCASE に変換（トークンレベル）
  return migrateJexlFunctionNames(expr);
}
```

**理由**: union 型は store の全消費者にガードを強制する。正規化を import boundary に限定すれば、store 以降のコードは単一型で動作。

#### RI-5: CalculationTab エディタの仮想化 (Performance review)

**元の計画**: 50 RuleRow すべてに CM6 エディタを同時マウント
**修正後**: フォーカス中の RuleRow のみ CM6 エディタを表示。他はスタティックテキスト表示

**理由**: 50 CM6 インスタンス = ~12 MB ヒープ + マウント時に 50 linter 同時発火。フォーカス時のみ = ~250 KB + 1 linter。

#### RI-6: v1 コードの race condition を移植前に修正 (Frontend races review)

| 問題 | 修正 |
|------|------|
| **CRITICAL**: FormulaStatusBar の `setInterval` が破棄済み EditorView を読む | `viewRef.current = null` を `destroy()` 前に設定。polling を廃止し `updateListener` に置換 |
| **CRITICAL**: `formulaLinter.ts` が lint コールバック内で `view.dispatch()` | `setDiagnostics()` で push し、`updateListener` で React state に橋渡し |
| **HIGH**: `insertAtCursor` の IME `blur/focus` トリック | `blur/focus` を除去。CM6 は composing 中の dispatch を正しく処理 |
| **HIGH**: `tooltipParent={dialogNodeRef.current}` が null | `useState` で管理し、`ref` callback で `setDialogNode(node)` |
| **HIGH**: CalculationTab の linter cascade | `peerRuleKeys` のみを依存に。full `calculationRules` は渡さない |

#### RI-7: セキュリティ所見 (Security review)

| ID | 重要度 | 所見 | 対策 |
|----|--------|------|------|
| SEC-01 | HIGH | prototype pollution — 新評価パスが `dataBinding.ts` の `FORBIDDEN_KEYS` を経由しない | evaluator に `ReadonlyMap` を強制。Zod で `SchemaField.key` に `.refine()` 追加 |
| SEC-02 | HIGH | クライアント側 evaluator に深度/ノード数制限がない（ANTLR 不要になったが client evaluator に適用） | `MAX_AST_NODES=100`, `MAX_NESTING=10` を evaluator に実装 |
| SEC-03 | MEDIUM | `constructor` がトークナイザーの禁止リストにない | forbidden identifiers に `constructor`, `class`, `import`, `require` 追加 |
| SEC-05 | MEDIUM | クライアント evaluator にタイムアウトなし | `performance.now()` で 100ms wall-clock チェック |
| SEC-07 | LOW | `POWER` の指数ガードの移植漏れリスク | `POWER(2, 9999)` → null のテスト必須 |

#### RI-8: CodeMirror 6 ベストプラクティス (CM6 research)

| 項目 | 推奨 |
|------|------|
| Lezer + Vite | `unplugin-lezer` （dev + build 両対応）または pre-build script |
| React wrapper | `useRef` + `useEffect(fn, [])` で一度だけ作成。値同期は別 `useEffect` |
| 動的 extension | `Compartment.reconfigure()` で再構成。`EditorView` の再作成は不要 |
| 単行エディタ | `transactionFilter`（paste 対応）+ `Prec.highest(keymap)` で Enter ブロック |
| tooltip in modal | `EditorView.tooltipParent.of(dialogNode)` — `document.body` でも可 |
| バンドル | `basicSetup` を使わず個別 import。`vite.config.ts` に `manualChunks` 必須 |
| IME | `view.composing` チェック。`compositionend` を `preventDefault` しない |
| chip 装飾 | `Decoration.replace` + `WidgetType.eq()` で DOM 再利用 |

#### RI-9: マイグレーション安全性 (Data migration review)

| 問題 | 対策 |
|------|------|
| 文字列置換は不安全（文字列リテラル内の関数名を誤変換） | トークナイザーで `FunctionCall` ノードを特定し、そのトークンのみ置換 |
| 変換できない式を `formula-v1` タグ付きで保存すると silent failure | 100% 変換成功時のみ `formula-v1` タグ設定。部分失敗時は `jexl` 維持 |
| サーバー保存テンプレートの移行パスなし | サーバー側に dual-engine ディスパッチ（`formulaLanguage` タグで分岐）。移行期間中は JEXL 評価パスを維持 |
| `formatNumber(v, 'decimal2')` → `TEXT(v, 'decimal2')` のセマンティック差異 | 書式パターン構文を固定し、クロスプラットフォームテストを追加 |
| `calculationRules.max(100)` → `max(50)` が既存テンプレートを破壊 | 変更前にサーバー DB を監査。51-100 件のテンプレートが存在しないことを確認 |

### Implementation Phases

---

#### Phase 1: 基盤 + サーバー翻訳レイヤー

**目標**: 10 関数の定義、Lezer 文法、CodeMirror 基本エディタ、型定義変更、式評価パイプライン、サーバー側翻訳レイヤー、マイグレーション

##### 1.1 依存パッケージの追加

```bash
npm install @codemirror/view @codemirror/state @codemirror/language \
  @codemirror/commands @codemirror/autocomplete @codemirror/lint \
  @lezer/highlight @lezer/lr
npm install -D unplugin-lezer @lezer/generator
```

> **変更**: `bignumber.js` 除去（既存 jexlEngine をプレビュー評価に使用）。`unplugin-lezer` 追加（Lezer 文法の Vite 統合）。

**ファイル:**
- `package.json` — 依存追加
- `vite.config.ts` — `unplugin-lezer/vite` プラグイン追加 + `manualChunks` 設定:

```ts
// vite.config.ts に追加
import lezer from 'unplugin-lezer/vite'

export default defineConfig({
  plugins: [react(), lezer()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'codemirror': [
            '@codemirror/state', '@codemirror/view', '@codemirror/language',
            '@codemirror/commands', '@codemirror/autocomplete', '@codemirror/lint',
            '@lezer/highlight', '@lezer/lr', '@lezer/common',
          ],
        },
      },
    },
  },
  resolve: {
    dedupe: ['@codemirror/state', '@codemirror/view', '@codemirror/language'],
  },
})
```

##### 1.2 関数カタログの定義

既存 JEXL 10 関数の UPPERCASE 版を定義。残り 32 関数は Phase 2 以降で段階追加。

**ファイル:**
- `src/lib/formula/functionCatalog.ts` — 10 関数の定義（名前、シグネチャ、カテゴリ、日本語説明）

**初回対応 10 関数** (既存 JEXL からのリネーム):

| カテゴリ | 関数 | JEXL 元名 |
|----------|------|-----------|
| 集計 (4) | `SUM`, `COUNT`, `AVG`, `MIN`, `MAX` | `sum`, `count`, `avg`, `min`, `max` |
| 算術 (1) | `ROUND` | `round` |
| 条件 (1) | `IF` | `ifExpr` |
| 文字列 (1) | `CONCAT` | `concat` |
| 書式 (2) | `TEXT`, `FORMAT_DATE` | `formatNumber`, `formatDate` |

##### 1.3 型定義の変更

> **簡略化 (Simplicity + TypeScript review)**: `VisualExpression` AST と `ComputedExpression` 型は不要。`expression` は `string` のまま維持。import 時にトークンレベル正規化。

**ファイル:**
- `src/types/index.ts` — `FormulaLanguage` 型追加、`ReportDefinition` に `formulaLanguage` フィールド追加

```ts
// src/types/index.ts に追加
export type FormulaLanguage = 'jexl' | 'formula-v1';

// SchemaField — 変更なし（expression は string のまま）
// CalculationRule — 変更なし（expression は string のまま）
// ValidationRule — 変更なし（condition は string のまま）

// ReportDefinition に追加
export interface ReportDefinition {
  // ... existing fields ...
  formulaLanguage?: FormulaLanguage; // undefined = 'jexl' (後方互換)
}
```

- `src/lib/schemas/reportDefinition.ts` — Zod スキーマの更新:
  - `formulaLanguage: z.enum(['jexl', 'formula-v1']).optional()` 追加
  - `calculationRules` の `max(100)` → `max(50)` （**注意**: 変更前にサーバー DB を監査。51+ ルールのテンプレートが存在しないことを確認）
  - `SchemaField.key` に `.refine()` 追加: `__proto__`, `constructor`, `prototype` を禁止 (SEC-01)

##### 1.4 Lezer 文法と言語定義

v1 の `formula.grammar` を移植し、Vite ビルドパイプラインに統合。

**ファイル:**
- `src/lib/formula/language/formula.grammar` — Lezer 文法定義（v1 から移植）
- `src/lib/formula/language/formula.grammar.d.ts` — 型定義
- `src/lib/formula/language/formulaLanguage.ts` — `LRLanguage.define()` + `styleTags`
- `vite.config.ts` — `vite-plugin-lezer` の追加（または pre-build スクリプト）

**ビルド統合の選択肢:**
- **推奨**: `@rollup/plugin-lezer`（Vite は Rollup ベース）または `lezer-generator` CLI で pre-build して生成ファイルをコミット（v1 と同じ方式）
- v1 は pre-build 方式を使用（`formula.parser.ts` + `formula.parser.terms.ts` を生成してコミット）

##### 1.5 式評価パイプライン

v1 の `expression/` ディレクトリを移植。`serializer.ts` は不要（AST を保存しないため）。`evaluator.ts` は移植せず、既存 `jexlEngine.ts` をプレビュー評価に使用。

**ファイル:**
- `src/lib/formula/expression/tokens.ts` — トークン種別定義
- `src/lib/formula/expression/tokenizer.ts` — 手書きトークナイザー（500 文字制限、XSS 防止）
  - **SEC-03**: forbidden identifiers に `constructor`, `class`, `import`, `require` を追加
- `src/lib/formula/expression/parser.ts` — Pratt パーサー（`VisualExpression` AST 生成、linter 内でのみ使用）
  - **SEC-02**: `MAX_AST_NODES=100`, `MAX_NESTING=10` を厳格に適用
- `src/lib/formula/expression/validator.ts` — セマンティックバリデーション
- `src/lib/formula/expression/inferResultType.ts` — 型推論
- `src/lib/formula/expression/dependencyGraph.ts` — 循環参照検出
- `src/lib/formula/expression/errors.ts` — `ParseError` 型
- `src/lib/formula/expression/index.ts` — re-export
- `src/lib/formula/expression/formulaToJexl.ts` — formula-v1 → JEXL 文字列変換（クライアント側プレビュー用）

> **プレビュー評価の流れ**: formula-v1 式 → `formulaToJexl()` で JEXL 形式に変換 → 既存 `evaluateExpression()` で評価

**テスト:**
- `src/lib/formula/expression/__tests__/tokenizer.test.ts`
- `src/lib/formula/expression/__tests__/parser.test.ts`
- `src/lib/formula/expression/__tests__/validator.test.ts`
- `src/lib/formula/expression/__tests__/dependencyGraph.test.ts`
- `src/lib/formula/expression/__tests__/formulaToJexl.test.ts`

##### 1.6 CodeMirror 基本エディタコンポーネント

**ファイル:**
- `src/components/formulaEditor/FormulaEditor.tsx` — CM6 ラッパーコンポーネント
- `src/components/formulaEditor/useFormulaEditor.ts` — EditorView ライフサイクル hook（単行フィルタ、500 文字フィルタ、ペーストサニタイズ、`insertAtCursor`）

**適応が必要な v1 → v2 差異:**
- CSS: `var(--color-binder)` → Tailwind の `hsl(var(--primary))` 等にリマップ
- dialog vs div modal: `tooltipParent` を `useState` で管理（`ref` ではなく）(Race #4)
- v1 の CSS Modules スタイル → Tailwind ユーティリティクラスに変換

**v1 からの race condition 修正（移植時に適用）:**
- `viewRef.current = null` を `destroy()` **前**に設定 (Race #1)
- `setInterval` polling を廃止 → `EditorView.updateListener` で React state に橋渡し (Race #1)
- `insertAtCursor` の `blur/focus` IME トリックを除去 — CM6 が composing 中 dispatch を正しく処理 (Race #3)
- `tooltipParent` を `Compartment` で管理（`baseExtensions` に含めない）(Race #7)

**CM6 ベストプラクティス適用:**
- `basicSetup` を使わず必要な extension のみ個別 import
- `dynamicExtensions` は親コンポーネントで `useMemo` 必須
- `import type` を厳格に使用（バンドルリーク防止）
- `Prec.highest(keymap.of([{ key: 'Enter', run: ... }]))` で Enter を submit に変換

**成果物:** 基本的な構文ハイライト付きの単行数式エディタが動作する

##### 1.7 サーバー側翻訳レイヤー

**ファイル:**
- `server/src/main/java/com/report/server/ExpressionEngine.java` — `translateFormulaToJexl()` メソッド追加。`calculate()` と `evaluate()` で呼び出し前に変換
- `server/src/test/java/com/report/server/ExpressionEngineTest.java` — 翻訳テスト追加

**翻訳ロジック:**
```java
public Object calculate(String expression, Map<String, Object> context) {
    String formulaLang = detectFormulaLanguage(expression);
    String jexlExpr = formulaLang.equals("formula-v1")
        ? translateFormulaToJexl(expression)
        : expression;
    return evaluateJexl(jexlExpr, context);
}
```

**dual-engine ディスパッチ** (Migration review): `formulaLanguage` タグに基づいてフロントから送られる式の言語を判定。タグなし/`jexl` → そのまま JEXL 評価。`formula-v1` → 翻訳後 JEXL 評価。

##### 1.8 フロントエンド マイグレーション

**ファイル:**
- `src/lib/migration.ts` — `migrateJexlToFormula(definition)` 関数を追加
- `src/lib/formula/jexlMigrator.ts` — トークンレベルの JEXL → formula-v1 変換

**マイグレーション方式** (Migration review — 文字列置換ではなくトークンレベル):
```ts
// jexlMigrator.ts — トークナイザーで FunctionCall を特定して変換
export function migrateExpression(jexlExpr: string): MigrationResult {
  const tokens = tokenizeJexl(jexlExpr);
  // FunctionCall トークンのみ UPPERCASE に変換
  // 文字列リテラル内のテキストはスキップ
  // 100% 変換成功の場合のみ { ok: true, formula } を返す
  // 失敗時は { ok: false, original: jexlExpr, errors } を返す
}
```

**安全ガード:**
- 100% 変換成功時のみ `formulaLanguage: 'formula-v1'` を設定
- 部分失敗時は `formulaLanguage: 'jexl'` を維持（サーバーは JEXL 評価パスを使用）
- ビルトインテンプレートは `scripts/migrate-jexl-to-formula.mjs` で一括変換

**テスト:**
- `src/lib/formula/__tests__/jexlMigrator.test.ts`
- `src/lib/migration.test.ts` — マイグレーションテスト追加

**成果物:** フロント + サーバーの両方が formula-v1 式を処理可能。既存テンプレートが自動マイグレーション。

---

#### Phase 2: リッチ UI — CodeMirror プラグインと周辺コンポーネント

**目標**: フィールドチップ、オートコンプリート、calltip、リンター、ステータスバー、ツールバー、フィールドツリーパネル

##### 2.1 CodeMirror プラグイン

> **配置変更 (TypeScript review)**: CM6 plugin は React コンポーネントではないため `src/lib/formula/editor/` に配置

**ファイル:**
- `src/lib/formula/editor/fieldChipPlugin.ts` — `FieldRef` ノードをカラーチップに装飾（master=青, detail=別色, computed=紫）
  - `Decoration.replace` + `WidgetType.eq()` で DOM 再利用
  - `syntaxTree(view.state).length < view.state.doc.length` で不完全パース時はスキップ (Race #8)
- `src/lib/formula/editor/calltipPlugin.ts` — 関数の引数ヒント（シグネチャ、アクティブ引数ハイライト、型情報、使用例）
- `src/lib/formula/editor/formulaCompletions.ts` — フィールドパス + 10 関数名の補完ソース（日本語ラベル検索対応）
  - completion source はクロージャで `fieldsRef.current` を参照（Compartment 再構成不要）
- `src/lib/formula/editor/formulaLinter.ts` — parse + validate + inferResultType をリアルタイム実行
  - **CRITICAL FIX (Race #2)**: lint コールバック内で `view.dispatch()` しない。`Diagnostic[]` のみ返す。`FormulaValidationState` は `EditorView.updateListener` で React state に橋渡し
  - プレビュー評価: `formulaToJexl()` → `evaluateExpression()` で既存 JEXL エンジンを使用
  - **SEC-05**: `performance.now()` で 100ms wall-clock チェック
  - `dependencyGraph` は pre-computed を受け取る（`useMemo` で計算済み）(Performance #3)

**スタイル:**
- チップの色は Tailwind CSS 変数を使用: `--primary`（master）、`--accent`（detail）、`--chart-3`（computed）
- calltip と autocomplete のポップオーバーは `tooltipParent` でモーダル内に制約

##### 2.2 周辺 UI コンポーネント

**ファイル:**
- `src/components/formulaEditor/FormulaToolbar.tsx` — クイック挿入ボタン（SUM, AVG, IF, ROUND）。クリックで `insertAtCursor` を呼び出し
- `src/components/formulaEditor/FormulaStatusBar.tsx` — CM の `formulaValidationField` StateField を読み取り、バリデーション状態（✓有効 / ✗エラー / ⚠警告）、推論型バッジ、プレビュー値、文字数（450 で警告色）を表示
- `src/components/formulaEditor/FieldTreePanel.tsx` — 2 タブ構成: 「フィールド」タブ（スキーマグループ別のフィールドツリー）と「関数」タブ（FunctionList）
- `src/components/formulaEditor/FunctionList.tsx` — 10 関数の検索・カテゴリフィルタ付きリスト（段階的に 42 へ拡張）。展開で説明・引数型・例を表示。「挿入」ボタン

**テスト:**
- `src/components/formulaEditor/__tests__/FormulaEditor.test.tsx`
- `src/components/formulaEditor/__tests__/FormulaStatusBar.test.tsx`
- `src/components/formulaEditor/__tests__/FieldTreePanel.test.tsx`
- `src/components/formulaEditor/__tests__/FunctionList.test.tsx`

**成果物:** フル機能の数式エディタコンポーネントが単体で動作する（Storybook で確認可能）

---

#### Phase 3: 統合 — 既存コンポーネントへの組み込み

**目標**: FormulaEditor を ComputedFieldDialog、CalculationTab、ValidationTab に統合

##### 3.1 ComputedFieldDialog の書き換え

**ファイル:**
- `src/components/bindingEditor/internals/ComputedFieldDialog.tsx` — textarea を FormulaEditor に置き換え。FieldTreePanel を左パネルに配置（grid layout `200px 1fr`）

**変更点:**
- レイアウト: 単一カラム → 2 カラム（左: FieldTreePanel、右: エディタ + ツールバー + ステータスバー）
- 保存ロジック: 保存時に tokenize → parse → validate → infer type の全パイプラインを実行。エラー時は保存ブロック (SEC-04)
- FieldTreePanel のコンテキスト: 同一グループ内のフィールドのみ表示（computed フィールド除く）
- `tooltipParent` を `useState` で管理（`ref` ではなく）(Race #4)

##### 3.2 CalculationTab の書き換え

**ファイル:**
- `src/components/modals/CalculationTab.tsx` — `RuleRow` 内の textarea を FormulaEditor に置き換え。既存の VariablePanel を FieldTreePanel に置き換え

**変更点:**
- **エディタ仮想化 (Performance #2)**: フォーカス中の RuleRow のみ CM6 エディタを表示。他はスタティックテキスト + chip 風スタイル（regex ベース、CM 不要）。これにより同時 CM6 インスタンスを 1-3 に制限
- FieldTreePanel のコンテキスト: 全グループのフィールド + 他の計算ルールキー
- **linter cascade 防止 (Race #5)**: `peerRuleKeys` のみを依存に渡す（full `calculationRules` は渡さない）
- テストボタン: `formulaToJexl()` → 既存 `evaluateExpression()` で評価
- FormulaStatusBar で結果型とプレビュー値を常時表示
- `dependencyGraph` は CalculationTab レベルで `useMemo` し、各 RuleRow の linter に渡す

##### 3.3 ValidationTab の対応

**ファイル:**
- `src/components/modals/ValidationTab.tsx` — `RuleRow` 内の condition 入力を FormulaEditor に置き換え

**変更点:**
- FieldTreePanel のコンテキスト: 全グループのフィールド + 計算ルールキー（条件式はクロスグループ参照可能）
- FormulaStatusBar: 推論型は `boolean` を期待（boolean 以外は警告）
- `ValidationRule.condition` は `string` のまま（AST 不要 — 条件式は単純なため）

##### 3.4 Store スライスの更新

> **簡略化**: expression は `string` のまま。store スライスの型変更は不要。

**ファイル:**
- `src/store/schemaSlice.ts` — 変更なし（expression は string のまま）
- `src/store/rulesSlice.ts` — 変更なし
- `src/store/computedSlice.ts` — 変更なし

**テスト:**
- `src/components/bindingEditor/__tests__/ComputedFieldDialog.test.tsx`
- `src/components/modals/__tests__/CalculationTab.test.tsx`
- `src/components/modals/__tests__/ValidationTab.test.tsx`

**成果物:** 3 箇所すべてで新数式エディタが動作する

---

> **注**: 元の Phase 4（ANTLR エンジン + マイグレーション）は Phase 1 に統合済み。ANTLR は翻訳レイヤーに簡略化。
>
> Phase 3 完了後の JEXL 依存の整理:
> - `src/lib/jexlEngine.ts` — **維持**（プレビュー評価 + `validationRunner.ts` で引き続き使用）
> - `@pawel-up/jexl` — **維持**（JEXL は翻訳ターゲットとして引き続き必要）
> - `server/src/main/java/com/report/server/JexlFunctions.java` — **維持**
> - `server/src/main/java/com/report/server/ExpressionEngine.java` — **維持**（`translateFormulaToJexl()` 追加済み）
>
> **将来的な JEXL 完全除去**: 42 関数のフル移植と独自クライアント評価器の実装後に検討。現時点では YAGNI。

---

## Alternative Approaches Considered

| アプローチ | 判断 |
|-----------|------|
| JEXL 互換の Lezer 文法を作成 | 不採用: JEXL の構文（`\|` パイプ、三項演算子 `?:` ）は Lezer で表現が複雑。v1 の文法をそのまま使う方が効率的 |
| ビジュアルブロックビルダー (Blockly) | 不採用: 実装コストが大きく、パワーユーザーには逆に使いにくい。v1 の CodeMirror アプローチが実証済み |
| ANTLR で Java 評価器を新規実装 | **当初採用 → 不採用に変更**: Simplicity review により、翻訳レイヤー（~20 LOC）で JEXL を維持する方が ~1,100 LOC 削減。既存セキュリティ保護も維持 |
| GraalJS でサーバー側も JS 評価 | 不採用: GraalVM 依存が増え、デプロイが複雑化 |
| フロントのみ先行（サーバーは JEXL のまま） | **採用（翻訳レイヤー付き）**: `translateFormulaToJexl()` で関数名を変換してから JEXL 評価。Phase 1 でサーバー側も対応するためリスクなし |

## System-Wide Impact

### Interaction Graph

式の評価は以下のチェーンで発火:
1. ユーザーが式を入力 → FormulaEditor onChange → FormulaLinter が parse + validate + evaluate
2. 保存 → store action (`updateCalculationRule` / `addSchemaField`) → `pushHistory`
3. プレビュー/PDF エクスポート → サーバーへ POST → `V2EvaluateController` → `CalculationEngine` → `FormulaEvaluator.evaluate()`
4. バリデーション → `ValidationEngine` → `FormulaEvaluator.evaluate()` (boolean)

### Error Propagation

- **フロント**: FormulaLinter → `ParseError` with offset → CM `Diagnostic[]` → 波線表示
- **フロント**: FormulaStatusBar → バリデーション結果をテキスト表示
- **サーバー**: `FormulaException` → `CalculationEngine` がキャッチ → `onError` フォールバック (zero/empty/error_text)
- **サーバー**: `V2EvaluateController` → HTTP 422 with error message

### State Lifecycle Risks

- **移行期間中の二重フォーマット**: `formulaLanguage` タグで JEXL か formula-v1 か判別。タグがない場合は JEXL と見なして自動マイグレーション
- **保存前クラッシュ**: CM の内部 undo ヒストリはメモリのみ — ブラウザクラッシュで編集中の式は失われる（既存の textarea と同じリスク）
- **部分的マイグレーション失敗**: `migrateJexlToFormula` が変換できない式は元の文字列を保持し、FormulaLinter でエラー表示

### API Surface Parity

式評価に関わるインターフェース:
| インターフェース | 変更 |
|----------------|------|
| `ExpressionEngine.evaluate()` | `translateFormulaToJexl()` 呼び出し追加、インターフェース維持 |
| `ExpressionEngine.calculate()` | 同上 |
| `POST /api/v2/templates/{id}/evaluate` | リクエスト/レスポンス形式は変更なし |
| `POST /api/v2/templates/{id}/validate` | 同上 |
| `evaluateExpression()` (frontend) | 維持（`jexlEngine.ts` をそのまま使用）|

### Integration Test Scenarios

1. **ラウンドトリップ**: フロントで式を入力 → 保存 → JSON エクスポート → インポート → 式が復元される
2. **マイグレーション**: JEXL 形式テンプレートをインポート → 自動変換 → 新エンジンで評価 → 結果が JEXL 評価と一致
3. **フロント/サーバー一致**: フロントの `evaluator.ts` とサーバーの `FormulaEvaluator.java` が同じ式に対して同じ結果を返す
4. **循環依存**: ルール A → B → A の依存を作成 → フロントで即座に警告 → サーバーも 422
5. **セキュリティ**: `constructor`, `__proto__` を含む式 → フロントとサーバーの両方で拒否

## Acceptance Criteria

### Functional Requirements

- [x] ComputedFieldDialog で CodeMirror 6 数式エディタが動作する
- [x] CalculationTab のフォーカス中 RuleRow で CodeMirror 6 数式エディタが動作する
- [x] ValidationTab の condition 入力で CodeMirror 6 数式エディタが動作する
- [x] 10 個の組み込み関数がオートコンプリートで表示される（既存 JEXL 関数の UPPERCASE 版）
- [x] フィールド参照がカラーチップとして表示される
- [x] 関数の calltip（引数ヒント）が表示される
- [x] リアルタイムのリンティングでエラー/警告が波線表示される
- [x] FormulaStatusBar にバリデーション状態・推論型・プレビュー値・文字数が表示される
- [x] FieldTreePanel でフィールドと関数を挿入できる
- [x] FormulaToolbar で SUM/AVG/IF/ROUND をワンクリック挿入できる
- [ ] 循環依存がクライアント側でリアルタイム検出される *(dependencyGraph は移植済みだが linter への接続は未実装)*
- [x] JEXL 形式のテンプレートがトークンレベルで自動マイグレーションされる
- [x] サーバー側の式評価が翻訳レイヤー経由で formula-v1 式を処理できる
- [x] 解析エラーのある式は保存がブロックされる (SEC-04)

### Non-Functional Requirements

- [x] 式評価のタイムアウト: フロント・サーバーとも 500ms
- [x] 式の最大長: 500 文字
- [x] セキュリティサンドボックス: prototype 汚染防止
- [x] CodeMirror の遅延読み込み（`React.lazy`）でバンドルサイズ影響を最小化
- [x] 500 文字の式でもエディタの応答が 100ms 以内

### Quality Gates

- [x] Phase 1-3: フロントエンドテストカバレッジ 80%+ *(94 tests passing)*
- [ ] サーバー側翻訳レイヤーのテストカバレッジ 80%+ *(Java テスト未追加)*
- [x] 既存の `jexlEngine.test.ts` の全テストケースが引き続き通る
- [ ] 既存の `ExpressionEngineTest.java` が翻訳レイヤー経由で通る *(要確認)*
- [x] ビルドが通る（`npm run build` + `npm run build:backend`）
- [ ] Storybook で FormulaEditor の動作を確認可能 *(Story 未作成)*

## Success Metrics

- 3 箇所（ComputedFieldDialog, CalculationTab, ValidationTab）で CodeMirror 数式エディタが動作
- 数式入力中のエラー検出率: 構文エラーの 100%、セマンティックエラーの 90%+
- 10 関数の UPPERCASE 版がフロント・サーバーで同一結果を返す
- 既存テンプレートの JEXL 式がトークンレベルで自動マイグレーションされる
- CM6 バンドルが初期ロードに含まれない（lazy chunk として分離）

## Dependencies & Prerequisites

| 依存 | 内容 | ブロック |
|------|------|---------|
| v1 ソースコード | `/Users/PC-0079-Fukatsu/work/report-design-studio/` へのアクセス | Phase 1-3 |
| `unplugin-lezer` | Lezer 文法の Vite 統合 | Phase 1 |
| `calculationRules` DB 監査 | 51+ ルールのテンプレートが存在しないことの確認 | Phase 1 (Zod max 変更前) |

## Risk Analysis & Mitigation

| リスク | 影響 | 対策 |
|--------|------|------|
| v1 コードの移植性 | スタイリング・状態管理の差異で予想外の工数 | v1 の 14 ファイルは ~90% コピー可能。CSS + import 変更のみ |
| v1 コードの race condition | 2 critical + 3 high の race が v1 に潜在 | 移植時に RI-6 の修正を適用（polling 廃止、linter dispatch 修正等） |
| マイグレーションの網羅性 | 変換できない JEXL 式の存在 | 100% 変換成功時のみ `formula-v1` タグ設定。失敗時は `jexl` 維持（サーバーは JEXL 評価） |
| バンドルサイズ増加 | CodeMirror 6 ~180-200 KB gzipped | `manualChunks` + `React.lazy` で遅延読み込み。初期ロードに影響なし |
| セキュリティ | prototype pollution、深度制限なし | SEC-01〜SEC-08 の対策を Phase 1-3 で順次実装 |
| CalculationTab パフォーマンス | 50 CM6 同時インスタンス | フォーカス時のみ CM6 化。他はスタティック表示 |

## Documentation Plan

- `CLAUDE.md` の「Schema binding」セクションを新数式言語に更新
- `CLAUDE.md` に FormulaEditor コンポーネントの使い方を追記
- 10 関数のリファレンス（`formulaMetadata.ts` が情報源、段階的に 42 へ拡張）

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-17-visual-formula-editor-brainstorm.md](docs/brainstorms/2026-04-17-visual-formula-editor-brainstorm.md)
  - Key decisions: 数式言語を v1 に統一、ComputedFieldDialog + CalculationTab + ValidationTab の全対応
  - **研究による変更**: ANTLR → JEXL 翻訳レイヤー、42 関数 → 10 関数で開始、VisualExpression AST 除去

### Internal References

- v1 数式エディタ: `/Users/PC-0079-Fukatsu/work/report-design-studio/app/src/components/pages/BindingEditorPage/internals/formula/`
- v1 式評価パイプライン: `/Users/PC-0079-Fukatsu/work/report-design-studio/app/src/components/pages/BindingEditorPage/expression/`
- v1 関数カタログ: `/Users/PC-0079-Fukatsu/work/report-design-studio/app/src/components/pages/BindingEditorPage/computedFunctions.ts`
- v2 ComputedFieldDialog: `src/components/bindingEditor/internals/ComputedFieldDialog.tsx`
- v2 CalculationTab: `src/components/modals/CalculationTab.tsx`
- v2 jexlEngine: `src/lib/jexlEngine.ts`
- v2 ExpressionEngine: `server/src/main/java/com/report/server/ExpressionEngine.java`
- v2 migration: `src/lib/migration.ts`

### Institutional Learnings

- セキュリティ: 500ms タイムアウト + 500 文字制限 + prototype 汚染防止を維持（`docs/solutions/security-issues/`）
- データバインディング: 名前ベースマッチングを使用、ポジショナルインデックス不可（`docs/solutions/integration-issues/scalardb-column-ordering-positional-binding-mismatch.md`）
- モーダル状態: Zustand に保持（useState はモーダル unmount でリセットされる）
- React 再レンダリング最適化: `React.memo`, `useShallow`, デバウンスされた更新（`docs/solutions/performance-issues/react-canvas-rerender-optimization.md`）
- Store バッチ更新: Set 変換 before immer Proxy、atomic selection actions（`docs/solutions/performance-issues/zustand-store-batch-updates-and-state-leak-fixes.md`）

### External References (from deepening research)

- [CodeMirror 6 System Guide](https://codemirror.net/docs/guide/)
- [Lezer Setup](https://lezer.codemirror.net/examples/setup/)
- [unplugin-lezer](https://www.npmjs.com/package/unplugin-lezer)
- [CM6 Tooltip overflow issue #1262](https://github.com/codemirror/dev/issues/1262)
- [CM6 IME cursor issue #8810](https://discuss.codemirror.net/t/issue-with-google-japanese-ime-cursor-position-in-v6/8810)

---

## Appendix A: Lezer 文法（v1 からコピー、変更不要）

```lezer
@top Formula { expression }

@precedence {
  unary,
  times @left,
  plus @left,
  compare @left,
  and @left,
  or @left
}

expression {
  Number | String | Boolean | FunctionCall | FieldRef |
  ParenExpr | UnaryExpr | BinaryExpr | CompareExpr | LogicalExpr
}

ParenExpr { "(" expression ")" }
UnaryExpr { !unary (kw<"NOT"> | "-") expression }
BinaryExpr {
  expression !times ("*" | "/") expression |
  expression !plus ("+" | "-") expression
}
CompareExpr { expression !compare CompareOp expression }
LogicalExpr {
  expression !and kw<"AND"> expression |
  expression !or kw<"OR"> expression
}

FunctionCall { FunctionName "(" ArgList? ")" }
ArgList { expression ("," expression)* }
FunctionName { Identifier }
FieldRef { Identifier ("." Identifier | ArrayAccess "." Identifier)* }
ArrayAccess { "[" "]" }

kw<term> { @specialize[@name={term}]<Identifier, term> }

@tokens {
  Number   { $[0-9]+ ("." $[0-9]+)? }
  String   { "'" (!['\\\n] | "\\" _)* "'" }
  @precedence { Boolean, Identifier }
  Boolean  { ("true" | "false" | "TRUE" | "FALSE") }
  Identifier { $[a-zA-Z] $[a-zA-Z0-9_]* }
  CompareOp { "!=" | ">=" | "<=" | "=" | ">" | "<" }
  space    { $[ \t]+ }
  "(" ")" "[" "]" "," "." "*" "/" "+" "-"
}

@skip { space }
```

## Appendix B: マイグレーション変換の追加エッジケース

| JEXL 構文 | formula-v1 変換 | 備考 |
|-----------|-----------------|------|
| `"string"` (二重引用符) | `'string'` (単一引用符) | v1 は単一引用符のみサポート |
| `x == y` (二重等号) | `x = y` (単一等号) | v1 の CompareOp は `=` |
| `x ? a : b` (三項演算子) | 変換不可 → `IF(x, a, b)` を提案 | 警告 + 手動修正必要 |
| `value\|transform` (パイプ) | 変換不可 | v2 でも未使用 |
| `avg(rows, "price")` (2引数) | 変換不可 | `AVG(rows[].price)` への手動変換を提案 |
| `formatNumber(v)` (引数なし) | `TEXT(v, '#,##0')` | デフォルトパターン注入 |
| `formatNumber(v, "decimal2")` | `TEXT(v, '#,##0.00')` | 名前付きパターンの変換 |
| `formatNumber(v, "currency")` | `TEXT(v, 'currency')` + 警告 | 手動レビュー必要 |
| `formatDate(d)` (フォーマットなし) | `FORMAT_DATE(d, 'yyyy/MM/dd')` | デフォルト注入 |

## Appendix C: セキュリティ実装チェックリスト

| ID | 実装場所 | コード変更 | テスト |
|----|----------|-----------|--------|
| SEC-01 | `jexlEngine.ts` | `sanitizeContext()` — `Object.create(null)` でプロトタイプチェーンを遮断 | `__proto__` を context に注入 → 影響なし |
| SEC-01 | `reportDefinition.ts` | `SchemaField.key` に `.refine()` で `__proto__`/`constructor`/`prototype` を禁止 | Zod parse が拒否 |
| SEC-02 | `jexlEngine.ts` | `countComplexity()` — 演算子/関数呼び出しトークン数 ≤ 50 | 51 個の `+` → エラー |
| SEC-03 | `jexlEngine.ts` | `JEXL_FORBIDDEN` regex 拡張 — `globalThis`/`window`/`eval`/`_` prefix 追加 | `globalThis.process` → エラー |
| SEC-05 | `jexlEngine.ts` | `_inflightEvals` カウンタ — 同時評価 ≤ 10 | 11 番目の呼び出し → エラー |
| SEC-07 | `evaluator.ts` (移植時) | `POWER(x, n)` — `abs(n) > 1000` → null | `POWER(2, 9999)` → null |

## Appendix D: CM6 プラグイン race condition 修正

### Race #1: FormulaStatusBar polling → updateListener に置換

```ts
// BEFORE (v1): 500ms polling
useEffect(() => {
  const interval = setInterval(syncState, 500);
  return () => clearInterval(interval);
}, [syncState]);

// AFTER (v2): updateListener callback
// useFormulaEditor に onValidationChange callback を追加
EditorView.updateListener.of((update) => {
  if (update.transactions.some(tr =>
    tr.effects.some(e => e.is(setValidation))
  )) {
    onValidationChange?.(update.state.field(formulaValidationField));
  }
})
```

### Race #2: Linter 内 dispatch → queueMicrotask に遅延

```ts
// BEFORE (v1): lint コールバック内で同期 dispatch
view.dispatch({ effects: setValidation.of(state) });
return diagnostics;

// AFTER (v2): deferred dispatch
queueMicrotask(() => {
  if (!viewRef.current) return; // destroy guard
  view.dispatch({ effects: setValidation.of(state) });
});
return diagnostics;
```

### Race #4: tooltipParent を Compartment で管理

```ts
// useFormulaEditor.ts
const tooltipCompartment = useRef(new Compartment());

// baseExtensions 内:
tooltipCompartment.current.of(tooltips({ parent: document.body }))

// 別の useEffect で動的更新:
useEffect(() => {
  if (!viewRef.current || !options.tooltipParent) return;
  viewRef.current.dispatch({
    effects: tooltipCompartment.current.reconfigure(
      tooltips({ parent: options.tooltipParent })
    ),
  });
}, [options.tooltipParent]);
```

### Race #5: CalculationTab linter cascade 防止

```ts
// CalculationTab.tsx — peerRuleKeys のみを依存に
const peerRuleKeys = useMemo(
  () => calculationRules.filter(r => r.id !== rule.id).map(r => r.key),
  [calculationRules, rule.id]
);
// RuleRow の dynamicExtensions は peerRuleKeys が変わったときのみ再構成
```

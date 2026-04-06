# Brainstorm: サイドバー整理・DataBindingモーダル・テンプレート選択改善

**Date:** 2026-04-06  
**Status:** Ready for planning

---

## What We're Building

左サイドバーの「テンプレート」「データ」タブを削除し、それぞれをより適切なUI位置・形式に移動する。

1. **データ** → ツールバーの「データ」ボタン → DataBinding モーダル（V1機能を統合）
2. **テンプレート** → 新規作成時のモーダル選択 + 右サイドバー「ページ」タブから変更可能
3. **右サイドバー** → 「ページ」タブを追加（用紙サイズ・向き・テンプレート変更・余白）

---

## Why This Approach

- テンプレートとデータ設定はレポート全体の「設定」であり、要素やレイヤーのようなオブジェクト操作と性格が異なる
- テンプレートは作成時に選ぶのが自然。後から変更は稀なのでページ設定に格納
- データ設定は随時参照・編集したいが常時表示する必要はない → ツールバーボタン + モーダルが最適
- V1の全DataBinding機能（式評価・バリデーション・計算フィールド・条件レンダリング）を一箇所に集約

---

## Key Decisions

### 1. 左サイドバーの変更

**削除するタブ:** `テンプレート`、`データ`  
**残るタブ:** 要素、レイヤー、ページ  

左サイドバーは「エディタ内で頻繁に使うオブジェクト操作系」のみに絞る。

### 2. DataBinding モーダル

**開き方:** ツールバーに「データ」ボタンを追加（undo/redo の隣）

**モーダルのタブ構成:**

| タブ | 内容 | V1対応 |
|------|------|--------|
| データソース | JSON/フォームでデータ定義（現DataSourcePanel）＋プレビューデータ編集（現BindingPanel） | DataSource |
| 式・計算 | フィールドに対するJEXL式定義（sum/count/round等）、計算フィールドの定義 | ExpressionEngine + CalculationEngine |
| バリデーション | フィールド制約（必須・型・範囲）とテンプレートルール（条件付き必須等） | ValidationEngine |

**条件表示（表示/非表示条件式）はプロパティパネルへ：**  
要素ごとの設定のため、DataBindingモーダルではなく右サイドバーのプロパティパネルに「表示条件」フィールドとして追加する。V2に既存の `visibilityRule: string` を活用し、JEXL式（例: `{{amount}} > 0`）をテキスト入力で設定できる。

**モーダルサイズ:** 大型（画面の70-80%幅）、ドラッグ不可の固定中央モーダル

### 3. テンプレート選択（新規作成時）

**トリガー:** ツールバーの「新規作成」ボタン

**現状の動作:** `store.newReport()` を即実行（確認ダイアログなし）  
**変更後:** テンプレート選択モーダルを表示してから `loadReport()` を実行

**モーダル内容:**
- グリッド表示のテンプレート一覧（サムネイル付き）
- 「空白」オプションも含む（一番左）
- バックエンド接続時はバックエンドテンプレートも表示
- 選択 → 「作成」ボタンで確定（`historyIndex > 0` の場合は上書き確認）

### 4. 右サイドバー「ページ」タブ（ページ設定）

**右サイドバータブ構成:** プロパティ | バージョン | **ページ**

**「ページ」タブの内容:**
- 用紙サイズ（A4, A3, Letter, カスタム等）
- 向き（縦/横）
- 余白（上下左右 mm 指定）
- テンプレート変更（「変更...」ボタン → テンプレート選択モーダルを再利用）

これは**レポート全体設定**（ページごとではなく report-level）。

**テンプレート変更時の挙動:** 既存の要素・ページ構成は**クリアされ**、選択したテンプレートの初期状態に置き換わる。変更前に確認ダイアログを表示する（`historyIndex > 0` の場合）。

---

## Scope / Out of Scope

### In Scope
- 左サイドバーから「テンプレート」「データ」タブ削除
- ツールバーに「データ」ボタン追加
- DataBinding モーダル（4タブ）の実装
- 新規作成モーダル（テンプレート選択ダイアログ）
- 右サイドバーに「ページ」タブ追加（用紙サイズ・向き・余白・テンプレート変更）
- V1機能: 式評価（JEXL互換）、バリデーション、計算フィールド
- プロパティパネルに「表示条件」フィールド追加（条件レンダリング）

### Out of Scope
- CSV データソース（V1にはあるがV2では対応しない）
- Projection システム（V1固有のバックエンド機能）
- サーバーサイドバリデーション（V2はクライアントサイドのみ）

---

## Implementation Notes

### V1 → V2 移植マッピング

| V1 コンポーネント | V2 実装方針 | 備考 |
|---|---|---|
| ExpressionEngine (JEXL) | `@pawel-up/jexl` npm パッケージ + カスタム関数登録 | `addFunction` でV1と同じ `sum(items,'field')` 構文 |
| CalculationEngine | TypeScript で Kahn's トポロジカルソート実装 | **V2 store に既存**（`addCalculationRule` 等アクション済み） |
| ValidationEngine | クライアントサイド TypeScript で実装 | `validationRules` フィールドはあるが **untyped**、型定義が必要 |
| ConditionEvaluator | 構造化条件（JEXL不使用）で TypeScript 実装 | V2 要素に `visibilityRule: string` あり（方針確認が必要） |

### V2 ストアの既存対応状況（調査済み）

**すでに存在するもの:**
- `definition.calculationRules[]` + `addCalculationRule / updateCalculationRule / removeCalculationRule` アクション
- `ComputedSlice` に `computedValues`, `computedErrors`, `computedViolations` 状態フィールド
- `visibilityRule: string` フィールドが各要素に存在

**追加・修正が必要なもの:**
- `validationRules` の型定義（現在は `unknown[]`）
- 各要素への `fieldConstraint?: FieldConstraint` 追加（FieldConstraint型の定義が必要）
- 条件表示の UI（後述の方針選択に依存）

### 重要な実装ポイント

- **jexl パッケージ:** `@pawel-up/jexl` を使用（TypeScript first、`addFunction` サポート）。ビルトインタイムアウトなし → `Promise.race` で 500ms ラップ
- カスタム関数: `sum(items, 'field')`, `count(items)`, `round(value, scale)` を登録
- バリデーションは **エクスポート時** に実行（リアルタイム不要）。violations を UI に表示してエクスポートをブロック
- **マイグレーション不要** — `.passthrough()` で後方互換性あり
- テンプレート選択モーダルは新規作成・ページ設定の両方から呼び出せる共通コンポーネント

### DataBinding モーダルのタブと担当データ

| タブ | 読み書きするストア値 | 備考 |
|---|---|---|
| データソース | `definition.dataSources[0]` + `definition.testData` | 既存 DataSourcePanel + BindingPanel を移植 |
| 式・計算 | `definition.calculationRules[]` | ストアに既存のアクションを使用 |
| バリデーション | `definition.validationRules[]` | テンプレートレベルのルールのみ（要素単位のFieldConstraintは対象外） |

### バリデーションタブのルール構造

```typescript
// 追加する型定義
interface ValidationRule {
  id: string;
  condition: string;     // JEXL式（trueのとき違反）
  message: string;
  severity: 'error' | 'warning';
}
```

- エクスポート前に全ルールを評価し、error severity の違反があればエクスポートをブロック
- warning はエクスポート可能だがUI上で警告表示

### 表示条件（プロパティパネル）

- `visibilityRule: string`（V2既存フィールド）をプロパティパネルに入力欄として公開
- JEXL式（例: `amount > 0`、`status == 'active'`）を入力
- ライブプレビューでリアルタイム反映（評価結果で要素を show/hide）

---

## Resolved Questions

- **Q: DataBindingのスコープ?** → 式評価・バリデーション・計算フィールド（条件レンダリングはプロパティパネルへ分離）
- **Q: データモーダルの開き方?** → ツールバーボタン
- **Q: 新規作成UIの形式?** → モーダルダイアログ
- **Q: ページ設定の配置?** → 右サイドバーに「ページ」タブ追加
- **Q: 条件表示の配置?** → DataBindingモーダルではなく、プロパティパネルに「表示条件」フィールドとして配置
- **Q: テンプレート変更時の挙動?** → 既存要素をクリアして置き換え（確認ダイアログあり）

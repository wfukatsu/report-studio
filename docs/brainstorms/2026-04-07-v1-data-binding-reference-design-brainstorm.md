---
date: 2026-04-07
topic: v1-data-binding-reference-design
---

# V1 データバインディング → V2 設計参考

## 背景・目的

V1（report-design-studio）はデータバインディング機能を本格実装している。
V2（report-design-studio-v2）はSPA完結の軽量アーキテクチャで、基礎的なバインディング（`{{token}}`補間、JEXL計算/バリデーション、繰り返し要素）は実装済みだが、以下の機能が未実装：

- **スキーマエディタ**（フィールド定義・グループ管理）
- **バインディングエディタUI**（要素↔フィールドの視覚的マッピング）
- **条件表示の構造化エディタ**（AND/ORロジック。現在はJEXL自由記述のみ）
- **出力バリアント**（対象者別PDF、要素表示切替、マスキング）

V2の設計参考としてV1の実装を調査し、V2アーキテクチャに最適な形を再設計する。

---

## 選択したアプローチ: V2流の再設計

V1をそのまま移植するのではなく、V2のアーキテクチャ（Vite+React SPA / Zustand+Immer / バックエンドなし）に合わせた再設計を行う。

**基本方針:**
- 既存の `{{token}}` 補間システム・`resolveField()` は壊さない
- スキーマ・バリアントは **オプションの上位レイヤー** として追加
- V1のJavaサーバーロジックはTypeScriptで再実装（SPA内完結）
- YAGNI: V1の全機能ではなく、V2に本当に必要なものだけ取り込む

---

## 各機能の設計方針

### 1. スキーマエディタ

**V1の設計:**
- `SchemaGroup[]` — master/detail/print_queue ロール
- `SchemaField` 判別共用体（regular / computed）
- `ComputedExpression` — formula文字列 + VisualExpression AST

**V2向け再設計:**
- `ReportDefinition` に `schema?: SchemaDefinition` を追加（オプション）
- スキーマなしでも既存の flat key-value は引き続き動作
- グループは master / detail のみ（print_queueはV2では不要）
- 計算フィールドはV2の既存 `CalculationRule` と統合（重複させない）
- VisualExpression ASTは複雑すぎるため初期スコープ外（JEXL文字列のみ）

**決定事項:**
- グループ構造: `master`（単票）/ `detail`（明細行・array型コンテナ）の2種
- フィールド型: `string` / `number` / `date` / `boolean` / `array` / `image`
- 計算フィールドは不要（既存の `CalculationRule` で代替）
- UI配置: 左サイドバーの「スキーマ」タブ（レイヤー・ページと並列）

**追加するstore状態:**
```typescript
// src/types/index.ts に追加
type SchemaFieldType = 'string' | 'number' | 'date' | 'boolean' | 'array' | 'image'

interface SchemaField {
  id: string
  key: string           // バインディングで使うキー（例: "customer_name"）
  label: string         // 表示名
  type: SchemaFieldType
  // arrayの場合は子フィールドをネスト（1段階のみ）
  itemType?: SchemaFieldType
}

interface SchemaGroup {
  id: string
  label: string
  role: 'master' | 'detail'
  fields: SchemaField[]
}

interface SchemaDefinition {
  groups: SchemaGroup[]
}
```

**UI (`src/components/sidebar/SchemaPanel.tsx`):**
- 左サイドバーに「スキーマ」タブを追加
- グループ切替（master / detail）
- フィールド一覧（追加 / 編集 / 削除）
- フィールド追加: key・label・type を入力するインラインフォーム
- スキーマ定義がなくても既存の flat key-value は引き続き動作

---

### 2. バインディングエディタUI

**V1の設計:**
- 3カラム（要素群 | スキーマフィールド | DB設定）
- SVG接続線でビジュアルマッピング
- ドラッグ接続、一括生成

**V2向け再設計（プロパティパネル内・最小限）:**
- SVG接続線・3カラムエディタは初期スコープ外
- **プロパティパネル内にドロップダウン追加**のみ
- 候補ソース: スキーマ定義のフィールド一覧（グループ名付き）
- オートコンプリート: `{{` 入力時とfieldKey入力欄でも補完を表示（全体一貫）

```
右パネル（プロパティパネル）
┌──────────────────────────┐
│ テキストプロパティ              │
│                          │
│ データフィールド:               │
│ [ customer_name        ▼ ]│
│   (masterグループ · string)   │
│                          │
│ コンテンツ:                   │
│ [こんにちは {{cus|           ]│
│           ↓ オートコンプリート    │
│   customer_name (master)  │
│   customer_id (master)    │
└──────────────────────────┘
```

**実装ポイント:**
- `src/components/sidebar/PropertiesPanel.tsx` の fieldKey 入力欄を Combobox に変更
- `src/hooks/useSchemaFieldOptions.ts` — スキーマ定義からフィールド候補を生成するフック
- `{{token}}` 補完: TipTap の `@` メンション拡張パターンで `{{` をトリガーとして実装
- スキーマ定義がない場合は自由入力にフォールバック（既存動作を維持）

既存の `DataSourcePanel` と `BindingPanel` は残す。フル3カラムエディタはPhase 2以降に検討。

---

### 3. 条件表示（AND/OR構造エディタ）

**V1の設計:**
- `ConditionalDisplay { conditions[], logic: 'and'|'or' }`
- `DisplayCondition { fieldPath, operator, value? }`
- 10種の演算子（equals, not_equals, contains, empty, 数値比較など）

**V2現在の状態:**
- `visibilityRule?: string` — JEXL自由記述（例: `"data.status == 'active'"`）

**V2向け再設計（構造化エディタのみ）:**
- UIは常に構造化AND/ORエディタ（JEXL自由記述入力欄は廃止）
- 内部的には `ConditionalDisplay` 型で保存し、実行時にJEXL評価する
- 既存の `visibilityRule: string` プロパティは削除し `conditionalDisplay` に置き換え
- 採用演算子: V1全10種 (`equals`, `not_equals`, `greater_than`, `less_than`, `contains`, `not_contains`, `empty`, `not_empty`)

```typescript
// src/types/index.ts に追加・変更
type ConditionOperator =
  | 'equals' | 'not_equals'
  | 'greater_than' | 'less_than'
  | 'contains' | 'not_contains'
  | 'empty' | 'not_empty'

interface DisplayCondition {
  id: string
  fieldPath: string         // スキーマ定義からオートコンプリート
  operator: ConditionOperator
  value?: string | number   // empty/not_emptyは不要
}

interface ConditionalDisplay {
  logic: 'and' | 'or'
  conditions: DisplayCondition[]
}

// ElementBase の変更（src/types/index.ts）
// Before: visibilityRule?: string
// After:  conditionalDisplay?: ConditionalDisplay
```

**評価ロジック (`src/lib/conditionEvaluator.ts`):**
- V1の `conditionEvaluator.ts` を参考にTypeScriptで実装
- `evaluateConditionalDisplay(cd, data, rowIndex?): boolean`
- `empty`: null / undefined / '' → true
- 数値比較: `Number()` 変換後に比較
- AND: 全条件true、OR: 1件以上true

**UI (`src/components/sidebar/PropertiesPanel.tsx` 内):**
```
表示条件:
[ AND ▼] [条件追加 +]

┌─────────────────────────────────┐
│ [status ▼] [等しい ▼] [active   ] │  ✕
│ [amount ▼] [> ▼]     [1000     ] │  ✕
└─────────────────────────────────┘
```
- fieldPath はスキーマ定義がある場合フィールドCombobox、ない場合テキスト入力

---

### 4. 出力バリアント

**V1の設計:**
- `FlatOutputVariant { variantId, variantName, targetAudience, visibilityOverrides, maskingRules[] }`
- `FlatMaskingRule` — hidden / fullReplace / partial（keepFirst/keepLast）

**V2向け再設計:**
- 新規: `variantsSlice.ts` — Zustandスライス
- エクスポート時にバリアント選択ダイアログを追加
- 要素プロパティパネルに「このバリアントで非表示」チェックボックス

```typescript
// src/types/index.ts に追加
interface MaskingRule {
  id: string
  targetElementId: string
  type: 'hidden' | 'fullReplace' | 'partial'
  replaceValue?: string       // fullReplace用
  keepFirst?: number          // partial用
  keepLast?: number           // partial用
}

interface OutputVariant {
  id: string
  name: string
  targetAudience?: string
  hiddenElementIds: string[]
  maskingRules: MaskingRule[]
}
```

**初期スコープ（全3機能）:**
1. **要素の表示/非表示切替** — バリアントごとに `hiddenElementIds` を管理
2. **マスキングルール** — hidden / fullReplace / partial（keepFirst/keepLast）
3. **PDF エクスポート時バリアント選択** — エクスポートダイアログでバリアントを選択

**管理UI配置:** ツールバーに「バリアント」ボタン → モーダルダイアログ
- バリアント一覧（作成/削除）
- バリアント選択後: 要素のプロパティパネルに「このバリアントで非表示」チェックボックスを追加

**PDF エクスポートダイアログの変更:**
```
PDFエクスポート
┌──────────────────────────┐
│ 対象バリアント:               │
│ ○ なし（全要素表示）         │
│ ○ 顧客用                   │
│ ○ 社内用                   │
│ [キャンセル] [エクスポート]    │
└──────────────────────────┘
```

**store追加 (`src/store/variantsSlice.ts`):**
```typescript
interface VariantsState {
  variants: OutputVariant[]
  addVariant: (name: string) => void
  removeVariant: (id: string) => void
  updateVariant: (id: string, patch: Partial<OutputVariant>) => void
}
```

---

## 実装優先順位（参考）

| 優先度 | 機能 | 工数目安 | 理由 |
|--------|------|---------|------|
| P1 | 条件表示 AND/ORエディタ | 小 | 型定義が明確、V2に最も近い |
| P2 | スキーマエディタ | 中 | 基盤機能、バインディングUIの前提 |
| P3 | バインディングエディタUI | 中 | スキーマエディタ後に実装 |
| P4 | 出力バリアント | 中 | 独立機能として追加可能 |

---

## 主要決定事項

- **SPA完結**: V1のJavaバックエンドは使わず、全ロジックをTypeScriptで再実装
- **オプション上位レイヤー**: スキーマなしのケースも引き続きサポート
- **段階的追加**: 条件表示エディタ → スキーマ → バインディングUI → バリアントの順
- **visibilityRule維持**: 構造化エディタはJEXLへの変換レイヤーとして実装
- **接続線UI省略（初期）**: バインディングエディタのSVG接続線はスコープ外

---

## 解決済み質問

1. **スキーマエディタの配置**: 左サイドバーに「スキーマ」タブを追加（レイヤー・ページと並列）
2. **出力バリアントのプレビュー切替**: 初期スコープ外。エクスポート時のバリアント選択ダイアログのみ実装
3. **V1互換性**: 不要。V2独自形式で設計を優先する

---

## 次のステップ

→ `/workflows:plan` で各機能の実装計画を作成

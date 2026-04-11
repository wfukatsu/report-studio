---
title: データバインディング Phase 3 — Computed Fields + Visual Mapper
type: feat
status: active
date: 2026-04-12
origin: docs/brainstorms/2026-04-10-schema-database-binding-brainstorm.md
---

# データバインディング Phase 3 — Computed Fields + Visual Mapper

## Overview

Phase 3 は 2 つの独立したがシナジーのある機能で構成される。

1. **Visual Mapper（BindingMapper）**: スキーマフィールド ↔ レポート要素の接続を視覚的なクリック UI で行う。Phase 2 で実装した `setElementSchemaBinding` ストアアクションへの唯一のユーザーインターフェース。
2. **Computed Schema Fields（計算フィールド）**: `SchemaField` にオプションの `expression` を追加し、DB 取得後に JEXL 式でフィールド値を計算する。SUM/COUNT/IF/CONCAT などの集計関数をサポート。

**Deliverable**:
- スキーマフィールドとレポート要素をクリック操作で接続できる
- スキーマ内に計算フィールドを定義し、プレビュー時に計算結果が表示される

---

## Problem Statement

### Visual Mapper が必要な理由

Phase 2 で `element.schemaBinding?.fieldId` の型定義とストアアクション (`setElementSchemaBinding`) が実装されたが、**設定する UI が存在しない**。デザイナーはスキーマフィールドと要素を接続する手段を持たない。`DataBindingOverviewPanel` のマッピングセクションは現状（`{{fieldKey}}` トークン）のみを表示し、`schemaBinding` ベースのバインドを設定する機能はない。

### Computed Fields が必要な理由

ScalarDB から取得したデータをそのまま表示するだけでなく、派生値（合計、税込金額、書式化された日付など）も帳票に表示したい。現在の `CalculationRule` はテンプレート全体の計算ルールだが、スキーマグループレベルの計算フィールドは存在しない。

---

## Proposed Solution

### Step 1: Visual Mapper（BindingMapper）— 優先度高

`DataBindingModal.tsx` に 5 番目のタブ「**バインドマッパー**」を追加する。

**インタラクション: クリック接続方式（Phase 3）**

ドラッグ & ドロップではなく、**ステップ式クリック接続**を採用する。

```
1. 左パネルのスキーマフィールドをクリック → 選択状態（ハイライト）
2. 右パネルのレポート要素をクリック → 接続確定 (setElementSchemaBinding 呼び出し)
3. 接続済みは色付きバッジと接続アイコンで表示
4. 接続をクリックして再クリック → 解除 (setElementSchemaBinding(pageId, elId, undefined))
```

ドラッグ接続（SVG ライン描画）は **Phase 4 以降**に延期。Phase 3 はクリック UI でデリバーし、ユーザーが早期にフィードバックを提供できるようにする（see brainstorm: docs/brainstorms/2026-04-10-schema-database-binding-brainstorm.md — §4 Visual Mapper）。

#### BindingMapper コンポーネント構成

```
DataBindingModal.tsx
└── BindingMapperTab.tsx (新規)
    ├── FieldList（左パネル）— スキーマグループ別にフィールドを一覧
    │   └── FieldChip per SchemaField
    │       - 選択状態管理
    │       - 現在の接続先要素名を表示
    └── ElementList（右パネル）— ページ別・セクション別に要素を一覧
        └── ElementRow per bindable element
            - 現在の接続フィールド名を表示（あれば）
            - クリックで接続 / 解除
```

#### 実装ファイル

```
src/components/modals/BindingMapperTab.tsx       (新規)
src/components/modals/BindingMapperTab.test.tsx  (新規)
```

#### 状態設計（コンポーネントローカル）

```typescript
// BindingMapperTab.tsx
const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
// selectedField があり、要素をクリック → setElementSchemaBinding(pageId, elId, selectedFieldId)
// 同じフィールドを再クリック → setSelectedFieldId(null)（選択解除）
```

#### BindingMapper のデータフロー

```
useReportStore(s => s.definition.schema)
  ↓ schema.groups[].fields → FieldList
  
useReportStore(s => s.definition.pages)  
  → flattenPageElements() → bindable element types のみフィルタ
  ↓ → ElementList
  
setElementSchemaBinding(pageId, elementId, fieldId)
  ↓ 既存ストアアクション（Phase 2 実装済み）
```

#### バインド可能な要素タイプ

`dataField`, `text`（`{{token}}` スタイルの schemaBinding 拡張）, `checkbox`, `eraSelect` — `useBindingAnalysis` と同じ判定ルールを使用。

---

### Step 2: Computed Schema Fields

#### 型拡張（see brainstorm §3 Computed Fields）

```typescript
// src/types/index.ts — SchemaField への追加
export interface SchemaField {
  id: string
  key: string
  label: string
  type: SchemaFieldType
  itemType?: SchemaFieldType
  dbColumnName?: string
  // Phase 3 追加: computed field
  computed?: true              // 存在する場合は計算フィールド
  expression?: string          // JEXL 式（例: "price * qty * 1.1"）
  // computed フィールドは dbColumnName を持たない（DB カラムでない）
}
```

**設計判断**: `ComputedField` として別型を作らず `SchemaField` に `computed?` フラグを追加する。
理由: `SchemaPanel` などの既存 UI が `SchemaField[]` を統一的に扱っており、
別型にするとコンポーネント全体に判定を追加する必要がある。
`computed?: true` フラグで区別するパターンは既存の `locked?: boolean`, `visible?: boolean` と一貫する。

#### UI: SchemaPanel 拡張

`src/components/sidebar/SchemaPanel.tsx` の `FieldRow` に計算フィールド切り替えボタンを追加:

```typescript
// src/components/sidebar/SchemaPanel.tsx — FieldRow 内
<button onClick={() => toggleComputedField(field.id)}>
  {field.computed ? '計算' : 'DB'}
</button>
{field.computed && (
  <input
    type="text"
    placeholder="例: price * qty * 1.1"
    value={field.expression ?? ''}
    onChange={(e) => updateSchemaField(groupId, field.id, { expression: e.target.value })}
  />
)}
```

#### バックエンド: computed フィールド評価

`V2BindingResolveController.java` の `resolveGroup()` に computed field 評価を追加:

```java
// resolve-bindings の resolveGroup() 内 — DB カラム解決後に追加
// computed フィールドを JEXL で評価
for (JsonNode field : fieldsNode) {
    if (!field.path("computed").asBoolean(false)) continue;
    String expression = field.path("expression").asText(null);
    if (expression == null || expression.isBlank()) continue;
    String fieldKey = field.path("key").asText(null);
    if (fieldKey == null) continue;
    
    // 現在の行データをコンテキストとして渡す
    Map<String, Object> rowContext = buildRowContext(groupData);
    try {
        Object result = ExpressionEngine.calculate(expression, toJsonNode(rowContext));
        putComputedValue(groupData, fieldKey, result);
    } catch (Exception e) {
        log.warn("Computed field evaluation failed: field={} expr={}", fieldKey, sanitize(expression));
        // エラーは null として処理を継続（エラーで全体を止めない）
        groupData.putNull(fieldKey);
    }
}
```

#### 関数ライブラリ拡張（`JexlFunctions.java`）

ブレインストームが指定した初期関数セット（see brainstorm §3）:

| 関数 | 説明 | 例 |
|------|------|-----|
| `sum(collection, field)` | 既存 | `sum(items, 'qty')` |
| `count(collection)` | 既存 | `count(items)` |
| `round(value, scale)` | 既存 | `round(total, 2)` |
| `avg(collection, field)` | **新規** | `avg(items, 'score')` |
| `min(collection, field)` | **新規** | `min(items, 'price')` |
| `max(collection, field)` | **新規** | `max(items, 'price')` |
| `concat(str1, str2, ...)` | **新規** | `concat(firstName, ' ', lastName)` |
| `formatDate(date, pattern)` | **新規** | `formatDate(birth, 'yyyy/MM/dd')` |
| `formatNumber(num, pattern)` | **新規** | `formatNumber(price, '#,##0')` |
| `ifExpr(cond, then, else)` | **新規** (`if` は JEXL 予約語のため別名) | `ifExpr(score >= 60, '合格', '不合格')` |

**注意**: JEXL の `if` は制御構文のため `ifExpr` という関数名を使用する。

フロントエンドの `src/lib/jexlEngine.ts` にも同じ関数セットを追加し、
`SchemaPanel` での式入力時にブラウザ側テスト評価ができるようにする。

---

## Technical Approach

### Architecture

```
Step 1: Visual Mapper
  DataBindingModal.tsx     +1 tab 'バインドマッパー'
  BindingMapperTab.tsx     新規コンポーネント（FieldList + ElementList）
  setElementSchemaBinding  既存ストアアクション（Phase 2）

Step 2: Computed Fields
  src/types/index.ts       SchemaField.computed? + SchemaField.expression?
  SchemaPanel.tsx          FieldRow に computed 切り替え UI
  JexlFunctions.java       avg/min/max/concat/formatDate/formatNumber/ifExpr 追加
  jexlEngine.ts            同関数をフロントにも追加
  V2BindingResolveController.java  resolveGroup/resolveDetailGroup に computed 評価追加
```

### 実装フェーズ

#### Phase 3A: Visual Mapper

**ファイル**:
- `src/components/modals/BindingMapperTab.tsx` — 新規
- `src/components/modals/DataBindingModal.tsx` — タブ追加

**テスト先行**:
```
src/components/modals/BindingMapperTab.test.tsx — フィールド選択・要素クリック接続・解除テスト
```

#### Phase 3B: Computed Fields（型 + UI）

**ファイル**:
- `src/types/index.ts` — `SchemaField.computed?`, `SchemaField.expression?` 追加
- `src/components/sidebar/SchemaPanel.tsx` — `FieldRow` に computed 切り替え + 式入力
- `src/lib/jexlEngine.ts` — avg/min/max/concat/formatDate/formatNumber/ifExpr 追加

**テスト先行**:
```
src/lib/jexlEngine.test.ts — 新規関数のテスト追加
```

#### Phase 3C: Computed Fields（バックエンド）

**ファイル**:
- `server/.../JexlFunctions.java` — 同関数セット追加
- `server/.../V2BindingResolveController.java` — `resolveGroup()` / `resolveDetailGroup()` に computed 評価追加

**テスト先行**:
```
server/.../V2BindingResolveControllerTest.java — computed field 評価テスト追加
```

---

## Alternative Approaches Considered

### Visual Mapper: ドラッグ接続 vs クリック接続

| アプローチ | Phase 3 採用理由 |
|-----------|----------------|
| **クリック接続（採用）** | 実装が単純、スクリーンリーダー対応しやすい、ユーザーフィードバック早期取得 |
| ドラッグ接続 + SVG ライン | ブレインストームの最終形だが実装複雑（Phase 4 以降） |

### Computed Fields: SchemaField 拡張 vs 別型 ComputedField

| アプローチ | Phase 3 採用理由 |
|-----------|----------------|
| **SchemaField.computed? 拡張（採用）** | 既存 UI・コンポーネントへの影響最小。discriminated union にする場合は型ガードが必要でコードが増える |
| 別型 ComputedField | ブレインストームの理想形だが既存の SchemaPanel/FieldRow を全て更新する必要がある |

---

## System-Wide Impact

### Interaction Graph

**Visual Mapper**:
フィールドクリック → `setSelectedFieldId(fieldId)` → 要素クリック → `setElementSchemaBinding(pageId, elId, fieldId)` → immer `set()` → `element.schemaBinding.fieldId` 更新 → `useBindingAnalysis()` フィンガープリント変化 → `DataBindingOverviewPanel` の「マッピング」セクション更新

**Computed Fields**:
式入力 → `updateSchemaField(groupId, fieldId, { expression })` → `definition.schema` 更新 → `setLivePreviewData(null)` → プレビュー更新ボタン押下 → `resolveBindings()` → backend `ExpressionEngine.calculate(expression, rowContext)` → computed 結果が `resolved[groupId][fieldKey]` に格納 → `livePreviewData` 更新 → キャンバス再レンダリング

### Error Propagation

- Computed field 評価エラー: 該当フィールドを `null` として継続（全体の resolve-bindings を止めない）
- 循環参照: JEXL は制御構文なし（`createExpression` のみ）のため循環は発生しない
- 無効な式: `ExpressionEngine` が例外をキャッチし、バックエンドがログを記録して `null` を返す

### State Lifecycle Risks

- `element.schemaBinding` の参照整合性: Phase 2 で実装済み（`removeSchemaField` が cascade cleanup）
- `SchemaField.expression` が削除されたフィールドを参照: 表現式は自グループのフィールドのみ参照可能にする（バリデーションをUIで追加）

### API Surface Parity

- Visual Mapper で設定した `schemaBinding` は `PUT /api/v2/templates/{id}` で保存（既存）
- Computed fields は `SchemaField.expression` として同じく `PUT` で保存（既存）
- resolve-bindings エンドポイントが computed fields を自動評価（バックエンド拡張）

### Integration Test Scenarios

1. スキーマフィールドを Visual Mapper で要素に接続 → `livePreviewData` に正しい値が入り要素に表示される
2. Computed field (`price * qty * 1.1`) が DB 取得後に正しく評価され `livePreviewData` に格納される
3. 評価エラーのある computed field は `null` で保存されるが他フィールドは正常表示される
4. フィールド削除後に Visual Mapper の接続が消える（`removeSchemaField` cascade 確認）
5. 同一 SchemaField に複数要素を接続できる（1:N バインド）

---

## Acceptance Criteria

### Phase 3A: Visual Mapper

- [ ] `DataBindingModal` に「バインドマッパー」タブが追加されている
- [ ] 左パネルにスキーマグループ別のフィールド一覧が表示される
- [ ] 右パネルにページ別のバインド可能要素一覧が表示される
- [ ] フィールドをクリックして選択状態になる
- [ ] 選択状態のフィールドが要素クリックで接続される（`setElementSchemaBinding` 呼び出し）
- [ ] 接続済みフィールドと要素にバッジ/アイコンが表示される
- [ ] 接続を再クリックして解除できる
- [ ] 接続状態が `DataBindingOverviewPanel` の「マッピング」セクションに反映される

### Phase 3B: Computed Fields（フロントエンド）

- [ ] `SchemaField` に `computed?: true` と `expression?: string` フィールドが追加されている
- [ ] `SchemaPanel` の `FieldRow` に computed 切り替えボタンが表示される
- [ ] computed フィールドに JEXL 式入力フィールドが表示される
- [ ] フロントエンドの `jexlEngine.ts` が avg/min/max/concat/formatDate/formatNumber/ifExpr に対応している

### Phase 3C: Computed Fields（バックエンド）

- [ ] `JexlFunctions.java` に avg/min/max/concat/formatDate/formatNumber/ifExpr が追加されている
- [ ] `resolveGroup()` が computed フィールドを DB 取得後に評価する
- [ ] computed フィールドの評価エラーは null として処理を継続する（他フィールドを止めない）
- [ ] 評価結果が `resolved[groupId][fieldKey]` に含まれる

### 共通テスト要件

- [ ] BindingMapperTab: フィールド選択・要素接続・接続解除の UI テスト
- [ ] jexlEngine: 新規関数（avg/min/max/ifExpr 等）のユニットテスト
- [ ] V2BindingResolveController: computed field 評価のテスト（正常・エラー・null 継続）

---

## Dependencies & Risks

| リスク | 対策 |
|--------|------|
| Visual Mapper で複数ページの要素が多すぎてスクロールが辛い | ページフィルタドロップダウンを追加して絞り込み |
| JEXL `if` は予約語なので `ifExpr` 関数を作る | フロントエンドとバックエンドで命名を統一 |
| computed field が他の computed field を参照する循環参照 | Phase 3 ではスコープを「DB フィールドのみ参照可能」に制限。自己・他 computed 参照は Phase 4 以降 |
| `formatDate` / `formatNumber` のロケール/パターン仕様 | Java `DateTimeFormatter` / `DecimalFormat` パターンを採用（既存の V1 と互換）|
| Phase 3B/3C は Phase 3A（Visual Mapper）に依存しない | 独立して実装可能。順番は 3A → 3B → 3C を推奨 |

---

## Sources & References

### Origin

- **Brainstorm document**: [docs/brainstorms/2026-04-10-schema-database-binding-brainstorm.md](../brainstorms/2026-04-10-schema-database-binding-brainstorm.md)
  - Key decisions carried forward:
    - Visual Mapper はツールバーボタンからモーダルで開く（専用ルートなし）
    - Computed field は VisualExpression AST を主とするが Phase 3 はテキスト式を先行
    - 対応関数初期セット: SUM/COUNT/AVG/MIN/MAX/IF/CONCAT/FORMAT_DATE/FORMAT_NUMBER

### Internal References

- Phase 2 計画: [docs/plans/2026-04-12-feat-data-binding-phase2-element-binding-plan.md](./2026-04-12-feat-data-binding-phase2-element-binding-plan.md)
- Phase 2.5 計画: [docs/plans/2026-04-12-feat-data-binding-phase2-5-detail-group-scan-plan.md](./2026-04-12-feat-data-binding-phase2-5-detail-group-scan-plan.md)
- `setElementSchemaBinding` ストアアクション: `src/store/schemaSlice.ts:152` — Phase 2 実装済み（UI なし）
- `useBindingAnalysis()`: `src/hooks/useBindingAnalysis.ts` — フィンガープリント最適化済み、BindingMapper の接続状態表示に再利用
- `flattenPageElements()`: `src/store/selectors.ts:16` — 要素一覧取得に使用
- `ExpressionEngine.calculate()`: `server/.../ExpressionEngine.java` — 計算フィールド評価に使用
- `JexlFunctions.java`: `server/.../JexlFunctions.java` — 新関数の追加先
- `jexlEngine.ts`: `src/lib/jexlEngine.ts` — フロントエンド JEXL（同関数追加が必要）
- `DataBindingModal.tsx`: `src/components/modals/DataBindingModal.tsx:9-16` — タブ追加場所

### Future Considerations

- **Phase 4**: ドラッグ接続 + SVG 接続ライン（BindingMapper の最終形）
- **Phase 4**: Visual AST エディタ（ノードベース式ビルダー）
- **Phase 4**: Computed field が他の computed field を参照（評価トポロジー）

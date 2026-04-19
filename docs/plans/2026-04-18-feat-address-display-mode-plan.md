---
title: "feat: 住所表示モード切り替え（1行/3行）"
type: feat
status: active
date: 2026-04-18
origin: docs/brainstorms/2026-04-18-address-display-mode-brainstorm.md
---

# feat: 住所表示モード切り替え（1行/3行）

## Overview

tenantAddress 要素に `displayMode: 'single' | 'multiLine'` プロパティを追加し、住所の1行表示と3行表示を切り替え可能にする。TenantInfo に `address1`/`address2` フィールドを追加し、共通フォーマッター関数を `_blocks/` に配置してデータバインディングからも利用できるようにする。

## Problem Statement / Motivation

現在の tenantAddress 要素は `〒{postalCode} {address}` の1行表示のみ。日本のビジネス文書では、住所を郵便番号・都道府県市区町村・番地建物名の3行に分けて表示するのが一般的。また、住所データを都道府県レベルと番地レベルに分けて管理するニーズがある。

## Proposed Solution

既存の `tenantAddress` 要素を拡張するアプローチ（see brainstorm: docs/brainstorms/2026-04-18-address-display-mode-brainstorm.md）。`manualEntry` の `displayMode` パターンに沿い、コードベースの一貫性を保つ。

### 表示モード

| モード | フォーマット | 出力例 |
|--------|-------------|--------|
| `single`（デフォルト） | `〒{postalCode} {address1}{address2}` | `〒100-0001 東京都千代田区千代田1-1-1` |
| `multiLine` | 改行区切り | `〒100-0001`<br>`東京都千代田区千代田`<br>`1-1-1` |

## Technical Considerations

### 型定義の変更（`src/types/index.ts`）

```typescript
// TenantInfo に追加
export interface TenantInfo {
  companyName?: string
  postalCode?: string
  address?: string        // 後方互換のため残す（読み取り専用扱い）
  address1?: string       // 新規: 都道府県・市区町村
  address2?: string       // 新規: 番地・建物名
  phone?: string
  // ... 既存フィールド
}

// TenantAddressElement に displayMode を追加
export type AddressDisplayMode = 'single' | 'multiLine'

export interface TenantAddressElement extends ElementBase {
  type: 'tenantAddress'
  style: TextStyle
  fallback?: string
  displayMode?: AddressDisplayMode  // デフォルト: 'single'
}
```

### 共通フォーマッター（`src/elements/_blocks/formatAddress.ts` 新規）

```typescript
interface AddressFields {
  postalCode?: string
  address1?: string
  address2?: string
  address?: string  // 後方互換フォールバック
}

export function formatAddress(
  fields: AddressFields,
  mode: AddressDisplayMode = 'single'
): string
```

- `address1` が未定義で `address` がある場合 → `address` を `address1` として扱う（後方互換）
- `multiLine` モードで `address2` が空の場合 → 空行を省略し2行表示
- `postalCode` が未定義の場合 → `〒` プレフィックスを省略

### 後方互換・移行戦略

- **フロントエンド側の自動フォールバック**: `address1` が未定義の場合、`address` を `address1` として使用
- **保存時の同期**: テナント設定で `address1`/`address2` を保存する際、`address = address1 + address2` も自動計算して保存（旧テンプレートとの互換性）
- **バックエンド**: `address1`/`address2` をそのまま JSON として保存（ScalarDB JsonBlobRepository はスキーマレスなので DB マイグレーション不要）
- **既存テンプレート**: `displayMode` 未定義は `'single'` として動作（現在の挙動を維持）

### データバインディングでの住所フォーマット

dataField / repeatingBand フィールドで住所フォーマットを使う場合の設計:

- `CalculationFormat` の `type` に `'address_single' | 'address_multiline'` を追加
- **操作フロー**: ユーザーは `fieldKey` に `customer.address1` のようにグループ内の住所フィールドを指定し、FormatSection で「住所（1行）」or「住所（3行）」を選択
- **自動取得ロジック**: `applyFormat()` がアドレスフォーマットを検出した場合、`fieldKey` のグループプレフィックス（例: `customer`）を抽出し、同グループの `.postalCode`, `.address1`, `.address2` を `data` オブジェクトから自動取得して `formatAddress()` に渡す
- `applyFormat()` のシグネチャ拡張: アドレスフォーマット用にオプショナルな `data` コンテキストと `fieldKey` を受け取れるようにする
- 値が文字列で住所フォーマット以外の場合はそのまま返す（既存の互換性維持）

### 要素の高さに関する考慮

- `multiLine` モード時のデフォルト高さ: `15mm`（3行 × 3mm フォント + 余白）
- `single` モード時のデフォルト高さ: `6mm`（現在と同じ）
- **モード切り替え時の自動リサイズは行わない**（ユーザーが手動で調整。他の要素と同じ挙動）
- ファクトリーでのデフォルト値は `displayMode` に応じて切り替える

### 編集モード（resolveValues=false）の表示

- `single` / `multiLine` 両方で `{{住所}}` を表示（現在と同じ）
- モードの違いはプロパティパネルで確認する

## System-Wide Impact

- **Interaction graph**: tenantAddress Renderer → useReportStore(tenantInfo) → formatAddress() → DOM
- **Error propagation**: formatAddress() は例外を投げない（空文字列をフォールバックとして返す）
- **State lifecycle risks**: TenantInfo の `address`/`address1`/`address2` の同期は保存時のみ。部分更新でも整合性を維持
- **API surface parity**: TenantSettings.tsx と TenantInfoTab.tsx の両方を更新。共通の入力コンポーネントを抽出して重複を防ぐ
- **Integration test scenarios**: (1) 旧データ（address のみ）での表示 (2) モード切り替え時のプレビュー更新 (3) エクスポートでの multiLine レンダリング

## Acceptance Criteria

### Phase 1: tenantAddress 要素の拡張

- [x] `TenantInfo` に `address1`, `address2` フィールドが追加されている（`src/types/index.ts`）
- [x] `TenantAddressElement` に `displayMode?: AddressDisplayMode` が追加されている
- [x] `formatAddress()` 共通関数が `src/elements/_blocks/formatAddress.ts` に作成されている
- [x] `TenantAddressRenderer` が `displayMode` に応じて1行/3行で表示する
- [x] プロパティパネルに表示モード切り替え（SelectInput）が追加されている
- [x] テナント設定画面（TenantSettings.tsx, TenantInfoTab.tsx）で住所1・住所2を個別入力できる
- [x] 既存の `address` フィールドのみのデータでも正しく表示される（後方互換）
- [x] 保存時に `address = address1 + address2` が自動計算される
- [x] ファクトリーの `createTenantAddressElement()` にデフォルト `displayMode: 'single'` が設定されている
- [x] `multiLine` 時に `address2` が空の場合、空行が省略される

### Phase 2: データバインディング対応（同時実装）

- [x] `CalculationFormat` に `'address_single' | 'address_multiline'` タイプが追加されている
- [x] `FormatSection` のドロップダウンに「住所（1行）」「住所（3行）」が表示される
- [x] `applyFormat()` がアドレスフォーマット時にオブジェクト値を処理できる
- [x] dataField / repeatingBand のフィールドで住所フォーマットが適用できる

### テスト

- [x] `formatAddress()` の単体テスト（全パターン: 全フィールド有、address2 空、address のみ、全空）
- [ ] TenantAddressRenderer のテスト（single/multiLine 各モード）
- [ ] 後方互換テスト（displayMode 未定義での表示）
- [ ] FormatSection に住所オプションが表示されるテスト

## Dependencies & Risks

| リスク | 対策 |
|--------|------|
| 既存テナントデータの移行漏れ | フロントエンドでの自動フォールバック（address → address1） |
| バックエンド PDF レンダリングとの不整合 | バックエンド更新は別イシューとして追跡。フロントエンドプレビューを先行 |
| address1/address2 の分割粒度が不適切 | ラベルを「都道府県・市区町村」「番地・建物名」として明確化 |
| FormatSection でのマルチフィールド解決 | applyFormat にオブジェクト値対応を追加。値が文字列なら従来通り処理 |

## Implementation Order

1. **型定義**: `TenantInfo`, `TenantAddressElement`, `AddressDisplayMode`, `CalculationFormat` の更新
2. **共通フォーマッター**: `formatAddress()` 関数 + テスト
3. **Renderer 更新**: `TenantAddressRenderer` が `formatAddress()` を使用
4. **PropertiesPanel 更新**: `displayMode` セレクター追加
5. **ファクトリー更新**: `createTenantAddressElement()` にデフォルト displayMode
6. **テナント設定 UI**: `TenantSettings.tsx` と `TenantInfoTab.tsx` に address1/address2 フィールド
7. **API スキーマ**: `reportApi.ts` の Zod スキーマに `address1`, `address2` 追加
8. **FormatSection + applyFormat**: 住所フォーマットタイプの追加
9. **テスト**: 全コンポーネントのテスト

## Key Files to Modify

| ファイル | 変更内容 |
|---------|---------|
| `src/types/index.ts` | TenantInfo, TenantAddressElement, AddressDisplayMode, CalculationFormat |
| `src/elements/_blocks/formatAddress.ts` | **新規**: 共通フォーマッター関数 |
| `src/elements/_blocks/formatAddress.test.ts` | **新規**: フォーマッターテスト |
| `src/elements/tenantAddress/Renderer.tsx` | formatAddress() 使用、displayMode 対応 |
| `src/elements/tenantAddress/PropertiesPanel.tsx` | displayMode セレクター追加 |
| `src/lib/elementFactories.ts` | createTenantAddressElement に displayMode デフォルト |
| `src/components/admin/TenantSettings.tsx` | address1/address2 フィールド分割 |
| `src/components/modals/TenantInfoTab.tsx` | address1/address2 フィールド分割 |
| `src/api/reportApi.ts` | Zod スキーマに address1, address2 追加 |
| `src/elements/_blocks/panels/FormatSection.tsx` | 住所フォーマットオプション追加 |
| `src/lib/numberFormatter.ts` | applyFormat に住所フォーマット処理追加 |

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-04-18-address-display-mode-brainstorm.md](docs/brainstorms/2026-04-18-address-display-mode-brainstorm.md) — 3フィールド構成、displayMode 切り替え、FormatSection 統合を決定
- **manualEntry displayMode パターン:** `src/elements/manualEntry/Renderer.tsx`, `src/elements/manualEntry/PropertiesPanel.tsx`
- **テナント要素の先行実装:** [docs/plans/2026-04-12-feat-tenant-info-elements-plan.md](docs/plans/2026-04-12-feat-tenant-info-elements-plan.md)
- **FormatSection:** `src/elements/_blocks/panels/FormatSection.tsx`
- **useDataResolver:** `src/elements/_blocks/hooks/useDataResolver.ts`

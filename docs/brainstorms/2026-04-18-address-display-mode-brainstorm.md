# 住所表示モード切り替え機能

**Date:** 2026-04-18
**Status:** Brainstorm complete

## What We're Building

tenantAddress 要素に「1行表示」と「3行表示」の2つの表示モードを追加する。
また、データバインディングでも住所フォーマットを利用できるよう共通フォーマッターを提供する。

### 表示モード

| モード | フォーマット | 例 |
|--------|-------------|-----|
| **1行（single）** | `〒{postalCode} {address1}{address2}` | `〒100-0001 東京都千代田区千代田 1-1-1` |
| **3行（multiLine）** | 各フィールドを改行で区切る | `〒100-0001`<br>`東京都千代田区千代田`<br>`1-1-1` |

## Why This Approach

既存の `tenantAddress` 要素を拡張するアプローチを選択。理由:

- `manualEntry` の `displayMode` パターンに沿っており、コードベースの一貫性を保てる
- TenantInfo のデータ構造変更は最小限（`address` → `address1` + `address2` の追加）
- 共通フォーマッターを `_blocks/` に配置することで、データバインディングからも再利用可能
- 新しい要素タイプを追加するより実装規模が小さい

## Key Decisions

1. **データ構造**: `TenantInfo` に `address1`, `address2` フィールドを追加（既存 `address` は後方互換のため残す）
2. **表示モード切り替え**: 要素ごとにプロパティパネルで `displayMode: 'single' | 'multiLine'` を選択
3. **1行フォーマット**: `〒{postalCode} {address1}{address2}`（郵便番号プレフィックス付き）
4. **3行フォーマット**: `〒{postalCode}` / `{address1}` / `{address2}` の改行区切り
5. **共通フォーマッター**: `_blocks/` に `formatAddress()` 関数を配置し、tenantAddress とデータバインディング両方で使用
6. **対象範囲**: tenantAddress 要素 + データバインディング住所フィールド
7. **データバインディング側**: 既存の FormatSection（書式設定パネル）に「住所（1行）」「住所（3行）」フォーマットを追加。dataField や repeatingBand のフィールドで住所書式を選択すると、バインドされた postalCode/address1/address2 を共通フォーマッターで整形して表示する

## Scope

### In Scope
- TenantInfo に address1, address2 フィールド追加
- TenantAddressElement に displayMode プロパティ追加
- プロパティパネルに表示モード切り替えUI
- 共通アドレスフォーマッター関数（`_blocks/` に配置）
- テナント設定画面の住所入力欄を3フィールドに分割
- 既存 address フィールドからの移行ロジック（`address` → `address1` にコピー）
- FormatSection に住所フォーマット（1行/3行）を追加し、dataField・repeatingBand で利用可能にする

### Out of Scope
- 住所検索・自動補完（将来検討）
- 国際住所フォーマット対応

## Open Questions

None — all questions resolved during brainstorming.

## Resolved Questions

全質問はブレインストーミング対話中に解決済み。決定内容は Key Decisions セクションを参照。

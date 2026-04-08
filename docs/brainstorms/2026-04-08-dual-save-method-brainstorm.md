---
date: 2026-04-08
topic: dual-save-method
---

# テンプレート保存の二重対応 — サーバー保存 + ファイルダウンロード

## What We're Building

「保存」ボタンにドロップダウンメニューを追加し、
**サーバーに保存**と **JSON ファイルとしてダウンロード**の2つの保存方法を提供する。

ボタン本体クリック → デフォルト動作（サーバー保存）。
▼ メニュー → 「サーバーに保存」「JSON ファイルとしてダウンロード」の2項目。

**ユーザーフロー:**
1. 「保存」ボタン本体クリック → サーバー保存（現在の `handleSave` 動作）
2. 「保存」ボタン横の ▼ をクリック → ドロップダウンメニュー表示
   - 「サーバーに保存」→ 上記と同じ動作
   - 「JSON ファイルとしてダウンロード」→ JSON blob を生成し、`reportName.rds.json` としてダウンロード

## Why This Approach

既に `handleSave`（サーバー保存）と旧 JSON ダウンロード機能の両方のコードが存在する。
ドロップダウンにまとめることで:
- ツールバースペースを増やさない（ボタン1つ分）
- デフォルト動作は最も使用頻度の高いサーバー保存
- ファイルダウンロードも常にアクセス可能（バックアップ・他環境への移行用）

ズーム操作の ▼ メニュー（`ZoomControl.tsx`）と同じ UI パターンを踏襲。

## Key Decisions

- **UI パターン**: SplitButton（ボタン本体 + ▼ドロップダウン）。ツールバー内の ZoomControl と同一パターン。
- **デフォルト動作**: ボタン本体クリック = サーバー保存（`handleSave` 既存実装）
- **ファイルダウンロード**: 旧 `handleSave` の JSON blob 生成コードを `handleDownloadJson` として分離
- **メニュー項目**: 「サーバーに保存」「JSON ファイルとしてダウンロード」の2つ
- **キーボードショートカット**: Ctrl+S / ⌘+S = サーバー保存（デフォルト）

## Resolved Questions

- UI 方式 → ドロップダウンメニュー ✅
- デフォルト動作 → サーバー保存 ✅
- ファイルフォーマット → JSON (`.rds.json`) ✅

## Open Questions

なし。

## Scope

**変更ファイル:**
- `src/components/toolbar/Toolbar.tsx` — 保存ボタンを SplitButton 化、`handleDownloadJson` 関数追加

**新規ファイル: なし**

## Next Steps

→ `/workflows:plan` で実装計画を作成する。

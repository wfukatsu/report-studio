---
date: 2026-04-08
topic: page-elements-migration
---

# Page.elements 廃止 — PageDef への統一

## What We're Building

`Page` 型（旧来の legacy 型）が持つ `elements: ReportElement[]` フィールドを廃止し、
すべてのコードを `PageDef` に統一する。

具体的には:
1. `Page` 型の `elements` フィールドを削除（または `Page` 型自体を `PageDef` に置き換え）
2. `page.elements` を参照しているテンプレートを `sections[].elements` 形式に修正
3. CLAUDE.md に「要素は必ず section 内に格納する」規約を追記

## Why This Approach

**深い修正（型定義の整理）を選んだ理由:**

- レンダラー・ストア操作はすでに `section.elements` のみを参照。`Page.elements` は
  実質デッドコードであり、テンプレート作者を混乱させる「罠」になっている。
- `simple-report` テンプレートは `page.elements` に要素を定義しているが画面に表示されない
  サイレントバグが存在する。型定義を整理しないと同じ罠が繰り返される。
- 破棄的変更は許容（開発環境のみで使用）。自動マイグレーション層は不要。

## Key Decisions

- **`Page` 型の `elements` フィールドを削除**。`Page` 自体は `sections` を持つため
  `PageDef` と実質同型になる。残す場合は `@deprecated` を付与し次フェーズで削除。
- **全テンプレートを修正**: `page.elements` の内容を `sections[0].elements` に移動。
  対象ファイル:
  - `src/templates/builtinTemplates.ts` — blank, simple-report など全ページ定義
  - `src/templates/fuyouKojoTemplate.ts` — `page.elements` と `section.elements` が同一参照
- **自動マイグレーションなし**: 既存 localStorage データは破棄でよい（開発フェーズ）。
- **CLAUDE.md 更新**: "要素は `Page.sections[].elements` に格納する。`Page.elements` は使用禁止" を明記。
- **`flattenPageElements` はそのまま**: すでに `section.elements` のみを読んでいるため変更不要。

## Resolved Questions

- **スコープ**: 型定義も含めた深い修正を行う ✅
- **既存データ**: 破棄的変更でよい（開発環境のみ）✅

## Open Questions

なし — 実装方針は確定。

## Next Steps

→ `/workflows:plan` で実装計画を作成

---
date: 2026-04-08
topic: manualentry-none-mode
---

# ManualEntry displayMode:'none' — テストカバレッジ補完

## What We're Building

`ManualEntryRenderer` の `displayMode: 'none'` に対するユニットテストを追加する。
コード変更は不要 — 実装は既に正しく動作している。

## Why This Approach

調査の結果、`displayMode: 'none'` は ElementRenderer でフォールバックとして動作していることを確認:

- `borderBottom` / `border` 条件が `false` になるため枠線なし
- SVG グリッドも描画されない
- `minHeight: 4mm` で最低高さは確保される
- `placeholder` は引き続き表示される

`fuyouKojoTemplate.ts` の input ヘルパー (`line 94`) がデフォルトで `displayMode: 'none'` を使用しており、実際に機能している。

ISSUE-02 の懸念（「入力欄が非表示になる可能性」）は、確認の結果、現状では発現していない。

**テストのみを選んだ理由:**
- コード変更は不要（動作は正しい）
- テストが存在しないため、将来のリファクタリング時に意図しない回帰が起きる可能性がある
- カバレッジ補完として最小コスト

## Key Decisions

- **コード変更なし**: Renderer.tsx は変更しない
- **テスト追加のみ**: `src/elements/manualEntry/Renderer.test.tsx` に 1 ケース追加
- **検証内容**: `displayMode: 'none'` のとき border 系スタイルが付かないこと、要素が存在すること

## Resolved Questions

- **実装変更が必要か**: 不要。フォールバック動作が仕様通り ✅
- **PropertiesPanel の UI 変更は必要か**: 不要。ドロップダウンに 'none' は既に存在する ✅

## Open Questions

なし — 方針確定。

## Next Steps

→ 直接実装可能（テスト 1 ケースの追加のみ）。`/workflows:plan` は不要。

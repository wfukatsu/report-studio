---
title: "fix: ヘッダー/フッター残存 P2/P3 ポリッシュ 4件"
type: fix
status: completed
date: 2026-04-09
---

# fix: ヘッダー/フッター残存 P2/P3 ポリッシュ 4件

前回の HF-01〜HF-08 修正後のレビューで発見した残存課題。

## Acceptance Criteria

- [ ] **HF-R01**: フッター作成時にキャンバスがフッター位置まで自動スクロール
  - `src/components/toolbar/Toolbar.tsx` の `handleToggleMasterFooter` 内で、フッター作成後にキャンバスのスクロールコンテナを `scrollTo({ top: scrollHeight, behavior: 'smooth' })` で最下部へ移動
- [ ] **HF-R02**: ページ設定パネルの高さ入力ラベルを動的に変更
  - `src/components/sidebar/PageSettingsPanel.tsx`: ラベルを `ヘッダー/フッター高さ (mm)` 固定 → `masterHeader && masterFooter` なら「ヘッダー/フッター高さ」、ヘッダーのみなら「ヘッダー高さ」、フッターのみなら「フッター高さ」
- [ ] **HF-R03**: スキップ（影響が軽微すぎるため対応不要）
- [ ] **HF-R04**: ガイドテキストを簡潔化
  - `src/components/canvas/SectionContainer.tsx`: 「要素をドロップしてヘッダーを作成」→「ヘッダーに要素をドロップ」、フッターも同様

## Sources

- 先行プラン: `docs/plans/2026-04-09-fix-header-footer-ui-plan.md`
- SectionContainer: `src/components/canvas/SectionContainer.tsx`
- PageSettingsPanel: `src/components/sidebar/PageSettingsPanel.tsx`
- Toolbar: `src/components/toolbar/Toolbar.tsx`

---
status: pending
priority: p3
issue_id: "245"
tags: [code-review, ux, sidebar, metadata]
dependencies: []
---

# PageSettingsPanel: メタデータ折りたたみが未実装（リンターにより差し戻し）

## Problem Statement

「レポート用のメタデータは非表示・表示を切り替えられるようにしてください」という要求に対して実装したが、リンターにより `PageSettingsPanel.tsx` が元の状態に差し戻された。メタデータセクション（バージョン・帳票種別・説明・適用規制・有効期間）の折りたたみ機能が実装されていない状態に戻っている。

## Findings

現状の `PageSettingsPanel.tsx`:
- `useState`/`ChevronDown`/`ChevronRight` の import がない
- `metaOpen` ステートがない
- カテゴリとタグのみが直接表示（折りたたみなし）
- `version`, `reportType`, `description`, `applicableRegulation`, `effectiveFrom`, `effectiveTo` は編集不可

## Proposed Solutions

### Option A: 折りたたみ式メタデータセクションを再実装（推奨）

```tsx
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

export function PageSettingsPanel({ onTemplateChange }: PageSettingsPanelProps) {
  const [metaOpen, setMetaOpen] = useState(false)
  ...

  // 背景色のあとに:
  <div className="border rounded">
    <button
      onClick={() => setMetaOpen(v => !v)}
      aria-expanded={metaOpen}
      className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground"
    >
      {metaOpen ? <ChevronDown .../> : <ChevronRight .../>}
      メタデータ
    </button>
    {metaOpen && (
      <div className="px-2 pb-2 space-y-2 border-t pt-2">
        {/* version, reportType, description, applicableRegulation, effectiveFrom/To, category, tags */}
      </div>
    )}
  </div>
```

- Pros: ユーザー要求を満たす、全メタデータフィールド編集可能
- Cons: なし
- Effort: Small
- Risk: Low

## Acceptance Criteria

- [ ] ページ設定タブに「メタデータ」折りたたみセクションが存在する
- [ ] セクションはデフォルト折りたたみ（閉じた状態）
- [ ] version, reportType, description, applicableRegulation, effectiveFrom, effectiveTo, category, tags を編集できる
- [ ] `npm run build` 通過

## Work Log

- 2026-04-12: 実装後リンターにより差し戻し。再実装が必要

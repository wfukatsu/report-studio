---
status: pending
priority: p2
issue_id: "267"
tags: [code-review, architecture, typescript, type-safety]
dependencies: []
---

# PropertiesPanel.tsx が型網羅チェックなし — 新要素型追加時にサイレント漏れ

## Problem Statement

`ElementRenderer.tsx` は `switch` + `assertNever()` で全 element type の網羅をコンパイル時に保証しているが、`PropertiesPanel.tsx` は 26 個の `{el.type === 'x' && <Panel />}` 連鎖で、新しい element type を追加してもコンパイルエラーが出ない。プロパティパネルが空欄のまま気づかれない可能性がある。

## Findings

`src/components/sidebar/PropertiesPanel.tsx`:
```tsx
// 網羅チェックなし — 新 type 追加時に空欄になってもエラーなし
{el.type === 'text' && <TextPropertiesPanel ... />}
{el.type === 'shape' && <ShapePropertiesPanel ... />}
// ... 26 条件
// el.type が上記以外 → 何も表示されない（サイレント漏れ）
```

`src/components/canvas/ElementRenderer.tsx`:
```tsx
switch (element.type) {
  case 'text': return <TextRenderer ... />
  // ...
  default: assertNever(element) // ← コンパイルエラーで検出
}
```

## Proposed Solutions

### Solution A: switch 文 + assertNever() に変更

```tsx
switch (el.type) {
  case 'text': return <TextPropertiesPanel ... />
  case 'shape': return <ShapePropertiesPanel ... />
  // ...
  default: return assertNever(el)
}
```

- Effort: Small（リファクタリングのみ）
- Risk: Low

## Acceptance Criteria

- [ ] PropertiesPanel.tsx が switch + assertNever() を使用
- [ ] 新しい element type を追加した際にコンパイルエラーが出る

## Work Log

- 2026-04-13: pattern-recognition-specialist による code-review で発見

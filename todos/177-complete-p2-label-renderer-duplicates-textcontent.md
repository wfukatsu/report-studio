---
status: complete
priority: p2
issue_id: "177"
tags: [code-review, simplicity, refactor, label]
dependencies: []
---

# LabelRenderer duplicates TextContent logic — refactor is incomplete

## Problem Statement

`src/elements/label/Renderer.tsx` implements the same two-div flex+writing-mode pattern as `TextContent` without importing `TextContent`. The refactor to composition pattern missed this element, leaving the duplication it was meant to eliminate. Additionally, when `ElementRenderer` routes `label` through `TextRenderer → TextContent`, legacy labels render with different `lineHeight` and `userSelect` behavior than the original `LabelRenderer`.

## Findings

**File:** `src/elements/label/Renderer.tsx` — 49 lines of duplicated `TextContent` logic

`userSelect: 'none'` is present in `LabelRenderer` but absent from `TextContent`.

Confirmed by: Simplicity (P2), Architecture (MEDIUM).

## Proposed Solutions

### Option A: Replace LabelRenderer body with TextContent

```tsx
export function LabelRenderer({ element: el, data }: Props) {
  const text = interpolate(el.text, data)
  return (
    <div style={{ width: '100%', height: '100%', userSelect: 'none' }}>
      <TextContent text={text} style={el.style} />
    </div>
  )
}
```

Alternatively, add `userSelect?: React.CSSProperties['userSelect']` prop to `TextContent`.

**Effort:** Small | **Risk:** Low

## Acceptance Criteria

- [ ] `LabelRenderer` uses `TextContent` instead of reimplementing the layout
- [ ] `userSelect: 'none'` behavior preserved for canvas drag UX
- [ ] Label elements render identically before and after the change

## Work Log

- 2026-04-11: Flagged by Simplicity (P2). Incomplete refactor leaves duplication.

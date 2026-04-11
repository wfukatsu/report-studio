---
status: complete
priority: p2
issue_id: "219"
tags: [code-review, typescript, ux, data-binding]
dependencies: []
---

# formTable セルの `handleSelect` が合成 ID `${elId}_${cellId}` を渡す — `selectElement` が無言失敗

## Problem Statement

`useBindingAnalysis` が formTable セルの `elementId` を `${el.id}_${cell.id}` という合成 ID で生成している。
`handleSelect` はこの合成 ID をそのまま `selectElement(elementId)` に渡すが、
ストアに該当 ID を持つ要素は存在しないため、セル行をクリックしても何も選択されない。

## Findings

**File:** `src/hooks/useBindingAnalysis.ts:120-130`

```typescript
case 'formTable': {
  for (const row of el.rows) {
    for (const cell of row.cells) {
      if (cell.type === 'dataField') {
        const cellBase: Omit<ElementBinding, 'fieldKey'> = {
          elementId: `${el.id}_${cell.id}`,  // ← 合成ID、ストアに存在しない
          // ...
        }
      }
    }
  }
}
```

**File:** `src/components/sidebar/DataBindingOverviewPanel.tsx:114`

```typescript
function handleSelect(elementId: string, pageId: string) {
  setActivePage(pageId)
  selectElement(elementId)  // ← "${el.id}_${cell.id}" を渡す → ストアで一致なし
}
```

## Proposed Solutions

### Option A: formTable セルは親要素 ID で選択（推奨）

```typescript
case 'formTable': {
  for (const row of el.rows) {
    for (const cell of row.cells) {
      if (cell.type === 'dataField') {
        const cellBase: Omit<ElementBinding, 'fieldKey'> = {
          elementId: el.id,  // ← 親の formTable 要素 ID を使用
          elementLabel: `${labelFor(el)} > ${cell.label || cell.id}`,  // セル名を表示に含める
          pageId: page.id,
        }
      }
    }
  }
}
```

**Pros:** クリックで formTable 要素が選択される（機能する）
**Cons:** 同じ formTable の複数セルが同じ要素を指す（表示上は問題ない）
**Effort:** Small | **Risk:** Low

### Option B: formTable セルは選択不可にして視覚的に区別

```typescript
// onSelect を undefined にして non-interactive にする
<ElementRow key={...} binding={b} onSelect={b.elementId.includes('_') ? undefined : handleSelect} />
```

**Pros:** 誤った動作を排除
**Cons:** セルをクリックしても何も起きない — UX として不明確
**Effort:** Small | **Risk:** Low

## Recommended Action

**Option A** を採用。formTable のセルバインドは親要素の選択で十分。

## Technical Details

**Affected files:**
- `src/hooks/useBindingAnalysis.ts:120-130`
- `src/components/sidebar/DataBindingOverviewPanel.tsx` (変更不要)

## Acceptance Criteria

- [ ] formTable セル行をクリックすると、そのセルを含む formTable 要素が選択される
- [ ] `selectElement` がストアに存在する ID で呼ばれる
- [ ] テスト: formTable セル行クリック → `selectElement(el.id)` が呼ばれる

## Work Log

- 2026-04-12: Discovered by Architecture reviewer (P2) and TypeScript reviewer (P2)

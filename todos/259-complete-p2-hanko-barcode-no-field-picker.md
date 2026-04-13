---
status: pending
priority: p2
issue_id: "259"
tags: [code-review, ui-ux, data-binding, discoverability]
dependencies: []
---

# 判子・バーコード要素のバインディングフィールドに選択UIがない

## Problem Statement

`hanko` および `barcode` 要素のプロパティパネルでバインディングフィールドが自由入力テキストフィールドのみで提供されており、スキーマフィールドを選択するUIがない。`FieldKeyInput` コンポーネントが既に存在し、他の要素で使われているにもかかわらず、これらの要素では利用されていない。日本語ドキュメントデザイナーにとってドット記法（`approver.name`）を手動で入力するのは難易度が高い。

## Findings

- **既存コンポーネント:** `src/components/common/FieldKeyInput.tsx` — スキーマフィールドのドロップダウン選択UI
- **未使用:** `src/elements/hanko/PropertiesPanel.tsx:29` — `binding` フィールドが `<input placeholder="例: approver.name" />`
- **未使用:** `src/elements/barcode/PropertiesPanel.tsx` — 同様の自由入力フィールド

## Proposed Solutions

### Solution A: FieldKeyInput コンポーネントに差し替え（推奨）

```tsx
// 修正前
<PropRow label="バインディング">
  <input value={el.binding ?? ''} onChange={...} placeholder="例: approver.name" />
</PropRow>

// 修正後
<PropRow label="バインディング">
  <FieldKeyInput
    value={el.binding ?? ''}
    onChange={(key) => onChange({ binding: key })}
  />
</PropRow>
```

- Effort: Small（既存コンポーネントの流用）
- Risk: Low

## Acceptance Criteria

- [ ] 判子プロパティパネルで `FieldKeyInput` によるフィールド選択が使える
- [ ] バーコードプロパティパネルで `FieldKeyInput` によるフィールド選択が使える
- [ ] 自由入力も引き続き可能（FieldKeyInput がそれをサポートしている場合）
- [ ] スキーマ未定義の場合でも入力エラーにならない

## Work Log

- 2026-04-13: architecture-strategist による code-review で発見

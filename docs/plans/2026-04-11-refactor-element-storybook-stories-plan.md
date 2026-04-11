---
title: "refactor: 要素レベル Storybook ストーリー追加"
type: refactor
status: active
date: 2026-04-11
deepened: 2026-04-11
origin: docs/brainstorms/2026-04-05-atomic-design-component-breakdown-brainstorm.md
---

# refactor: 要素レベル Storybook ストーリー追加

## Enhancement Summary

**Deepened on:** 2026-04-11
**Research agents used:** Storybook+Zustand-best-practices, framework-docs-researcher, code-simplicity-reviewer, learnings-researcher

### Key Improvements

1. **`storyHelpers.ts` は不要** — `src/lib/elementFactories.ts` が既に `createTextElement` 等を提供。新規ファイルは不要
2. **Zustand + Storybook** — グローバル `beforeEach` でストア初期状態をリセットするパターンが必須（ストーリー間のステート汚染を防ぐ）
3. **`PropInputUnit<T>` ジェネリクスは不要** — 既存 `NumInput` / `ColorInput` / `SelectInput` に `inherited?: boolean` を追加するだけで十分
4. **要素ストーリーは `ElementRenderer.stories.tsx` に追加が最優先** — 既存ファイル（189 行）が既に多くの要素をカバー。欠けている要素を追加するのが最小コスト
5. **`TextRenderer` は Phase 1 完了後 store 依存** — `StoreSeeder` パターンが必要

### New Considerations Discovered

- Storybook 8.3+ の `beforeEach` は global / file / story レベルで動作。cleanup 関数を return するパターン
- Zustand `setState(state, true)` の第 2 引数 `true` は replace フラグ — これなしでは部分マージになり完全リセットにならない
- immer store では `useReportStore.setState` でも immer の `produce` は動かない — 直接オブジェクトを渡す
- `play` 関数内では `useReportStore.getState()` を同期的に呼べる（フック不要）

---

## 背景

`2026-04-05-atomic-design-component-breakdown-brainstorm.md` のうち、実用価値の高い範囲に絞る。

- `_blocks/` システムが既に Atoms/Molecules 相当を担っているため大規模 Atomic Design リファクタは YAGNI
- 未着手で価値が高い点：要素レベルの Storybook ストーリーが存在しない

---

## Problem Statement

**現状のストーリー:**
- `CanvasElement.stories.tsx`、`ElementRenderer.stories.tsx`、`ReportCanvas.stories.tsx` のみ
- 各要素の Renderer 単体（`text/`, `formTable/`, `repeatingBand/` 等）に `.stories.tsx` が一切ない
- Renderer を Storybook で単体確認・視覚的 QA できない

**現状の入力 Atom:**
- `src/elements/_base/sharedUI.tsx` に `NumInput`, `ColorInput`, `SelectInput` が存在するが継承状態非対応
- `TextElement 継承 UI` 計画で `inherited` 状態が必要

---

## Proposed Solution

### Phase 1: 要素ストーリー追加（P2）

不足している要素のストーリーを `ElementRenderer.stories.tsx` および個別ファイルに追加。

### Phase 2: `inherited` prop の追加（P3）

`NumInput` / `ColorInput` / `SelectInput` に `inherited?: boolean` と `onReset?: () => void` を追加。
`TextElement 継承 UI` 計画（`2026-04-11-feat-text-element-inline-editing-plan.md` Phase 3）の前提。

---

## Technical Approach

### Storybook + Zustand のリセットパターン

グローバルリセットを `preview.ts` の `beforeEach` に設定する。
第 2 引数 `true`（replace フラグ）が必須:

```ts
// .storybook/preview.ts
import type { Preview } from '@storybook/react'
import { useReportStore } from '@/store'

// モジュールロード時に初期状態をスナップショット（ストーリー実行前）
const INITIAL_STORE_STATE = useReportStore.getState()

const preview: Preview = {
  async beforeEach() {
    // replace=true で完全リセット（部分マージではない）
    useReportStore.setState(INITIAL_STORE_STATE, true)
  },
}

export default preview
```

ストーリー固有の状態は per-story `beforeEach` で設定:

```ts
export const WithDefaultFontSize8: Story = {
  async beforeEach() {
    useReportStore.setState({
      report: {
        ...useReportStore.getState().report,
        defaultTextStyle: { fontSize: 8 },
      },
    })
  },
}
```

### `TextRenderer` のストーリー（store 依存）

Phase 1 完了後、`TextRenderer` は `defaultStyle` prop を受け取る（store サブスクリプションを持たない）ため、ストーリーは純粋に props のみで動作する:

```tsx
// src/elements/text/Renderer.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { TextRenderer } from './Renderer'
import { createTextElement } from '@/lib/elementFactories'

const meta: Meta<typeof TextRenderer> = {
  title: 'Elements/Text/Renderer',
  component: TextRenderer,
  decorators: [
    (Story) => (
      <div style={{ width: 200, height: 60, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof TextRenderer>

export const Default: Story = {
  args: {
    element: createTextElement({ content: 'サンプルテキスト' }),
    defaultStyle: {},
    data: {},
  },
}

export const WithBinding: Story = {
  args: {
    element: createTextElement({ content: 'こんにちは、{{name}} さん' }),
    defaultStyle: {},
    data: { name: '山田太郎' },
  },
}

export const Bold: Story = {
  args: {
    element: createTextElement({ style: { fontWeight: 'bold', fontSize: 5 } }),
    defaultStyle: {},
    data: {},
  },
}

export const DefaultStyleInherited: Story = {
  args: {
    element: createTextElement({ style: {} }),          // style 空 = 全て継承
    defaultStyle: { fontSize: 8, color: '#0000ff' },   // 青い大きいフォント
    data: {},
  },
}

export const Vertical: Story = {
  args: {
    element: createTextElement({
      style: { writingMode: 'vertical-rl' },
      size: { width: 15, height: 60 },
    }),
    defaultStyle: {},
    data: {},
  },
}
```

### `ElementRenderer.stories.tsx` への追加

既存ファイル（`src/components/canvas/ElementRenderer.stories.tsx`）に欠けている要素のストーリーを追加:

```tsx
// 追加ストーリー例（formTable, repeatingBand, barcode, checkbox, manualEntry 等）
export const FormTable: Story = {
  args: {
    element: createFormTableElement({ /* ... */ }) as ReportElement,
  },
}
```

個別ファイル（`Renderer.stories.tsx`）が必要になるのは、要素固有のデコレーターやストア状態が必要な場合のみ。

### elementFactories.ts の活用

`src/lib/elementFactories.ts` が既に `createTextElement`, `createShapeElement` 等を提供。
`storyHelpers.ts` は不要（YAGNI）。

```ts
// NG — 不要なラッパー
// src/elements/_base/storyHelpers.ts

// OK — 直接インポート
import { createTextElement, createShapeElement } from '@/lib/elementFactories'
```

### `play` 関数でのストア状態アサーション

```ts
import { expect } from '@storybook/test'
import { useReportStore } from '@/store'

export const SelectElement: Story = {
  play: async ({ canvas, userEvent }) => {
    const el = canvas.getByRole('button')
    await userEvent.click(el)

    // フック不要、同期的に getState() を呼べる
    const { selection } = useReportStore.getState()
    await expect(selection.selectedElementIds).toContain('el-1')
  },
}
```

---

## Phase 2: inherited prop の追加

`src/elements/_base/sharedUI.tsx` の既存コンポーネントへの最小限の変更:

```tsx
// NumInput（現状の Props に追加）
interface NumInputProps {
  // ... 既存 props
  inherited?: boolean     // true → グレー背景・破線ボーダー・✕ なし
  onReset?: () => void   // 渡された場合のみ ✕ ボタンを表示
}

export function NumInput({ value, onChange, inherited, onReset, ...rest }: NumInputProps) {
  return (
    <div className="flex items-center gap-1 group relative">
      <input
        className={cn(
          'border rounded px-2 py-1 text-xs w-full',
          inherited
            ? 'bg-muted text-muted-foreground border-dashed'
            : 'bg-background',
        )}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        {...rest}
      />
      {/* レイアウトシフトを防ぐため visibility で制御 */}
      <button
        style={{ visibility: inherited || !onReset ? 'hidden' : 'visible' }}
        className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground"
        onClick={onReset}
        tabIndex={inherited || !onReset ? -1 : 0}
        aria-label="デフォルトにリセット"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
```

同様のパターンを `ColorInput` と `SelectInput` にも適用。

---

## Acceptance Criteria

### Phase 1: 要素ストーリー

- [ ] `src/elements/text/Renderer.stories.tsx` に `Default`, `WithBinding`, `Bold`, `DefaultStyleInherited`, `Vertical` が存在する
- [ ] `ElementRenderer.stories.tsx` に formTable, repeatingBand, barcode, checkbox, manualEntry のストーリーが追加される
- [ ] `src/elements/shape/Renderer.stories.tsx` に `HorizontalLine`, `VerticalLine`, `Rectangle` が存在する
- [ ] `src/elements/chart/Renderer.stories.tsx` に `Bar`, `Line`, `Pie` が存在する
- [ ] すべてのストーリーで `elementFactories.ts` の factory 関数を使用（storyHelpers.ts は不要）
- [ ] `.storybook/preview.ts` にグローバル `beforeEach` リセットが追加される
- [ ] Storybook ビルドが型エラーなしで完了する（`npm run build-storybook`）

### Phase 2: inherited prop

- [ ] `NumInput` に `inherited?: boolean` と `onReset?: () => void` が追加される
- [ ] `ColorInput` に同様の props が追加される
- [ ] `SelectInput` に同様の props が追加される
- [ ] `value === undefined` の代わりに `inherited={style.fontSize === undefined}` で状態を渡す
- [ ] ✕ ボタンのクリックで `onReset()` が呼ばれる（テストで検証）
- [ ] ✕ ボタンの表示/非表示でレイアウトシフトが発生しない（`visibility` で制御）
- [ ] 既存の `TextStyleSection` の機能が維持される（リグレッションなし）

---

## System-Wide Impact

### API Surface

既存コンポーネントへの props 追加（後方互換）:

| コンポーネント | 追加 props | デフォルト値 |
|---|---|---|
| `NumInput` | `inherited?: boolean`, `onReset?: () => void` | `false`, `undefined` |
| `ColorInput` | `inherited?: boolean`, `onReset?: () => void` | `false`, `undefined` |
| `SelectInput` | `inherited?: boolean`, `onReset?: () => void` | `false`, `undefined` |

既存の呼び出し箇所は変更不要（オプショナル props のため）。

### Integration Test Scenarios

1. Storybook の `text/Renderer.stories.tsx` で `DefaultStyleInherited` ストーリーを確認 → 青いフォントで表示される
2. `NumInput` の `inherited=true` ストーリーで ✕ ボタンが非表示であること
3. `NumInput` の `inherited=false` ストーリーでホバー時に ✕ ボタンが表示されること
4. ストーリー A → ストーリー B の遷移でストア状態が汚染されないこと（`beforeEach` リセット確認）

---

## Dependencies & Risks

| リスク | 対策 |
|---|---|
| `TextRenderer` の Phase 1 完了前にストーリーを書くと `defaultStyle` prop が存在しない | Phase 1 完了後に `TextRenderer` ストーリーを作成 |
| Storybook + immer store で `setState` が期待通りに動かない | `useReportStore.setState(state, true)` の replace フラグを確認 |
| `FormTableElement`/`RepeatingBandElement` の factory 引数が複雑 | 最小構成のデータを `elementFactories.ts` の既存デフォルトで補う |

---

## Files

| ファイル | 操作 |
|---|---|
| `.storybook/preview.ts` | 変更: グローバル `beforeEach` リセット追加 |
| `src/elements/text/Renderer.stories.tsx` | 新規 |
| `src/elements/shape/Renderer.stories.tsx` | 新規 |
| `src/elements/chart/Renderer.stories.tsx` | 新規 |
| `src/components/canvas/ElementRenderer.stories.tsx` | 変更: formTable, repeatingBand, barcode, checkbox, manualEntry 追加 |
| `src/elements/_base/sharedUI.tsx` | 変更: `inherited`, `onReset` props 追加 |
| `src/elements/_base/sharedUI.test.tsx` | 変更 or 新規: NumInput inherited テスト |

---

## Sources & References

### Origin

- **Brainstorm:** [docs/brainstorms/2026-04-05-atomic-design-component-breakdown-brainstorm.md](docs/brainstorms/2026-04-05-atomic-design-component-breakdown-brainstorm.md)
  - Key decisions: Atoms/Molecules 全体リファクタは YAGNI（`_blocks/` で代替済み）、PropInputUnit はジェネリクス不要で既存 Atom 拡張で十分

### Internal References

- 既存ストーリーパターン（pure renderer）: `src/components/canvas/ElementRenderer.stories.tsx`
- 既存ストーリーパターン（StoreSeeder）: `src/components/canvas/ReportCanvas.stories.tsx`
- 既存 Atom primitives: `src/elements/_base/sharedUI.tsx`
- Element factory: `src/lib/elementFactories.ts`
- Storybook 設定: `.storybook/main.ts`, `.storybook/preview.ts`

### External References

- Zustand reset state guide: zustand.docs.pmnd.rs/guides/how-to-reset-state
- Storybook 8 `beforeEach` hooks: storybook.js.org/docs/8/writing-tests/component-testing
- Zustand `setState` replace flag documentation

### Related Work

- TextElement 継承 UI（この計画の Phase 2 が前提）: `docs/plans/2026-04-11-feat-text-element-inline-editing-plan.md` Phase 3

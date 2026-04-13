---
title: 多段印鑑欄 PropertiesPanel — NumInput 幅崩れ・セル操作時の size.width 未同期
problem_type: ui_bug
component: approvalStampRow/PropertiesPanel
symptom: セル幅入力欄が 18px に潰れて編集不能 / セル削除後も要素外枠が縮まない
root_cause: flex コンテナで NumInput が flex-1 入力に押し潰される + セル操作時に size.width を更新していなかった
tags: [flex-layout, numInput, approvalStampRow, PropertiesPanel, size-sync, cell-management]
severity: medium
solved_date: 2026-04-14
---

## 症状

### 問題1: NumInput 幅崩れ

`approvalStampRow` の PropertiesPanel で、セル行に「役職名テキスト入力」と「幅 NumInput」を横並びにしたレイアウトで、NumInput が **18px** に圧縮されて値「15」が視認も編集もできない状態になっていた。

```
[担当              ][1!] mm ×   ← 幅入力欄が潰れて"1!"のように表示される
```

### 問題2: セル削除後に枠が縮まない

セルを削除しても要素の外枠（`size.width`）が元のままで、削除後に余白が残る。

```
5セル削除→4セル: 枠幅が 75mm のまま → 4セル分 60mm に縮まるべき
```

---

## 根本原因

### 問題1: NumInput の flex 圧縮

PropertiesPanel のセル行レイアウト:

```tsx
<div className="flex gap-1 items-center">
  <input type="text" className="... flex-1 bg-background" />  // flex-1 で全幅を占有
  <NumInput value={cell.width} unit="mm" />                   // コンテナが 18px に潰れる
  <button>×</button>
</div>
```

`NumInput` 内部の構造:

```tsx
<div className="flex items-center gap-1 group">   // flex コンテナ
  <input className="w-full" />                     // w-full だが親が 18px なら 18px
  <span className="shrink-0">mm</span>             // ~14px
  <button style={{visibility: 'hidden'}}>×</button> // display:none ではなく visibility:hidden → レイアウト維持
</div>
```

`flex-1` のテキスト入力が利用可能幅を全て取り、`NumInput` の親 div は **flex のデフォルト min-content まで縮む** = 約 18px。
`px-2 = 16px` のパディングがあるため数値表示域は実質 2px しかない。

### 問題2: size.width 未更新

セル変更時の `onChange` がセル配列しか更新しておらず、要素の `size.width` を同期していなかった。

```tsx
// ❌ 修正前
<button onClick={() => onChange({ cells: el.cells.filter(...) })}>×</button>
```

`Renderer` は `width: '100%'` で描画するため `size.width` が変わらなければ枠も変わらない。

---

## 解決方法

### 問題1: NumInput を固定幅でラップ

```tsx
// ✅ 修正後
<div className="flex gap-1 items-center">
  <input
    type="text"
    className="border rounded px-1.5 py-0.5 text-xs flex-1 min-w-0 bg-background"
    //                                                         ↑ min-w-0 必須
    placeholder="役職名"
    value={cell.role}
    onChange={...}
  />
  <div className="w-24 shrink-0">   {/* ← 96px 固定幅ラッパー */}
    <NumInput value={cell.width} onChange={...} min={5} unit="mm" />
  </div>
  <button className="text-xs text-destructive px-1 shrink-0" onClick={...}>×</button>
  {/*                                                          ↑ shrink-0 追加 */}
</div>
```

**サイズ計算の根拠 (`w-24 = 96px`):**

| 要素 | 幅 |
|------|---|
| gap-1 × 2 | 8px |
| "mm" span | ~14px |
| hidden reset button | ~20px |
| **input の実利用幅** | **54px** ← "15" や "100" を表示するには十分 |

### 問題2: セル操作で size.width を常に同期

```tsx
// ✅ 削除ボタン
<button onClick={() => {
  const cells = el.cells.filter((_, ci) => ci !== i)
  onChange({ cells, size: { ...el.size, width: cells.reduce((s, c) => s + c.width, 0) } })
}}>×</button>

// ✅ 幅変更 NumInput
<NumInput
  value={cell.width}
  onChange={(v) => {
    const cells = el.cells.map((c, ci) => ci === i ? { ...c, width: v } : c)
    onChange({ cells, size: { ...el.size, width: cells.reduce((s, c) => s + c.width, 0) } })
  }}
  min={5}
  unit="mm"
/>

// ✅ セル追加ボタン
<button onClick={() => {
  const cells = [...el.cells, { role: '', width: 15 }]
  onChange({ cells, size: { ...el.size, width: cells.reduce((s, c) => s + c.width, 0) } })
}}>＋ セル追加</button>
```

**共通パターン:**

```ts
const cells = /* 新しいセル配列 */
onChange({
  cells,
  size: { ...el.size, width: cells.reduce((s, c) => s + c.width, 0) },
})
```

---

## 動作確認

```
1. 多段印鑑欄をキャンバスに追加する
2. プロパティパネルの各セル行で「15」が幅入力欄に表示される ← 問題1 修正確認
3. セルを削除 → キャンバス上の枠が縮小する ← 問題2 修正確認
4. セルを追加 → キャンバス上の枠が拡大する
5. 幅を変更（例: 15→30）→ 該当セルがキャンバスで広がる
```

---

## 再発防止

### flex 行に NumInput を置く場合の必須パターン

```tsx
// テキスト入力 + NumInput を横並びにする場合は必ずこのパターン
<div className="flex gap-1 items-center">
  <input className="... flex-1 min-w-0 ..." />   // min-w-0 必須
  <div className="w-24 shrink-0">                // 固定幅ラッパー必須
    <NumInput ... />
  </div>
</div>
```

`min-w-0` を忘れると flex アルゴリズムが min-content を下限に使い、`flex-1` が隣を押し潰す。

### マルチセル要素の size.width 同期パターン

`cells` 配列を変更する `onChange` は **必ず** `size.width` を同時に更新する。

```ts
// 型で強制することも検討
type CellsOnChange = {
  cells: ApprovalStampCell[]
  size: Pick<ElementBase['size'], 'width'>  // width の更新を必須化
}
```

### 類似リスクのある箇所

- `formTable` — 列定義の追加/削除/幅変更時に `size.width` を同期しているか要確認
- `repeatingBand` — バンド内カラムに幅属性がある場合
- 将来追加される複数カラム要素すべて

---

## 関連

- `todos/258-complete-p2-approval-stamp-no-image-upload.md` — 同コンポーネントの stampSrc 設定 UI 追加
- `todos/033-complete-p1-approval-stamp-unsafe-img-src.md` — stampSrc の XSS ガード対応
- `src/elements/_base/sharedUI.tsx` — NumInput コンポーネント定義

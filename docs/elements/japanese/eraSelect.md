# 元号選択 (eraSelect)

和暦元号（明治・大正・昭和・平成・令和）のうち該当する元号を囲む表示をする要素。申請書・契約書の日付記入欄でよく使われるパターンです。

- **ElementType**: `eraSelect`
- **パレット**: 日本語帳票専用 → `元号選択`
- **ファクトリ**: `createEraSelectElement()` (`src/lib/elementFactories.ts`)
- **Renderer**: `src/elements/eraSelect/Renderer.tsx`
- **定数**: `src/elements/eraSelect/constants.ts`（`DEFAULT_ERAS` = `['明','大','昭','平','令']`）

## 型定義

```ts
export type EraSelectLayout = 'column' | 'row' | 'grid-2col'

export interface EraSelectElement extends ElementBase {
  type: 'eraSelect'
  dataSource?: string
  layout?: EraSelectLayout
  eras?: string[]
}
```

## プロパティ

| プロパティ | 型 | 既定値 | 説明 |
|---|---|---|---|
| `dataSource` | string? | 未設定 | 選択済み元号を与えるデータキー。空文字や未解決ならすべて未選択（＝すべて ○ 表示）。 |
| `layout` | `'column' \| 'row' \| 'grid-2col'` | `'column'` | 元号の並び方向。 |
| `eras` | string[] | `['明','大','昭','平','令']` | 表示する元号リスト。 |

## 選択ロジック

1. `dataSource` を `useDataResolver` で解決。
2. 解決値 `v` について：
   - `v === ''` or 未解決 → すべて未選択（○ のみ）。
   - `v === '令'` のように厳密一致した元号を選択状態（選択中は枠で囲む等の強調表示）。
   - 部分一致や省略表記（例: `'令和'`）には現行実装では対応しない → `eras` 側に合わせた値を入れるか、計算式で短縮してから渡す。

## デフォルト値（ファクトリ）

```ts
position: { x: 13, y: 13 }
size:     { width: 7, height: 12 }
layout:   'column'
eras:     ['明','大','昭','平','令']
```

## レンダリング挙動

- `layout`:
  - `column`: 1 列縦並び（元号を ○ で囲む）。
  - `row`: 1 行横並び。
  - `grid-2col`: 2 列グリッド（5 項目なら 2×3 グリッド、右下は空）。
- 各元号文字を ○（丸囲み）でレイアウト。`dataSource` で合致したものだけ強調（通常は塗りつぶし or 太枠）。

## 典型的な使用例

### 生年月日欄の元号（縦）
```ts
createEraSelectElement({
  dataSource: 'birthEra',
  layout: 'column',
  size: { width: 8, height: 50 },
})
```

### 契約年月日欄（横 1 行・3 元号のみ）
```ts
createEraSelectElement({
  dataSource: 'contractEra',
  layout: 'row',
  eras: ['昭', '平', '令'],
  size: { width: 30, height: 8 },
})
```

### 2 列（スペース節約）
```ts
createEraSelectElement({
  dataSource: 'issueEra',
  layout: 'grid-2col',
  size: { width: 14, height: 20 },
})
```

## PropertiesPanel の項目

- `dataSource`（`DataBindingSection`）
- レイアウト（column / row / grid-2col）
- 元号リスト（追加／削除／並び替え）

## 関連要素

- [チェックボックス (checkbox)](./checkbox.md) — 単一項目を ON/OFF したいだけの場合
- [現在日付 (currentDate)](../common/currentDate.md) — 自動日付を和暦表示したい場合
- [データフィールド (dataField)](../text/dataField.md) — `wareki_full` 書式で元号付き日付を表示

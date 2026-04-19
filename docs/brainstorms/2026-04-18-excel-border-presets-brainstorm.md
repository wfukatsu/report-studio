# Excel風罫線プリセットツール

**Date:** 2026-04-18
**Status:** Brainstorm complete

## What We're Building

繰り返しバンド (repeatingBand) と帳票テーブル (formTable) に対して、Excel の罫線ツールのようなプリセットボタンをプロパティパネルに追加する。ワンクリックで帳票でよく使う罫線パターンを適用でき、ヘッダー/データ行/フッターそれぞれの罫線を個別にカスタマイズできる。

## Why This Approach

### プリセット型を選んだ理由
- 帳票で使われる罫線パターンは実質 6-7 種類に収まる
- セル単位の完全制御は実装コスト・UI複雑さに対してユーザー価値が低い
- プリセット適用後に3階層のカスタマイズで微調整できれば十分

### プロパティパネル配置を選んだ理由
- 既存の「外観」セクションに自然に統合できる
- フローティングツールバーは formTable の TableToolbar と競合する
- 罫線は頻繁に変更するプロパティではなく、初期設定時にプリセットで決めるのが一般的

## Key Decisions

### 1. プリセット一覧

| プリセット | 外枠 | ヘッダー下 | データ行間 | 列区切り | フッター上 |
|-----------|------|-----------|-----------|---------|-----------|
| 全罫線 | 0.3mm | 0.3mm | 0.3mm | 0.3mm | 0.3mm |
| 外枠のみ | 0.3mm | なし | なし | なし | なし |
| ヘッダー下太線 | 0.3mm | 0.5mm | 0.3mm | 0.3mm | 0.3mm |
| 合計行上太線 | 0.3mm | 0.3mm | 0.3mm | 0.3mm | 0.5mm |
| 帳票標準 | 0.5mm | 0.5mm | 0.2mm | 0.2mm | 0.5mm |
| 列区切りのみ | なし | なし | なし | 0.3mm | なし |
| 罫線なし | なし | なし | なし | なし | なし |

### 2. カスタマイズの3階層

プリセット適用後に個別調整可能な罫線グループ:

- **外枠 (outer)**: バンド全体の外周。色・幅を設定
- **ヘッダー罫線 (header)**: ヘッダー行の下罫線。色・幅を設定（太線にする帳票が多い）
- **データ行罫線 (data)**: データ行間の横線 + 列区切りの縦線。色・幅を個別設定
- **フッター罫線 (footer)**: 合計行の上罫線。色・幅を設定（太線にする帳票が多い）

### 3. データモデル拡張

現在の `borderColor`/`borderWidth`/`innerBorderColor`/`innerBorderWidth` を以下に拡張:

```ts
// 既存プロパティはそのまま（外枠用）
borderColor: string
borderWidth: number

// 新規: 3階層の個別罫線設定（すべて optional、未設定時は外枠値にフォールバック）
headerBorderColor?: string    // ヘッダー下の罫線色
headerBorderWidth?: number    // ヘッダー下の罫線幅
dataBorderColor?: string      // データ行間の横罫線色
dataBorderWidth?: number      // データ行間の横罫線幅
columnBorderColor?: string    // 列区切りの縦罫線色
columnBorderWidth?: number    // 列区切りの縦罫線幅
footerBorderColor?: string    // フッター上の罫線色
footerBorderWidth?: number    // フッター上の罫線幅
```

既存の `innerBorderColor`/`innerBorderWidth` は `dataBorderColor`/`dataBorderWidth` + `columnBorderColor`/`columnBorderWidth` に置き換える（マイグレーション不要: 未設定時は外枠にフォールバック）。

### 4. マイグレーション戦略

既存テンプレートの `innerBorderColor`/`innerBorderWidth` は引き続きレンダラーで読み取る。新しいプロパティが未設定の場合のフォールバックチェーン:

```
headerBorderWidth ?? innerBorderWidth ?? borderWidth
dataBorderWidth   ?? innerBorderWidth ?? borderWidth
columnBorderWidth ?? innerBorderWidth ?? borderWidth
footerBorderWidth ?? borderWidth  (フッターは外枠相当が自然)
```

`innerBorder*` プロパティは deprecated とし、新規作成時は設定しない。既存データは上記チェーンで自動的に動作する。

### 5. 対象要素

- **repeatingBand**: プロパティパネルの「外観」セクションにプリセットボタン群を追加
- **formTable**: 同様のプリセットを適用。formTable はヘッダー/フッターの概念が行ロール (`header`/`data`/`footer`) で管理されるため、ロール境界の罫線に適用する

### 5. UI デザイン

プロパティパネル「外観」セクションの先頭に配置:

```
繰り返しバンド — 外観
┌─────────────────────────────┐
│ 罫線プリセット               │
│ [全罫線] [外枠] [帳票標準]    │
│ [ヘッダー太] [合計太] [なし]   │
├─────────────────────────────┤
│ ▼ 罫線の詳細設定             │
│  外枠の色 [■] 幅 [0.3]mm    │
│  ヘッダー下 [■] 幅 [0.5]mm   │
│  データ行間 [■] 幅 [0.2]mm   │
│  列区切り  [■] 幅 [0.2]mm   │
│  フッター上 [■] 幅 [0.5]mm   │
└─────────────────────────────┘
```

## Open Questions

なし（全て決定済み）

## Implementation Notes

### レンダラーへの影響

現在の `borderStr(el)` / `innerBorderStr(el)` を、以下の4つのヘルパーに分割:

- `outerBorderStr(el)` — BandContainer の外枠
- `headerBorderStr(el)` — HeaderRow の borderBottom
- `dataBorderStr(el)` — DataRow の borderBottom + baseCellLayout の列 borderRight
- `footerBorderStr(el)` — FooterRow の borderTop

列区切り (`columnBorder*`) はデータ行の縦線だが、ヘッダーとフッターの列区切りも同じ値を使う（ヘッダー/フッターの列区切りだけ変えたいケースは稀）。

### プリセットの適用方法

プリセットボタンクリック時に、該当するプロパティ群を一括で `onChange()` に渡す。「なし」は `borderWidth: 0` で表現（色はそのまま保持）。

## Scope Boundaries

- セル単位の罫線制御は対象外
- 罫線スタイル（dashed, dotted）は今回対象外（将来拡張として検討）
- 斜め罫線は対象外
- formTable のセル結合境界の罫線制御は対象外

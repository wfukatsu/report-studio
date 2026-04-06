---
date: 2026-04-05
topic: text-element
---

# TextElement の要件定義

## What We're Building

帳票テンプレートエディタにおける `TextElement` を、一般的なテキストボックスとして期待される全機能を備えたコンポーネントに拡充する。

主な改善点は3つ:
1. **インライン編集** — ダブルクリックでキャンバス上を直接編集できる
2. **完全なスタイル制御** — lineHeight / textDecoration / 背景色 / padding / 縦位置揃え 等、一般的なテキストボックスができることをすべてサポート
3. **リッチな変数挿入** — `{{key}}` トークンを維持しつつ、`@` メンションで変数を検索・挿入できる

---

## Why This Approach

現在の TextElement は基本的なスタイル（fontSize / fontWeight / color / textAlign）しか持たず、プロパティパネルからしか編集できない。帳票設計者の主要操作はテキスト編集であるため、キャンバス上でのインライン編集は必須。また、スタイルの不足により法定帳票に必要な表現（行間・文字間隔・枠囲み等）が実現できない。

**CSS inherit モデルを採用する理由:** テンプレート全体のフォントをまず決め、特定要素だけ上書きする、という設計者のメンタルモデルに一致する。CSSの自然な仕組みを応用することで、実装もシンプルになる。

---

## Key Decisions

### 1. インライン編集の仕組み

- **トリガー:** ダブルクリックで編集モードに入る
- **実装:** `contenteditable="true"` の div に切り替え（または textarea を重ねてオーバーレイ）
- **確定:** Enter（改行なし）または Escape でキャンセル、フォーカスアウトで確定
- **ドラッグとの共存:** 編集モード中はドラッグ・リサイズを無効化
- **`{{token}}` の扱い:** 編集モードではトークン文字列（`{{employee.name}}`）をそのまま表示・編集できる。ハイライト表示（青色 span）でトークンを視覚化する（Phase 2）

### 2. `@` メンションによる変数挿入

編集中に `@` を打つと変数候補ピッカーが表示される:

| カテゴリ | 例 |
|---|---|
| **データソース変数** | `@employee.name`, `@items[].income` |
| **帳票システム変数** | `@page.current`, `@page.total`, `@report.date`, `@report.name` |
| **相対日付** | `@today`, `@today+30d`, `@month.start`, `@year.end` |
| **計算式** | `@calc.totalIncome`, `@calc.taxAmount`（CalculationRule で定義したもの） |

選択するとカーソル位置に `{{key}}` トークンとして挿入される。

### 3. TextStyle の完全定義

```ts
interface TextStyle {
  // フォント
  fontFamily?: string        // 'Noto Sans JP' | 'Meiryo' | 'Yu Gothic' | 'custom'
  fontSize?: number          // pt
  fontWeight?: 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'

  // テキスト装飾
  textDecoration?: 'none' | 'underline' | 'line-through' | 'underline line-through'
  textTransform?: 'none' | 'uppercase' | 'lowercase'
  letterSpacing?: number     // em 単位（例: 0.05 = 0.05em）

  // 配置
  textAlign?: 'left' | 'center' | 'right' | 'justify'
  verticalAlign?: 'top' | 'middle' | 'bottom'

  // 行間
  lineHeight?: number        // 倍率（例: 1.5 = 1.5×）

  // 色
  color?: string             // テキスト色
  backgroundColor?: string   // テキストボックス背景色（透明 = 'transparent'）

  // ボックス
  padding?: { top: number; right: number; bottom: number; left: number }  // mm
  overflow?: 'hidden' | 'visible' | 'ellipsis'  // テキストがはみ出した時の処理
  wordBreak?: 'break-word' | 'keep-all' | 'normal'  // 改行ルール
  whiteSpace?: 'pre-wrap' | 'nowrap' | 'normal'     // 空白・改行の扱い
}
```

### 4. テンプレートレベルのデフォルトスタイル（CSS inherit モデル）

`ReportDefinition` に `defaultTextStyle: TextStyle` を追加する。

```
レンダリング時のスタイル解決順序:
1. ReportDefinition.defaultTextStyle（テンプレート全体のデフォルト）
2. ←上書き← TextElement.style に明示的に設定された値のみ適用
```

プロパティパネルでは「テンプレートデフォルトから継承」と「この要素で上書き」を視覚的に区別する（例: 継承中は薄いグレー表示、上書き時は白背景）。上書きのリセットボタン（✕）を各プロパティ横に配置する。

### 5. サポートするフォントファミリー

Phase 1: 内蔵フォントのみ（ブラウザ標準 + Google Fonts CDN 経由）

| 表示名 | CSS 値 |
|---|---|
| Noto Sans JP | `'Noto Sans JP', sans-serif` |
| Meiryo | `Meiryo, 'Meiryo UI', sans-serif` |
| Yu Gothic | `'Yu Gothic', 'YuGothic', sans-serif` |
| Hiragino Kaku Gothic | `'Hiragino Kaku Gothic Pro', sans-serif` |
| JetBrains Mono | `'JetBrains Mono', monospace` |

Phase 2: カスタムフォントのアップロード対応

---

## TextElement の型定義（最終版）

```ts
interface TextElement extends ElementBase {
  type: 'text'
  content: string     // {{token}} を含む可能性あり
  style: TextStyle    // 上書きしたいプロパティのみ。undefined = テンプレートデフォルト継承
}
```

`ElementBase` への追加（全 Element 共通）:
```ts
interface ElementBase {
  // 既存
  id: string; type: ElementType; position: Position; size: Size
  zIndex: number; locked: boolean; visible: boolean
  // 追加
  name?: string           // レイヤーパネル表示名
  visibilityRule?: string // 表示条件式
  printable?: boolean     // 出力対象か（default: true）
}
```

---

## プロパティパネルの UI 設計（右パネル）

### 「スタイル」タブの構成

```
─ フォント ─────────────────
  [フォントファミリー セレクト       ▼]  [継承リセット ✕]
  サイズ [12] pt    行間 [1.5] ×    [継承]
  字間  [0.0] em

─ スタイル ──────────────────
  [B] [I] [U] [S]  |  [≡][≡][≡][≡]
  縦: [上▼]  改行: [折返し▼]

─ 色 ────────────────────────
  テキスト  [●] #0f172a  [継承]
  背景    [○] transparent [継承]

─ パディング ────────────────
  上 [2] 右 [4] 下 [2] 左 [4]  mm
```

### 「基本」タブ（変更なし + 追加）

```
─ 位置 (mm) ─────────────────
  X [13.0]   Y [13.0]

─ サイズ (mm) ───────────────
  幅 [53.0]   高さ [10.0]

─ 要素 ID ───────────────────
  [text_001        ]

─ 表示条件 ──────────────────
  [CodeMirror式エディタ        ]

  Z-index [1]    ロック [□]   非表示 [□]
```

---

## インライン編集の UI フロー

```
通常状態:
  CanvasElement（選択ハンドル付き）
    └─ ElementRenderer → TextElement レンダリング

ダブルクリック後:
  CanvasElement（ドラッグ・リサイズ無効）
    └─ TextInlineEditor（contenteditable div）
         - 青い枠線でフォーカス表示
         - {{token}} はハイライト span（Phase 2）
         - @ 入力 → VariablePicker ドロップダウン表示

確定（フォーカスアウト / Escape）:
  → onEdit(newContent) コールバック
  → updateElement() で store に保存
  → 通常状態に戻る
```

---

## スタイルプロパティパネルの完全定義

### UI レイアウト（「スタイル」タブ）

```
─ フォント ──────────────────────────────────────
  [Noto Sans JP                    ▼]  [✕]
   ↑ 継承中はグレー背景・✕なし / 上書き中は白背景・✕あり

  サイズ [ 12 ] pt   行間 [ 1.5 ] ×   字間 [ 0.0 ] em
          [✕]              [✕]                [✕]

─ スタイル ──────────────────────────────────────
  [B]  [I]  [U]  [S]     ←  太字 / 斜体 / 下線 / 取り消し線
   ↑ アクティブ = primary 色、非アクティブ = デフォルト

  縦揃え  [上 ▼]  [✕]      改行  [折返し ▼]  [✕]
  オーバーフロー  [隠す ▼]  [✕]

─ 配置 ──────────────────────────────────────────
  [≡左]  [≡中]  [≡右]  [≡両端]
    ↑ テキスト水平配置（アクティブ = primary 色）[✕]

─ 色 ────────────────────────────────────────────
  テキスト  [●] [#0f172a    ] [✕]
  背景      [○] [transparent] [✕]

─ パディング（mm）────────────────────────────────
      [ 2.0 ]
  [ 4.0 ] + [ 4.0 ]   ← 上下左右の個別入力
      [ 2.0 ]
  ※ リンクアイコンで「一括変更」トグル可能    [✕ 全リセット]

─ ────────────────────────────────────────────────
  [すべてをテンプレートデフォルトに戻す]  ← 右寄せリンク
```

### 各入力のバリデーションルール

| プロパティ | 型 | 範囲 / 選択肢 | エラー表示 |
|---|---|---|---|
| fontFamily | select | 定義済みフォント一覧のみ | — |
| fontSize | number | 1 〜 200 pt | 範囲外は赤枠 + tooltip |
| lineHeight | number | 0.5 〜 5.0（0.1刻み） | 範囲外は赤枠 |
| letterSpacing | number | -0.5 〜 2.0 em（0.01刻み） | 範囲外は赤枠 |
| color | hex string | `#RRGGBB` 形式または `transparent` | 無効値は赤枠 |
| backgroundColor | hex string | 同上 | 無効値は赤枠 |
| padding.* | number | 0 〜 50 mm | 負値不可 |
| textAlign | select | left / center / right / justify | — |
| verticalAlign | select | top / middle / bottom | — |
| overflow | select | hidden / visible / ellipsis | — |
| wordBreak | select | break-word / keep-all / normal | — |
| fontWeight | toggle | normal / bold | — |
| fontStyle | toggle | normal / italic | — |
| textDecoration | multi-toggle | none / underline / line-through | — |

### セレクト選択肢の日本語表示

| プロパティ | 英語値 | 日本語ラベル |
|---|---|---|
| textAlign | left | 左揃え |
| textAlign | center | 中央揃え |
| textAlign | right | 右揃え |
| textAlign | justify | 両端揃え |
| verticalAlign | top | 上揃え |
| verticalAlign | middle | 中央揃え |
| verticalAlign | bottom | 下揃え |
| overflow | hidden | 隠す |
| overflow | visible | はみ出し表示 |
| overflow | ellipsis | ... で省略 |
| wordBreak | break-word | 折り返す |
| wordBreak | keep-all | 折り返さない（日本語向け） |
| wordBreak | normal | 標準 |

### 継承状態の視覚的表現

```tsx
// 例: fontSize の入力フィールド
<PropInputUnit
  value={element.style.fontSize}         // undefined なら継承
  defaultValue={defaultStyle.fontSize}   // テンプレートデフォルト値
  unit="pt"
  onChange={(v) => updateStyle({ fontSize: v })}
  onReset={() => updateStyle({ fontSize: undefined })}  // ✕ ボタン
  inherited={element.style.fontSize === undefined}
  // inherited=true → 薄グレー背景、placeholder にデフォルト値を表示、✕ 非表示
  // inherited=false → 白背景、✕ 表示
/>
```

### パディング入力の一括/個別モード

- デフォルト: 上下左右を個別に4つの入力で表示
- 「リンク」アイコンをクリック → 一括入力モードに切替（1つの数値で全辺に同じ値を設定）
- 一括入力後に「リンク解除」アイコンで個別モードに戻る（各辺は一括で設定した値を引き継ぐ）

---

## Storybook Stories

| Story | 説明 |
|---|---|
| `Default` | 基本テキスト、スタイルなし |
| `WithBinding` | `{{employee.name}}` トークン入り |
| `Bold` | fontWeight: bold |
| `Multiline` | 複数行テキスト + lineHeight: 1.8 |
| `WithBackground` | 背景色付き |
| `WithPadding` | padding あり |
| `LongTextEllipsis` | overflow: ellipsis |
| `Inherit` | style 未設定（テンプレートデフォルト継承） |
| `AllStylesOverride` | 全スタイルを上書き |
| `EditingMode` | インライン編集中の状態 |

---

## 継承モデルの詳細設計

### defaultTextStyle の設定場所

ヘッダーの「設定」ボタンから開く**テンプレート設定ダイアログ**に「テキストデフォルトスタイル」セクションを設ける。

```
┌─── テンプレート設定 ────────────────────────────┐
│ [メタデータ] [ページ設定] [テキストデフォルト]    │
├──────────────────────────────────────────────────┤
│ テキストデフォルトスタイル                       │
│                                                  │
│ フォントファミリー  [Noto Sans JP       ▼]       │
│ フォントサイズ     [12] pt   行間 [1.5] ×        │
│ テキスト色         [●] #0f172a                   │
│ 背景色            [○] transparent                │
│ 文字間隔          [0.0] em                        │
│ テキスト配置      [≡左] [≡中] [≡右]              │
│                                                  │
│            [キャンセル]  [保存]                  │
└──────────────────────────────────────────────────┘
```

この設定は `ReportDefinition.defaultTextStyle: TextStyle` として保存される。

### スタイル値の解決ロジック

```ts
function resolveStyle(
  elementStyle: Partial<TextStyle>,
  defaultStyle: TextStyle
): TextStyle {
  // elementStyle に値があれば優先、なければ defaultStyle を使う
  return {
    fontFamily: elementStyle.fontFamily ?? defaultStyle.fontFamily,
    fontSize:   elementStyle.fontSize   ?? defaultStyle.fontSize,
    color:      elementStyle.color      ?? defaultStyle.color,
    // ... 全プロパティ
  }
}
```

**レンダリング時:** `resolveStyle(element.style, report.defaultTextStyle)` の結果をキャンバスに適用。

**プロパティパネル表示時:** `element.style[prop] !== undefined` なら「上書き中」、`undefined` なら「継承中」。

### プロパティパネルの継承/上書き UI

各スタイルプロパティの入力欄：

```
継承中（element.style.fontSize === undefined）:
  フォントサイズ  [  12  ]   ← 薄いグレーの背景、placeholder として継承値を表示
                              ✕ボタンは非表示

上書き中（element.style.fontSize === 14）:
  フォントサイズ  [  14  ] ✕ ← 白背景、実際の値を表示
                              ✕ をクリック → element.style.fontSize = undefined に戻す
```

**実装上の重要な区別:**
- `element.style.fontSize === undefined` → 継承（テンプレートデフォルト値を使う）
- `element.style.fontSize === 12`（テンプレートと同値）→ **明示的な上書き**（✕ あり）
- 数値が同じでも「継承」と「同じ値で上書き」は別物

### 一括操作

「スタイル」タブの右上に「すべてをテンプレートデフォルトに戻す」リンクを配置。
クリック → `element.style = {}` にして全プロパティを継承状態にリセット。

---

## @メンションピッカーの完全仕様

### トリガーと表示タイミング

1. インライン編集モード中に `@` を入力した瞬間、ドロップダウンを即時表示
2. `@` 以降の文字列（`@em` の `em` 部分）でリアルタイムに候補を絞り込む
3. 候補が0件になった場合、ドロップダウンを閉じる
4. Escape でドロップダウンを閉じ、`@` 文字列は残す（挿入せずキャンセル）

### ドロップダウンの構成（タブ層分け）

```
┌──────────────────────────────────┐
│ [データ] [システム] [日付] [計算式] │  ← タブ
├──────────────────────────────────┤
│ 🔍 [em________________]          │  ← 検索ボックス
├──────────────────────────────────┤
│ > employee                       │
│   · employee.name        string  │  ← アクティブ（↑↓で移動）
│   · employee.code        string  │
│   · employee.department  string  │
│ > items[]                        │
│   · items[].income       number  │
│   · items[].deduction    number  │
└──────────────────────────────────┘
```

### [データ] タブ

- `DataSourceDefinition` のフィールドツリーをフラット展開して表示
- コレクション（`items[]`）のフィールドは `items[].income` 形式で表示
- 型バッジ（string / number / boolean / date）を右端に表示
- 選択すると `{{fieldKey}}` として挿入（例: `{{employee.name}}`）

### [システム] タブ

| 変数名 | 挿入トークン | 説明 |
|---|---|---|
| ページ番号 | `{{page.current}}` | 現在ページ番号 |
| 総ページ数 | `{{page.total}}` | 全ページ数 |
| 今日の日付 | `{{today}}` | 実行日（YYYY/MM/DD） |
| 印刷日時 | `{{printedAt}}` | 印刷実行日時 |
| 帳票名 | `{{report.name}}` | ReportDefinition.metadata.documentName |
| バージョン | `{{report.version}}` | ReportDefinition.metadata.version |
| 提出先名 | `{{submission.officeName}}` | 提出先事務所名 |
| 提出日 | `{{submission.date}}` | SubmissionModel の提出日 |
| 固定日付 | `{{const.YYYY-MM-DD}}` | Date Picker で選択した固定日付 |
| テンプレート変数 | `{{tplVar.会社名}}` | テンプレートレベルで定義した変数 |

**固定日付:** 選択するとインライン Date Picker が表示され、日付を選ぶと `{{const.2026-04-05}}` 形式で挿入。

**テンプレート変数:** `ReportDefinition.templateVariables: Record<string, string>` に事前定義した変数（例: `{ "会社名": "株式会社山田商事" }`）。

### [日付] タブ

| 表示名 | 挿入トークン |
|---|---|
| 今日 | `{{today}}` |
| 30日後 | `{{today+30d}}` |
| 昨日 | `{{today-1d}}` |
| 今月初日 | `{{month.start}}` |
| 今月末日 | `{{month.end}}` |
| 今年初日 | `{{year.start}}` |
| 今年末日 | `{{year.end}}` |
| 前月末日 | `{{month.start-1d}}` |

リストから選択するのみ。自由入力は不要。日付フォーマットは `DataFieldElement` の `format` プロパティで別途指定。

### [計算式] タブ

- `ReportDefinition.calculationRules` で定義された CalculationRule の一覧を表示
- 例: `calc.totalIncome`, `calc.taxAmount`, `calc.netIncome`
- 選択すると `{{calc.totalIncome}}` として挿入

### キーボード操作

| キー | 動作 |
|---|---|
| `↑` / `↓` | 候補を移動 |
| `Tab` / `Enter` | 選択して挿入 |
| `Escape` | ドロップダウンを閉じる（@ は残す） |
| 文字入力 | 絞り込み検索 |

### 挿入後の処理

1. `@` 文字（とそれ以降の絞り込み文字列）を削除
2. カーソル位置に `{{token}}` を挿入
3. カーソルをトークンの直後に移動
4. ドロップダウンを閉じる

**例:** `"氏名は @em"` → `employee.name` を選択 → `"氏名は {{employee.name}}"`

---

## インライン編集のエッジケース設計

### Undo/Redo（⌘Z）
- **編集中:** ブラウザネイティブの Undo に任せる（contenteditable 内の文字入力取り消し）
- **確定時（フォーカスアウト / Enter）:** `updateElement()` → `pushHistory()` を1回だけ呼ぶ
- **結果:** store の Undo/Redo は「編集前の状態」に戻せる。編集中の細かい操作は store に積まない

### IME 日本語入力
```
compositionstart → isComposing = true（store への onChange を止める）
  ↓ ユーザーが変換中...
compositionend  → isComposing = false → onContentChange(currentText) を呼ぶ
```
- 読み仮名中間状態が store に入ることを防ぐ
- `input` イベントは composing 中に `event.isComposing === true` なら無視する

### `{{token}}` の選択とカーソル操作
- トークンは `<span data-token="employee.name" contenteditable="false">{{employee.name}}</span>` として描画（Phase 2）
- クリック → span 全体を Selection API で選択（`selectAllChildren(span)`）
- Backspace/Delete → span ごと削除
- Phase 1 では: トークンをハイライトせず、プレーンテキストとして扱う。カーソルはトークン内を自由に移動できる。誤ってトークンを壊した場合はユーザーが手動修正。Phase 2 で span 化。

### ロック要素のダブルクリック
- `locked: true` の場合: 何もしない（編集モードに入らない）
- カーソルは `cursor: default` のまま
- ツールチップ（title 属性）: 「ロック中：レイヤーパネルでロックを解除してください」

### readonly モード（プレビュー）
- `readonly=true` の ReportCanvas 上では contenteditable 無効
- ダブルクリック自体を無効化（`pointerEvents: none` または onClick ガード）

### フォーカスアウト時の確定
- 別の要素をクリックした場合 → 確定（`onBlur` で `onContentChange` を呼ぶ）
- CanvasElement の外（背景）をクリックした場合 → 確定 + clearSelection
- Escape キー → **キャンセル**（編集前の content に戻す。`contentRef.current.textContent = originalContent`）
- Enter キー → 確定（改行は挿入しない。改行が必要な場合は Shift+Enter）

### 最小サイズ・オーバーフロー
- 編集モード中: `overflow: visible`（タイプ中にテキストが枠をはみ出しても見える）
- 確定後: `overflow` は `element.style.overflow` の設定値に従う
- テキストボックスの自動拡張は **しない**（サイズは明示的にリサイズハンドルで変更する）

---

## インライン編集のコンポーネント分解

### コンポーネント階層

```
CanvasElement                          ← 選択・ドラッグ・リサイズの外殻
  └─ TextElementRenderer              ← 通常表示（読み取り専用レンダリング）
       ↕ ダブルクリックで切替
  └─ TextInlineEditor                 ← 編集モード（contenteditable ラッパー）
       ├─ EditableContent             ← contenteditable div 本体
       └─ MentionPicker              ← @ トリガーで出現するドロップダウン
            ├─ MentionPickerTabs      ← [データ][システム][日付][計算式]タブ
            ├─ MentionSearchInput     ← 絞り込み検索ボックス
            └─ MentionCandidateList   ← 候補リスト（型バッジ付き）
```

---

### `useInlineEdit` カスタムフック

インライン編集の全ステートと操作を一元管理するフック。

```ts
interface UseInlineEditOptions {
  initialContent: string
  onCommit: (newContent: string) => void   // 確定時: store.updateElement() を呼ぶ
  onCancel: () => void                     // Escape 時: 変更を破棄
}

interface UseInlineEditReturn {
  isEditing: boolean
  content: string                          // 編集中の一時的なテキスト
  editorRef: RefObject<HTMLDivElement>     // EditableContent に渡す ref
  enterEditMode: () => void                // ダブルクリックハンドラから呼ぶ
  commitEdit: () => void                   // Enter / blur から呼ぶ
  cancelEdit: () => void                   // Escape から呼ぶ
  isComposing: boolean                     // IME 入力中フラグ
  handleCompositionStart: () => void
  handleCompositionEnd: (e: CompositionEvent) => void
  handleInput: (e: InputEvent) => void
  handleKeyDown: (e: KeyboardEvent) => void
  // @ メンション用
  mentionState: MentionState | null        // null = ピッカー非表示
  handleMentionSelect: (token: string) => void
}

interface MentionState {
  triggerIndex: number    // コンテンツ中の @ の位置
  query: string           // @ 以降の絞り込み文字列
  anchorRect: DOMRect     // ドロップダウンの表示位置の基準
}
```

**状態遷移:**

```
idle
  ──[ダブルクリック]──→ editing
                          │
                          ├─[Enter / blur]──→ idle  + onCommit(content)
                          ├─[Escape]────────→ idle  + onCancel()
                          └─[@ 入力]────────→ editing + mentionState 設定
                                                │
                                                ├─[候補選択]──→ editing (mentionState = null)
                                                └─[Escape]───→ editing (mentionState = null)
```

---

### `TextInlineEditor` コンポーネント

```ts
interface TextInlineEditorProps {
  element: TextElement
  resolvedStyle: TextStyle        // resolveStyle(element.style, defaultTextStyle)
  onCommit: (content: string) => void
  onCancel: () => void
}
```

**役割:**
- `useInlineEdit` を呼び出してフックのロジックを取得
- `EditableContent` と `MentionPicker` をレイアウト
- `CanvasElement` 側に `isEditing` フラグを伝え、ドラッグ・リサイズを無効化させる

**ポジショニング:**
- `position: absolute; inset: 0` で CanvasElement の座標と完全に一致させる
- `overflow: visible` に設定（編集中はテキストが枠をはみ出してもよい）
- `MentionPicker` は `position: fixed` で viewport 基準にポップアップ（スクロールやズームの影響を受けにくくする）

---

### `EditableContent` コンポーネント

```ts
interface EditableContentProps {
  contentRef: RefObject<HTMLDivElement>
  style: CSSProperties               // resolvedStyle を CSS 値に変換したもの
  onInput: (e: InputEvent) => void
  onKeyDown: (e: KeyboardEvent) => void
  onBlur: () => void
  onCompositionStart: () => void
  onCompositionEnd: (e: CompositionEvent) => void
}
```

**実装上のポイント:**

```tsx
<div
  ref={contentRef}
  contentEditable="true"
  suppressContentEditableWarning   // React の警告を抑制
  onInput={onInput}
  onKeyDown={onKeyDown}
  onBlur={onBlur}
  onCompositionStart={onCompositionStart}
  onCompositionEnd={onCompositionEnd}
  style={{
    ...appliedStyle,
    outline: 'none',          // フォーカスリングをカスタム枠線に置き換え
    caretColor: 'currentColor',
    minHeight: '1em',
  }}
/>
```

**フォーカス管理:**
- `enterEditMode()` 呼び出し後、次の `useEffect` で `contentRef.current.focus()` して即時フォーカス
- `Selection API` で末尾にカーソルを移動: `selection.collapse(textNode, textNode.length)`

---

### `MentionPicker` コンポーネント

```ts
interface MentionPickerProps {
  anchorRect: DOMRect              // 表示位置（@ 文字の直下）
  query: string                    // 絞り込み文字列
  dataSource: DataSourceDefinition
  calculationRules: CalculationRule[]
  templateVariables: Record<string, string>
  onSelect: (token: string) => void
  onDismiss: () => void
}
```

**位置計算:**
```ts
const top = anchorRect.bottom + window.scrollY + 4   // 4px のオフセット
const left = anchorRect.left + window.scrollX

// viewport からはみ出す場合の補正
const adjustedLeft = Math.min(left, window.innerWidth - PICKER_WIDTH - 8)
const adjustedTop = anchorRect.top - PICKER_HEIGHT - 4  // 上に出す場合
```

**タブ状態管理（内部）:**
```ts
type MentionTab = 'data' | 'system' | 'date' | 'calc'
const [activeTab, setActiveTab] = useState<MentionTab>('data')
const [focusedIndex, setFocusedIndex] = useState(0)
```

- `↑` / `↓` → `focusedIndex` を増減（候補リストの先頭/末尾でタブ切替はしない）
- `Tab` → 次のタブに移動（最後のタブで `Tab` → 先頭に戻る）
- `Enter` → `onSelect(candidates[focusedIndex].token)`
- `Escape` → `onDismiss()`

---

### `resolveStyle()` ユーティリティ

```ts
// src/lib/textStyleUtils.ts

export function resolveStyle(
  elementStyle: Partial<TextStyle>,
  defaultStyle: TextStyle
): Required<TextStyle> {
  return {
    fontFamily:      elementStyle.fontFamily      ?? defaultStyle.fontFamily,
    fontSize:        elementStyle.fontSize        ?? defaultStyle.fontSize,
    fontWeight:      elementStyle.fontWeight      ?? defaultStyle.fontWeight,
    fontStyle:       elementStyle.fontStyle       ?? defaultStyle.fontStyle,
    textDecoration:  elementStyle.textDecoration  ?? defaultStyle.textDecoration,
    textTransform:   elementStyle.textTransform   ?? defaultStyle.textTransform,
    letterSpacing:   elementStyle.letterSpacing   ?? defaultStyle.letterSpacing,
    textAlign:       elementStyle.textAlign       ?? defaultStyle.textAlign,
    verticalAlign:   elementStyle.verticalAlign   ?? defaultStyle.verticalAlign,
    lineHeight:      elementStyle.lineHeight      ?? defaultStyle.lineHeight,
    color:           elementStyle.color           ?? defaultStyle.color,
    backgroundColor: elementStyle.backgroundColor ?? defaultStyle.backgroundColor,
    padding:         elementStyle.padding         ?? defaultStyle.padding,
    overflow:        elementStyle.overflow        ?? defaultStyle.overflow,
    wordBreak:       elementStyle.wordBreak       ?? defaultStyle.wordBreak,
    whiteSpace:      elementStyle.whiteSpace      ?? defaultStyle.whiteSpace,
  }
}

export function textStyleToCss(style: Required<TextStyle>): CSSProperties {
  return {
    fontFamily:      style.fontFamily,
    fontSize:        `${style.fontSize}pt`,
    fontWeight:      style.fontWeight,
    fontStyle:       style.fontStyle,
    textDecoration:  style.textDecoration,
    textTransform:   style.textTransform,
    letterSpacing:   `${style.letterSpacing}em`,
    textAlign:       style.textAlign,
    verticalAlign:   style.verticalAlign,   // ← div の verticalAlign は効かないので別途処理
    lineHeight:      style.lineHeight,
    color:           style.color,
    backgroundColor: style.backgroundColor,
    paddingTop:      `${style.padding.top}mm`,
    paddingRight:    `${style.padding.right}mm`,
    paddingBottom:   `${style.padding.bottom}mm`,
    paddingLeft:     `${style.padding.left}mm`,
    overflow:        style.overflow === 'ellipsis' ? 'hidden' : style.overflow,
    textOverflow:    style.overflow === 'ellipsis' ? 'ellipsis' : undefined,
    wordBreak:       style.wordBreak,
    whiteSpace:      style.whiteSpace,
  }
}
```

**`verticalAlign` の実装注意:**
`div` 要素の `verticalAlign` は CSS では効かない。代わりに `display: flex; alignItems: 'flex-start' | 'center' | 'flex-end'` で実現する。

---

### ファイル構成（想定）

```
src/components/canvas/
  TextElementRenderer.tsx       ← 通常表示（読み取り専用）
  TextInlineEditor.tsx          ← 編集モードのコンテナ
  EditableContent.tsx           ← contenteditable div
  MentionPicker.tsx             ← @ ピッカードロップダウン
  MentionPickerTabs.tsx         ← タブ部分
  MentionCandidateList.tsx      ← 候補リスト

src/hooks/
  useInlineEdit.ts              ← インライン編集の全ステート管理

src/lib/
  textStyleUtils.ts             ← resolveStyle() / textStyleToCss()
  tokenParser.ts                ← {{key}} トークンのパース・挿入・置換ユーティリティ
```

---

### `tokenParser.ts` の主要関数

```ts
// {{key}} トークンをパースして、テキストとトークンの配列に分解
export function parseTokens(content: string): Array<
  | { type: 'text'; value: string }
  | { type: 'token'; key: string; raw: string }
>

// @ 挿入処理: content の triggerIndex から query 分を削除して token を挿入
export function insertMentionToken(
  content: string,
  triggerIndex: number,    // @ の位置
  queryLength: number,     // @ 以降の絞り込み文字列の長さ
  token: string            // 挿入するトークンキー（例: 'employee.name'）
): { newContent: string; newCursorOffset: number }

// interpolate: {{key}} をデータソースの値で置換（既存の interpolate() を流用）
export { interpolate } from './dataBinding'
```

---

## `tokenParser.ts` の詳細設計

### 基本方針

- `content` は常に**プレーンテキスト**として扱う（`{{key}}` はそのまま文字列として保存）
- HTML エスケープは `ElementRenderer` の出力時にのみ考慮する
- `contenteditable` は `innerText` ではなく `textContent` を使って値を取得し、改行を `\n` として正規化する

---

### `TOKEN_REGEX` — トークン正規表現

```ts
// ファイル: src/lib/tokenParser.ts

// key は英数字・ドット・角括弧・ハイフン・アンダースコアを許可
const TOKEN_REGEX = /\{\{([a-zA-Z0-9._[\]\-]+)\}\}/g

// tplVar の日本語キーも許可する拡張版
const TOKEN_REGEX_EXTENDED = /\{\{(tplVar\.[^\}]+|[a-zA-Z0-9._[\]\-]+)\}\}/g
```

**許可するキー例:**
- `employee.name` → `{{employee.name}}`
- `items[].income` → `{{items[].income}}`
- `page.current` → `{{page.current}}`
- `calc.totalIncome` → `{{calc.totalIncome}}`
- `const.2026-04-05` → `{{const.2026-04-05}}`
- `tplVar.会社名` → `{{tplVar.会社名}}`（TOKEN_REGEX_EXTENDED でマッチ）

---

### `parseTokens()` — テキスト + トークンの配列に分解

```ts
export type ParsedSegment =
  | { type: 'text'; value: string }
  | { type: 'token'; key: string; raw: string }   // raw = "{{employee.name}}"

export function parseTokens(content: string): ParsedSegment[] {
  const segments: ParsedSegment[] = []
  let lastIndex = 0
  const regex = new RegExp(TOKEN_REGEX_EXTENDED.source, 'g')

  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, match.index) })
    }
    segments.push({ type: 'token', key: match[1], raw: match[0] })
    lastIndex = regex.lastIndex
  }
  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) })
  }

  return segments
}
```

**例:**
```ts
parseTokens('氏名は {{employee.name}} です（{{page.current}} ページ）')
// → [
//     { type: 'text',  value: '氏名は ' },
//     { type: 'token', key: 'employee.name', raw: '{{employee.name}}' },
//     { type: 'text',  value: ' です（' },
//     { type: 'token', key: 'page.current',  raw: '{{page.current}}' },
//     { type: 'text',  value: ' ページ）' },
//   ]
```

---

### `insertMentionToken()` — @ 挿入処理

@ メンション確定時に呼ぶ。`@query` 部分を削除して `{{token}}` を挿入する。

```ts
export interface InsertMentionResult {
  newContent: string
  newCursorOffset: number   // 挿入後のカーソル位置（content の文字オフセット）
}

export function insertMentionToken(
  content: string,
  triggerIndex: number,   // content 中の '@' の文字インデックス
  queryLength: number,    // '@' 以降の絞り込み文字列の長さ
  tokenKey: string        // 挿入するキー（例: 'employee.name'）
): InsertMentionResult {
  const tokenRaw = `{{${tokenKey}}}`
  const before = content.slice(0, triggerIndex)
  const after  = content.slice(triggerIndex + 1 + queryLength)

  const newContent = before + tokenRaw + after
  const newCursorOffset = triggerIndex + tokenRaw.length

  return { newContent, newCursorOffset }
}
```

**例:**
```ts
insertMentionToken('氏名は @em です', 4, 2, 'employee.name')
// → { newContent: '氏名は {{employee.name}} です', newCursorOffset: 22 }
```

---

### `getCursorOffsetInText()` — contenteditable のカーソル位置をテキストオフセットに変換

```ts
export function getCursorOffsetInText(container: HTMLElement): number {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return 0

  const range = selection.getRangeAt(0)
  const preRange = document.createRange()
  preRange.selectNodeContents(container)
  preRange.setEnd(range.startContainer, range.startOffset)

  return preRange.toString().length
}
```

---

### `setCursorAtOffset()` — テキストオフセットにカーソルを設定

```ts
export function setCursorAtOffset(container: HTMLElement, offset: number): void {
  const selection = window.getSelection()
  if (!selection) return

  let remaining = offset
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)

  let node: Text | null = null
  while ((node = walker.nextNode() as Text | null)) {
    if (remaining <= node.length) {
      const range = document.createRange()
      range.setStart(node, remaining)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      return
    }
    remaining -= node.length
  }

  // オフセットがテキスト長を超えた場合は末尾に配置
  const range = document.createRange()
  range.selectNodeContents(container)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}
```

---

### `detectMentionTrigger()` — @ 入力時の triggerIndex と query を算出

```ts
export interface MentionTriggerInfo {
  triggerIndex: number   // content 内の @ の文字インデックス
  query: string          // @ 以降の絞り込み文字列
}

export function detectMentionTrigger(
  content: string,
  cursorOffset: number
): MentionTriggerInfo | null {
  const beforeCursor = content.slice(0, cursorOffset)
  const atIndex = beforeCursor.lastIndexOf('@')

  if (atIndex === -1) return null

  const query = beforeCursor.slice(atIndex + 1)

  // @ の前が単語文字なら email アドレス等と判断してスキップ
  const charBeforeAt = atIndex > 0 ? beforeCursor[atIndex - 1] : ' '
  if (/\w/.test(charBeforeAt)) return null

  // query に空白・改行が含まれていたらトリガー終了
  if (/[\s\n]/.test(query)) return null

  return { triggerIndex: atIndex, query }
}
```

**エッジケース:**

| 入力例 | カーソル位置 | 結果 |
|---|---|---|
| `test@example.com` | `.` の前 | null（@ 前が単語文字） |
| `宛先: @` | @ の直後 | `{ triggerIndex: 4, query: '' }` |
| `@em ployee` | `ee` の後 | null（query に空白が含まれる） |
| `{{page.current}} @` | @ の直後 | `{ triggerIndex: 19, query: '' }` |
| `@employee` | `e` の後 | `{ triggerIndex: 0, query: 'employee' }` |

---

### Phase 1 / Phase 2 の段階的実装

| 機能 | Phase 1 | Phase 2 |
|---|---|---|
| `{{token}}` のパース | `parseTokens()` でパース済み | 変更なし |
| キャンバス表示 | `interpolate()` で値置換してプレーンテキスト表示 | span でハイライト表示 |
| 編集モード | `textContent` のプレーンテキスト編集 | span を `contenteditable=false` に変換 |
| カーソル操作 | getCursorOffset / setCursorAtOffset | span 全体を Range で選択 |
| @ メンション | `detectMentionTrigger()` → `insertMentionToken()` | 変更なし |
| Backspace でトークン削除 | 文字単位で削除（トークン壊れる可能性あり） | span ごと削除 |

---

## テンプレート変数の管理設計

### 概要

テンプレート変数（`tplVar.*`）は「テンプレートレベルで定義した固定文字列の置換変数」。
データソースとは独立して存在し、帳票作成時に一度設定すれば全ページ・全要素で使い回せる。

**ユースケース例:**
- `{{tplVar.会社名}}` → `"株式会社山田商事"`
- `{{tplVar.提出先}}` → `"渋谷税務署"`
- `{{tplVar.年度}}` → `"2026年度"`

---

### 型定義

```ts
// src/types/index.ts に追加

interface TemplateVariable {
  key: string       // 一意なキー（例: '会社名'）。tplVar.key として参照される
  label: string     // 表示名（通常は key と同じ。日本語可）
  description?: string  // 用途の説明（任意）
  defaultValue: string  // テンプレートに組み込まれたデフォルト値
}

// ReportDefinition に追加
interface ReportDefinition {
  // 既存フィールド...
  defaultTextStyle: TextStyle
  templateVariables: TemplateVariable[]   // 追加
  calculationRules: CalculationRule[]     // 追加（別途詳細化）
}
```

---

### テンプレート変数の設定 UI

「テンプレート設定」ダイアログ内の **[変数]** タブに配置する。

```
┌─── テンプレート設定 ─────────────────────────────────────────────────┐
│ [メタデータ] [ページ設定] [テキストデフォルト] [変数] [計算式]          │
├────────────────────────────────────────────────────────────────────────┤
│ テンプレート変数                                          [＋ 追加]    │
│                                                                        │
│ ┌────────────────┬──────────────────────────────┬──────────────────┐  │
│ │ キー（変数名）  │ 値                            │                  │  │
│ ├────────────────┼──────────────────────────────┼──────────────────┤  │
│ │ 会社名         │ 株式会社山田商事               │ [編集] [削除]    │  │
│ │ 提出先         │ 渋谷税務署                    │ [編集] [削除]    │  │
│ │ 年度           │ 2026年度                      │ [編集] [削除]    │  │
│ └────────────────┴──────────────────────────────┴──────────────────┘  │
│                                                                        │
│ 変数の使い方: テキストボックスで @ を入力 → [変数] タブから選択         │
│                                                                        │
│                                  [キャンセル]  [保存]                  │
└────────────────────────────────────────────────────────────────────────┘
```

**[＋ 追加] クリック時のインライン行追加:**

```
│ [新しい変数名  ] │ [値を入力              ] │ [✓ 確定] [✕ キャンセル] │
```

バリデーション:
- キー: 空文字不可、重複不可、改行不可
- 値: 空文字可（= 値未設定の状態も許可。帳票作成時に入力する運用のため）

---

### 変数値の解決フロー

テンプレート変数には「テンプレートデフォルト値」のほかに、帳票実行時に「ランタイム上書き値」を提供できる設計にする（将来拡張）。

**Phase 1（シンプル）:**

```ts
// テンプレート変数の解決
function resolveTemplateVars(
  content: string,
  variables: TemplateVariable[]
): string {
  let result = content
  for (const v of variables) {
    result = result.replaceAll(`{{tplVar.${v.key}}}`, v.defaultValue)
  }
  return result
}
```

**Phase 2（ランタイム上書き対応）:**

```ts
// ReportRuntime に実行時の変数値をオーバーライドできる仕組みを追加
interface ReportRuntime {
  templateVariableOverrides?: Record<string, string>  // key → override value
}

function resolveTemplateVars(
  content: string,
  variables: TemplateVariable[],
  overrides: Record<string, string> = {}
): string {
  let result = content
  for (const v of variables) {
    const value = overrides[v.key] ?? v.defaultValue
    result = result.replaceAll(`{{tplVar.${v.key}}}`, value)
  }
  return result
}
```

---

### `CalculationRule` の型定義

計算式変数（`calc.*`）はデータソースのフィールドを使った集計・演算の結果を `{{calc.key}}` として参照できる仕組み。

```ts
interface CalculationRule {
  key: string         // 参照キー（例: 'totalIncome'）→ {{calc.totalIncome}}
  label: string       // 表示名（例: '課税所得合計'）
  description?: string
  expression: string  // 計算式（例: 'SUM(items[].income)'）
  format?: string     // 結果のフォーマット（例: '#,##0'、'YYYY年MM月DD日'）
  resultType: 'number' | 'string' | 'date'
}
```

**対応する計算式の種類（Phase 1）:**

| 関数 | 説明 | 例 |
|---|---|---|
| `SUM(field)` | 配列フィールドの合計 | `SUM(items[].income)` |
| `COUNT(field)` | 配列フィールドの件数 | `COUNT(items[])` |
| `AVG(field)` | 平均 | `AVG(items[].income)` |
| `MAX(field)` / `MIN(field)` | 最大・最小 | `MAX(items[].income)` |
| `field + field` | 加算 | `income - deduction` |
| `field * constant` | 定数倍 | `income * 0.1` |

**計算式エディタ:**  
`CalculationRule.expression` は [計算式] タブでは CodeMirror を使う。補完候補はデータソースフィールド一覧から生成。

---

### 変数の参照優先順序（全トークン統合）

```
1. データソース変数（DataSourceDefinition のフィールド）
   → {{employee.name}}, {{items[].income}}

2. テンプレート変数（TemplateVariable）
   → {{tplVar.会社名}}, {{tplVar.提出先}}

3. 計算式変数（CalculationRule）
   → {{calc.totalIncome}}, {{calc.taxAmount}}

4. システム変数（ランタイムで解決）
   → {{page.current}}, {{today}}, {{printedAt}}

5. 固定日付（コンパイル時解決）
   → {{const.2026-04-05}}
```

`interpolate()` 関数はこの順序でトークンを解決する。

---

### `@メンションピッカー` との対応

[変数] タブ（= `MentionTab.system` を拡張）に `tplVar.*` を表示:

```
[データ] [システム] [日付] [計算式] [テンプレート変数]
                                    ↑ 追加タブ
```

または、[システム] タブ内にグループとして含める:

```
[システム] タブ
──────────────────────────────
ページ番号     {{page.current}}
総ページ数     {{page.total}}
今日の日付     {{today}}
...
──────── テンプレート変数 ────
会社名         {{tplVar.会社名}}
提出先         {{tplVar.提出先}}
年度           {{tplVar.年度}}
```

**設計判断:** Phase 1 はシンプルに[システム]タブ内に「テンプレート変数」グループとしてまとめる。タブが増えると UI が煩雑になるため。

---

### ストアとの統合

`ReportDefinition` に `templateVariables` と `calculationRules` を追加することで、`reportStore` の既存の `updateReport()` アクションでそのまま管理できる。

```ts
// reportStore.ts に追加するアクション
updateTemplateVariables: (variables: TemplateVariable[]) => void
addTemplateVariable: (variable: TemplateVariable) => void
removeTemplateVariable: (key: string) => void
updateCalculationRule: (key: string, rule: Partial<CalculationRule>) => void
```

---

## `CalculationRule` の詳細設計

### 概要

`CalculationRule` は「データソースのフィールドを使って集計・演算した結果を変数として定義する仕組み」。
`{{calc.key}}` トークンで参照でき、定義はテンプレートレベルで管理する。

帳票での典型的なユースケース:
- 給与明細: 支給合計 = `SUM(items[].income)`
- 消費税: 税額 = `subtotal * 0.1`
- 件数表示: 明細件数 = `COUNT(items[])`

---

### 計算式の構文設計

**方針:** Excel ライクな関数記法を採用。学習コストが低く、帳票設計者に馴染みがある。

```
expression := term (operator term)*
term       := function_call | field_ref | number_literal | '(' expression ')'
operator   := '+' | '-' | '*' | '/'
function_call := FUNC_NAME '(' field_ref ')'
field_ref  := IDENTIFIER ('.' IDENTIFIER | '[]' '.' IDENTIFIER)*
FUNC_NAME  := 'SUM' | 'COUNT' | 'AVG' | 'MAX' | 'MIN' | 'IF'
```

**対応する式の例:**

```
SUM(items[].income)                    → items の income フィールドの合計
COUNT(items[])                         → items の件数
income - SUM(items[].deduction)        → トップレベルフィールド - 集計値
SUM(items[].income) * 0.1             → 集計値 × 定数
IF(totalIncome > 1000000, 0.2, 0.1)   → 条件分岐
SUM(items[].income) - SUM(items[].deduction)  → 集計値同士の演算
```

---

### `CalculationRule` 型定義（詳細版）

```ts
interface CalculationRule {
  key: string              // 参照キー（英数字・ドット・アンダースコア）
  label: string            // 表示名（日本語可、@ピッカーで表示）
  description?: string     // 用途の説明
  expression: string       // 計算式文字列
  format?: CalculationFormat  // 結果の表示フォーマット
  resultType: 'number' | 'string' | 'boolean'
  onError: 'zero' | 'empty' | 'error_text'  // 評価エラー時の挙動
}

type CalculationFormat =
  | { type: 'number'; pattern: string }   // '#,##0.00'、'0%' 等
  | { type: 'date';   pattern: string }   // 'YYYY/MM/DD'、'YYYY年MM月DD日' 等
  | { type: 'text';   prefix?: string; suffix?: string }  // '¥' + 数値 + '円'
  | { type: 'none' }                      // フォーマットなし（デフォルト）
```

---

### 計算式エバリュエーター

```ts
// src/lib/calculationEngine.ts

interface EvalContext {
  fields: Record<string, unknown>     // DataSource のフィールド値
  tplVars: Record<string, string>     // テンプレート変数
  calcResults: Record<string, number> // 他の CalculationRule の結果（依存関係解決後）
}

export function evaluateExpression(
  expression: string,
  context: EvalContext
): number | string | boolean {
  // 1. パース → AST
  const ast = parseExpression(expression)
  // 2. 評価
  return evalNode(ast, context)
}
```

**組み込み関数の実装:**

```ts
const BUILTINS: Record<string, (args: unknown[], context: EvalContext) => unknown> = {
  SUM: (args) => {
    const array = args[0] as unknown[]
    return Array.isArray(array)
      ? array.reduce((acc, v) => acc + (Number(v) || 0), 0)
      : 0
  },
  COUNT: (args) => {
    const array = args[0] as unknown[]
    return Array.isArray(array) ? array.length : 0
  },
  AVG: (args) => {
    const array = args[0] as unknown[]
    if (!Array.isArray(array) || array.length === 0) return 0
    return array.reduce((acc, v) => acc + (Number(v) || 0), 0) / array.length
  },
  MAX: (args) => {
    const array = args[0] as unknown[]
    return Array.isArray(array) ? Math.max(...array.map(Number)) : 0
  },
  MIN: (args) => {
    const array = args[0] as unknown[]
    return Array.isArray(array) ? Math.min(...array.map(Number)) : 0
  },
  IF: (args) => {
    const [condition, trueVal, falseVal] = args
    return condition ? trueVal : falseVal
  },
}
```

---

### ルール間の依存関係と評価順序

計算式は他の `calc.*` ルールを参照できる（例: `taxAmount = totalIncome * 0.1`）。
循環参照を防ぐため、評価前にトポロジカルソートを行う。

```ts
export function sortCalculationRules(rules: CalculationRule[]): CalculationRule[] {
  // calc.* への参照を解析してトポロジカルソート
  // 循環参照を検出した場合は CircularDependencyError をスロー
  const deps = buildDependencyGraph(rules)
  return topologicalSort(rules, deps)
}

// 循環参照エラー
class CircularDependencyError extends Error {
  constructor(public cycle: string[]) {
    super(`循環参照: ${cycle.join(' → ')}`)
  }
}
```

---

### エラーハンドリング

| エラー種別 | 例 | `onError: 'zero'` | `onError: 'empty'` | `onError: 'error_text'` |
|---|---|---|---|---|
| 参照フィールドが存在しない | `SUM(nonexistent[].val)` | `0` | `""` | `"#REF!"` |
| ゼロ除算 | `income / count` で count=0 | `0` | `""` | `"#DIV/0!"` |
| 型不一致 | `SUM("text")` | `0` | `""` | `"#VALUE!"` |
| 計算式の構文エラー | `SUM(items[` | `0` | `""` | `"#PARSE!"` |
| 循環参照 | `calc.a` → `calc.b` → `calc.a` | `0` | `""` | `"#CIRC!"` |

---

### 計算式エディタ UI

「テンプレート設定」の **[計算式]** タブ。

```
┌─── テンプレート設定 ─────────────────────────────────────────────────┐
│ [メタデータ] [ページ設定] [テキストデフォルト] [変数] [計算式]          │
├────────────────────────────────────────────────────────────────────────┤
│ 計算式変数                                               [＋ 追加]    │
│                                                                        │
│ ┌─────────────────┬──────────────────────────────────────────────────┐ │
│ │ キー（変数名）   │ 計算式                                           │ │
│ ├─────────────────┼──────────────────────────────────────────────────┤ │
│ │ totalIncome     │ SUM(items[].income)                    [編集][削] │ │
│ │ taxAmount       │ totalIncome * 0.1                      [編集][削] │ │
│ │ netIncome       │ totalIncome - taxAmount                [編集][削] │ │
│ └─────────────────┴──────────────────────────────────────────────────┘ │
│                                                                        │
│ ── 編集中: taxAmount ──────────────────────────────────────────────── │
│ キー:   [taxAmount            ]                                        │
│ 表示名: [税額                 ]                                        │
│ 計算式: ┌ CodeMirror ──────────────────────────────────────────────┐  │
│         │ totalIncome * 0.1                                        │  │
│         └──────────────────────────────────────────────────────────┘  │
│ フォーマット: [数値 ▼]  パターン: [#,##0]                             │
│ エラー時:    [0を表示 ▼]                                              │
│ プレビュー:  ¥12,500（サンプルデータで評価した結果）                    │
│                                              [キャンセル]  [保存]      │
└────────────────────────────────────────────────────────────────────────┘
```

**CodeMirror の設定:**
- 構文ハイライト: 独自の計算式言語定義（`@lezer/highlight` で実装）
- 補完: `completionSource` でデータソースフィールドと `calc.*` ルールを候補に
- エラー表示: `linter` で構文エラーをリアルタイム表示

**プレビュー機能:**
- データソースにサンプルデータが設定されている場合、式を評価して結果をリアルタイム表示
- フォーマット適用後の表示（例: `12500` → `¥12,500`）
- エラーの場合はエラーコード表示

---

### フォーマットパターン

**数値フォーマット（Intl.NumberFormat ベース）:**

| パターン | 例 | 結果 |
|---|---|---|
| `#,##0` | 12500 | `12,500` |
| `#,##0.00` | 12500 | `12,500.00` |
| `0%` | 0.15 | `15%` |
| `¥#,##0` | 12500 | `¥12,500` |

**日付フォーマット（結果が日付文字列の場合）:**

| パターン | 結果 |
|---|---|
| `YYYY/MM/DD` | `2026/04/05` |
| `YYYY年MM月DD日` | `2026年04月05日` |
| `MM/DD` | `04/05` |

---

## 計算式パーサの AST 設計

### 方針

手書きの再帰降下パーサを使う。外部ライブラリを使わず、計算式言語の仕様を完全に制御できる。
実装量は 200〜300 行程度で十分カバーできる。

---

### AST ノード型定義

```ts
// src/lib/calculationEngine.ts

// リテラル
type NumberLiteralNode = { type: 'NumberLiteral'; value: number }
type StringLiteralNode = { type: 'StringLiteral'; value: string }
type BooleanLiteralNode = { type: 'BooleanLiteral'; value: boolean }

// フィールド参照
// 例: income → { type: 'FieldRef', path: ['income'] }
// 例: items[].income → { type: 'FieldRef', path: ['items[]', 'income'] }
// 例: calc.totalIncome → { type: 'CalcRef', key: 'totalIncome' }
type FieldRefNode = { type: 'FieldRef'; path: string[] }
type CalcRefNode  = { type: 'CalcRef'; key: string }

// 関数呼び出し
// 例: SUM(items[].income)
type FunctionCallNode = {
  type: 'FunctionCall'
  name: 'SUM' | 'COUNT' | 'AVG' | 'MAX' | 'MIN' | 'IF'
  args: ASTNode[]
}

// 二項演算子
type BinaryOpNode = {
  type: 'BinaryOp'
  op: '+' | '-' | '*' | '/'
  left: ASTNode
  right: ASTNode
}

// 比較演算子（IF の条件で使用）
type CompareNode = {
  type: 'Compare'
  op: '>' | '<' | '>=' | '<=' | '==' | '!='
  left: ASTNode
  right: ASTNode
}

// 単項マイナス
type UnaryMinusNode = { type: 'UnaryMinus'; operand: ASTNode }

// 全ノードの Union
type ASTNode =
  | NumberLiteralNode
  | StringLiteralNode
  | BooleanLiteralNode
  | FieldRefNode
  | CalcRefNode
  | FunctionCallNode
  | BinaryOpNode
  | CompareNode
  | UnaryMinusNode
```

---

### パーサの文法（優先順位順）

```
expression    := comparison
comparison    := additive (('>' | '<' | '>=' | '<=' | '==' | '!=') additive)?
additive      := multiplicative (('+' | '-') multiplicative)*
multiplicative := unary ('*' | '/' unary)*
unary         := '-' unary | primary
primary       := function_call | field_ref | number_literal | string_literal | '(' expression ')'
function_call := FUNC_NAME '(' args ')'
args          := expression (',' expression)*  |  ε
field_ref     := IDENTIFIER ('[]'? '.' IDENTIFIER)*
```

---

### パーサ実装（スケッチ）

```ts
class ExpressionParser {
  private tokens: Token[]
  private pos = 0

  constructor(expression: string) {
    this.tokens = tokenize(expression)
  }

  parse(): ASTNode {
    const node = this.parseComparison()
    if (this.pos < this.tokens.length) {
      throw new ParseError(`予期しないトークン: ${this.tokens[this.pos].value}`)
    }
    return node
  }

  private parseComparison(): ASTNode {
    let left = this.parseAdditive()
    const ops = ['>', '<', '>=', '<=', '==', '!='] as const
    while (this.match(...ops)) {
      const op = this.previous().value as CompareNode['op']
      const right = this.parseAdditive()
      left = { type: 'Compare', op, left, right }
    }
    return left
  }

  private parseAdditive(): ASTNode {
    let left = this.parseMultiplicative()
    while (this.match('+', '-')) {
      const op = this.previous().value as '+' | '-'
      const right = this.parseMultiplicative()
      left = { type: 'BinaryOp', op, left, right }
    }
    return left
  }

  private parseMultiplicative(): ASTNode {
    let left = this.parseUnary()
    while (this.match('*', '/')) {
      const op = this.previous().value as '*' | '/'
      const right = this.parseUnary()
      left = { type: 'BinaryOp', op, left, right }
    }
    return left
  }

  private parseUnary(): ASTNode {
    if (this.match('-')) {
      const operand = this.parseUnary()
      return { type: 'UnaryMinus', operand }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): ASTNode {
    // 数値リテラル
    if (this.check('NUMBER')) {
      return { type: 'NumberLiteral', value: Number(this.advance().value) }
    }
    // 文字列リテラル
    if (this.check('STRING')) {
      const raw = this.advance().value
      return { type: 'StringLiteral', value: raw.slice(1, -1) }  // クォート除去
    }
    // 括弧
    if (this.match('(')) {
      const expr = this.parseComparison()
      this.expect(')', '括弧が閉じられていません')
      return expr
    }
    // 関数呼び出し または フィールド参照
    if (this.check('IDENTIFIER')) {
      const name = this.advance().value
      if (this.match('(')) {
        return this.parseFunctionCall(name)
      }
      return this.parseFieldRefFromName(name)
    }
    throw new ParseError(`予期しないトークン: ${this.peek()?.value ?? 'EOF'}`)
  }

  private parseFunctionCall(name: string): FunctionCallNode {
    const VALID_FUNCS = ['SUM', 'COUNT', 'AVG', 'MAX', 'MIN', 'IF']
    if (!VALID_FUNCS.includes(name.toUpperCase())) {
      throw new ParseError(`未知の関数: ${name}`)
    }
    const args: ASTNode[] = []
    if (!this.check(')')) {
      args.push(this.parseComparison())
      while (this.match(',')) {
        args.push(this.parseComparison())
      }
    }
    this.expect(')', `関数 ${name} の括弧が閉じられていません`)
    return { type: 'FunctionCall', name: name.toUpperCase() as FunctionCallNode['name'], args }
  }

  private parseFieldRefFromName(firstName: string): FieldRefNode | CalcRefNode {
    // calc.key → CalcRefNode
    if (firstName === 'calc' && this.match('.')) {
      const key = this.expect('IDENTIFIER', 'calc. の後にキーが必要です').value
      return { type: 'CalcRef', key }
    }
    // items[].income のような配列パス
    const path: string[] = [firstName]
    while (this.match('.')) {
      if (this.match('[')) {
        this.expect(']', '[] の閉じ括弧が必要です')
        const prev = path[path.length - 1]
        path[path.length - 1] = `${prev}[]`
      }
      const segment = this.expect('IDENTIFIER', 'フィールド名が必要です').value
      path.push(segment)
    }
    if (this.match('[')) {
      this.expect(']', '[] の閉じ括弧が必要です')
      path[path.length - 1] = `${path[path.length - 1]}[]`
    }
    return { type: 'FieldRef', path }
  }
}
```

---

### エバリュエーター（AST → 値）

```ts
function evalNode(node: ASTNode, ctx: EvalContext): unknown {
  switch (node.type) {
    case 'NumberLiteral':  return node.value
    case 'StringLiteral':  return node.value
    case 'BooleanLiteral': return node.value

    case 'FieldRef': {
      // path を辿って ctx.fields から値を取得
      // 'items[].income' → ctx.fields.items の各要素の income を配列で返す
      return resolveFieldPath(node.path, ctx.fields)
    }

    case 'CalcRef': {
      if (!(node.key in ctx.calcResults)) {
        throw new EvalError(`未定義の計算式変数: calc.${node.key}`)
      }
      return ctx.calcResults[node.key]
    }

    case 'FunctionCall': {
      const evaluatedArgs = node.args.map((a) => evalNode(a, ctx))
      const fn = BUILTINS[node.name]
      return fn(evaluatedArgs, ctx)
    }

    case 'BinaryOp': {
      const l = Number(evalNode(node.left, ctx))
      const r = Number(evalNode(node.right, ctx))
      if (node.op === '/' && r === 0) throw new DivisionByZeroError()
      return { '+': l + r, '-': l - r, '*': l * r, '/': l / r }[node.op]
    }

    case 'Compare': {
      const l = evalNode(node.left, ctx)
      const r = evalNode(node.right, ctx)
      return {
        '>': () => Number(l) > Number(r),
        '<': () => Number(l) < Number(r),
        '>=': () => Number(l) >= Number(r),
        '<=': () => Number(l) <= Number(r),
        '==': () => l == r,   // 意図的な == (型変換あり)
        '!=': () => l != r,
      }[node.op]()
    }

    case 'UnaryMinus':
      return -Number(evalNode(node.operand, ctx))
  }
}
```

---

### `resolveFieldPath()` — 配列フィールドのパス解決

```ts
function resolveFieldPath(path: string[], fields: Record<string, unknown>): unknown {
  let current: unknown = fields

  for (const segment of path) {
    if (current === null || current === undefined) return undefined

    if (segment.endsWith('[]')) {
      // 配列フィールド: 以降のセグメントの値を配列にまとめて返す
      const key = segment.slice(0, -2)
      const arr = (current as Record<string, unknown>)[key]
      if (!Array.isArray(arr)) return undefined
      // 残りのパスを各要素に適用して配列で返す
      // ※ ここでは単純化: items[].income の場合は arr の income を返す
      return arr
    }

    current = (current as Record<string, unknown>)[segment]
  }

  return current
}

// items[].income のような「配列の特定フィールドを集める」パターン
// SUM(items[].income) → items の各要素の income を合計
// 実際には: SUM の引数評価時に items[] を解決し、
//           income プロパティを各要素から取り出す
```

---

### エラー型

```ts
class ParseError  extends Error { constructor(msg: string) { super(msg) } }
class EvalError   extends Error { constructor(msg: string) { super(msg) } }
class DivisionByZeroError extends EvalError { constructor() { super('ゼロ除算') } }
class CircularDependencyError extends Error {
  constructor(public cycle: string[]) { super(`循環参照: ${cycle.join(' → ')}`) }
}
```

---

### テストケース一覧

```ts
// src/lib/calculationEngine.test.ts

describe('parseExpression', () => {
  test('数値リテラル', () => expect(evaluate('42', ctx)).toBe(42))
  test('加算', () => expect(evaluate('1 + 2', ctx)).toBe(3))
  test('演算子優先順位', () => expect(evaluate('1 + 2 * 3', ctx)).toBe(7))
  test('括弧', () => expect(evaluate('(1 + 2) * 3', ctx)).toBe(9))
  test('負数', () => expect(evaluate('-5', ctx)).toBe(-5))
  test('単項マイナス', () => expect(evaluate('-(1 + 2)', ctx)).toBe(-3))
  test('フィールド参照', () => expect(evaluate('income', ctxWith({ income: 100 }))).toBe(100))
  test('SUM', () => expect(evaluate('SUM(items[].income)', ctxWithArray)).toBe(300))
  test('COUNT', () => expect(evaluate('COUNT(items[])', ctxWithArray)).toBe(3))
  test('IF 真', () => expect(evaluate('IF(1 > 0, 10, 20)', ctx)).toBe(10))
  test('IF 偽', () => expect(evaluate('IF(0 > 1, 10, 20)', ctx)).toBe(20))
  test('ゼロ除算', () => expect(() => evaluate('1 / 0', ctx)).toThrow(DivisionByZeroError))
  test('未知の関数', () => expect(() => parseExpression('UNKNOWN(x)')).toThrow(ParseError))
  test('括弧未閉', () => expect(() => parseExpression('(1 + 2')).toThrow(ParseError))
  test('calc 参照', () => expect(evaluate('calc.total', ctxWithCalc)).toBe(500))
  test('循環参照', () => expect(() => sortRules(circularRules)).toThrow(CircularDependencyError))
})
```

---

## 数値フォーマットの詳細設計

### 方針

- ベース実装は `Intl.NumberFormat` を使う（ブラウザ組み込み、多言語対応）
- Excel ライクなパターン文字列を独自パーサでパース → `Intl.NumberFormat` オプションに変換
- 日本語数値語彙（万・億）は独自処理で対応

---

### `CalculationFormat` 拡張型定義

```ts
type CalculationFormat =
  | { type: 'number'; pattern: string }
  | { type: 'date';   pattern: string }
  | { type: 'text';   prefix?: string; suffix?: string }
  | { type: 'none' }
```

---

### 数値パターン仕様

```
pattern    := prefix? format_core suffix?
prefix     := '"' [^"]* '"'              // 例: "¥"
suffix     := '"' [^"]* '"'             // 例: "円"
format_core :=
  | '#,##0' ('.' '#'*)? ('%')?           // カンマ区切り（小数点以下は任意）
  | '0' ('.' '0'*)? ('%')?              // 固定桁数
  | '万' '#,##0' (小数)?                 // 万単位
  | '億' '#,##0' (小数)?                 // 億単位
```

**サポートするパターン一覧:**

| パターン | 入力 | 出力 | 用途 |
|---|---|---|---|
| `#,##0` | 12500 | `12,500` | 一般数値 |
| `#,##0.00` | 12500 | `12,500.00` | 小数2桁 |
| `#,##0.##` | 12500.5 | `12,500.5` | 可変小数 |
| `0` | 12500 | `12500` | カンマなし |
| `0.00` | 1.5 | `1.50` | 固定小数 |
| `0%` | 0.15 | `15%` | パーセント（×100）|
| `0.0%` | 0.155 | `15.5%` | 小数パーセント |
| `¥#,##0` | 12500 | `¥12,500` | 円記号付き |
| `#,##0円` | 12500 | `12,500円` | 円単位 |
| `#,##0万円` | 125000000 | `12,500万円` | 万単位 |
| `#,##0.0億円` | 1500000000 | `15.0億円` | 億単位 |
| `+#,##0;-#,##0` | -5000 | `-5,000` | 符号付き |

---

### パターンパーサと `Intl.NumberFormat` へのマッピング

```ts
// src/lib/numberFormatter.ts

interface ParsedNumberFormat {
  prefix: string
  suffix: string
  useGrouping: boolean        // カンマ区切り
  minimumFractionDigits: number
  maximumFractionDigits: number
  isPercent: boolean          // × 100 して % 表示
  unit?: '万' | '億'          // 日本語単位
}

export function parseNumberPattern(pattern: string): ParsedNumberFormat {
  let rest = pattern
  let prefix = ''
  let suffix = ''
  let unit: '万' | '億' | undefined

  // prefix 抽出（先頭の非パターン文字）
  const prefixMatch = rest.match(/^([¥$€£]?)/)
  prefix = prefixMatch?.[1] ?? ''
  rest = rest.slice(prefix.length)

  // 万・億単位
  if (rest.startsWith('万')) { unit = '万'; rest = rest.slice(1) }
  if (rest.startsWith('億')) { unit = '億'; rest = rest.slice(1) }

  // パーセント
  const isPercent = rest.endsWith('%')
  if (isPercent) rest = rest.slice(0, -1)

  // suffix 抽出（末尾の非パターン文字）
  const suffixMatch = rest.match(/([^#0,.]*)$/)
  suffix = suffixMatch?.[1] ?? ''
  rest = rest.slice(0, rest.length - suffix.length)

  const useGrouping = rest.includes(',')
  const dotIndex = rest.indexOf('.')
  let minFraction = 0
  let maxFraction = 0

  if (dotIndex !== -1) {
    const fractionPart = rest.slice(dotIndex + 1)
    minFraction = (fractionPart.match(/0/g) ?? []).length
    maxFraction = fractionPart.length
  }

  return { prefix, suffix, useGrouping, minimumFractionDigits: minFraction, maximumFractionDigits: maxFraction, isPercent, unit }
}

export function formatNumber(value: number, pattern: string): string {
  const fmt = parseNumberPattern(pattern)
  let num = value

  // パーセント変換（Intl に任せると × 100 される）
  if (fmt.isPercent) num = num * 100

  // 万・億変換
  if (fmt.unit === '万') num = num / 10000
  if (fmt.unit === '億') num = num / 100000000

  const intlFormatter = new Intl.NumberFormat('ja-JP', {
    useGrouping:             fmt.useGrouping,
    minimumFractionDigits:   fmt.minimumFractionDigits,
    maximumFractionDigits:   fmt.maximumFractionDigits,
  })

  const formatted = intlFormatter.format(num)
  const unitSuffix = fmt.unit ?? ''
  const percentSuffix = fmt.isPercent ? '%' : ''

  return `${fmt.prefix}${formatted}${unitSuffix}${percentSuffix}${fmt.suffix}`
}
```

---

### 日付フォーマット

`CalculationRule.resultType === 'date'` の場合、結果を日付として解釈してフォーマットする。

```ts
// src/lib/dateFormatter.ts

export function formatDate(value: string | Date, pattern: string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (isNaN(date.getTime())) return String(value)

  const tokens: Record<string, string> = {
    'YYYY': String(date.getFullYear()),
    'MM':   String(date.getMonth() + 1).padStart(2, '0'),
    'DD':   String(date.getDate()).padStart(2, '0'),
    'HH':   String(date.getHours()).padStart(2, '0'),
    'mm':   String(date.getMinutes()).padStart(2, '0'),
    'ss':   String(date.getSeconds()).padStart(2, '0'),
    '年':   '年',
    '月':   '月',
    '日':   '日',
  }

  // パターン内の YYYY/MM/DD/HH/mm/ss を順に置換
  return pattern.replace(/YYYY|MM|DD|HH|mm|ss/g, (t) => tokens[t] ?? t)
}
```

**サポートするパターン:**

| パターン | 出力 |
|---|---|
| `YYYY/MM/DD` | `2026/04/05` |
| `YYYY-MM-DD` | `2026-04-05` |
| `YYYY年MM月DD日` | `2026年04月05日` |
| `MM/DD` | `04/05` |
| `YYYY年MM月` | `2026年04月` |
| `YYYY/MM/DD HH:mm` | `2026/04/05 09:30` |

---

### `applyFormat()` — 統合フォーマット関数

```ts
// src/lib/calculationEngine.ts

export function applyFormat(
  value: number | string | boolean,
  format: CalculationFormat
): string {
  switch (format.type) {
    case 'none':
      return String(value)

    case 'number':
      if (typeof value !== 'number') return String(value)
      return formatNumber(value, format.pattern)

    case 'date':
      return formatDate(String(value), format.pattern)

    case 'text':
      return `${format.prefix ?? ''}${value}${format.suffix ?? ''}`
  }
}
```

---

### UI — フォーマット選択パネル

計算式エディタのフォーマット設定部分:

```
フォーマット: [数値 ▼]      ← type 選択
              ├─ なし
              ├─ 数値
              ├─ 日付
              └─ テキスト

[数値を選択した場合]
パターン: [#,##0  ▼]        ← よく使うパターンのプリセット
          ├─ #,##0          （12,500）
          ├─ #,##0.00       （12,500.00）
          ├─ 0%             （15%）
          ├─ ¥#,##0         （¥12,500）
          ├─ #,##0万円       （1,250万円）
          └─ カスタム…       ← 自由入力
プレビュー: 12,500           ← サンプル値で評価した結果

[日付を選択した場合]
パターン: [YYYY/MM/DD ▼]
プレビュー: 2026/04/05
```

---

### テストケース

```ts
describe('formatNumber', () => {
  test('#,##0',       () => expect(formatNumber(12500, '#,##0')).toBe('12,500'))
  test('#,##0.00',    () => expect(formatNumber(12500, '#,##0.00')).toBe('12,500.00'))
  test('¥#,##0',     () => expect(formatNumber(12500, '¥#,##0')).toBe('¥12,500'))
  test('#,##0円',    () => expect(formatNumber(12500, '#,##0円')).toBe('12,500円'))
  test('0%',         () => expect(formatNumber(0.15, '0%')).toBe('15%'))
  test('0.0%',       () => expect(formatNumber(0.155, '0.0%')).toBe('15.5%'))
  test('万単位',      () => expect(formatNumber(125000000, '#,##0万円')).toBe('12,500万円'))
  test('億単位',      () => expect(formatNumber(1500000000, '#,##0.0億円')).toBe('15.0億円'))
  test('負数',        () => expect(formatNumber(-5000, '#,##0')).toBe('-5,000'))
  test('ゼロ',        () => expect(formatNumber(0, '#,##0')).toBe('0'))
  test('小数可変',    () => expect(formatNumber(12500.5, '#,##0.##')).toBe('12,500.5'))
})

describe('formatDate', () => {
  test('YYYY/MM/DD',     () => expect(formatDate('2026-04-05', 'YYYY/MM/DD')).toBe('2026/04/05'))
  test('YYYY年MM月DD日', () => expect(formatDate('2026-04-05', 'YYYY年MM月DD日')).toBe('2026年04月05日'))
  test('無効な日付',      () => expect(formatDate('invalid', 'YYYY/MM/DD')).toBe('invalid'))
})
```

---

## IF 条件式の拡張設計

### 拡張の方針

基本 `IF(condition, trueVal, falseVal)` に加えて:
1. **ネスト IF** — `IF(a, b, IF(c, d, e))`
2. **AND / OR 論理演算子** — `AND(a > 0, b < 100)`
3. **文字列条件関数** — `CONTAINS` / `STARTS_WITH` / `ENDS_WITH`
4. **NULL チェック** — `ISBLANK(field)` / `ISNOTEMPTY(field)`

---

### 拡張後の文法

```
expression    := comparison
comparison    := logical_or
logical_or    := logical_and ('OR' logical_and)*
logical_and   := additive ('AND' additive)*
additive      := multiplicative (('+' | '-') multiplicative)*
multiplicative := unary ('*' | '/' unary)*
unary         := ('NOT' | '-') unary | primary
primary       := function_call | field_ref | literal | '(' expression ')'

function_call :=
  | 'IF'         '(' expression ',' expression ',' expression ')'
  | 'AND'        '(' expression (',' expression)+ ')'
  | 'OR'         '(' expression (',' expression)+ ')'
  | 'NOT'        '(' expression ')'
  | 'CONTAINS'   '(' field_ref ',' string_literal ')'
  | 'STARTS_WITH''(' field_ref ',' string_literal ')'
  | 'ENDS_WITH'  '(' field_ref ',' string_literal ')'
  | 'ISBLANK'    '(' field_ref ')'
  | 'ISNOTEMPTY' '(' field_ref ')'
  | 'SUM' | 'COUNT' | 'AVG' | 'MAX' | 'MIN' (既存)
```

---

### AST ノード追加

```ts
// 論理演算子（AND / OR）
type LogicalOpNode = {
  type: 'LogicalOp'
  op: 'AND' | 'OR'
  operands: ASTNode[]  // 2個以上
}

// 論理否定
type NotNode = {
  type: 'Not'
  operand: ASTNode
}

// 文字列条件
type StringConditionNode = {
  type: 'StringCondition'
  fn: 'CONTAINS' | 'STARTS_WITH' | 'ENDS_WITH'
  field: FieldRefNode
  value: StringLiteralNode
}

// NULL / 空文字チェック
type IsBlankNode   = { type: 'IsBlank';    field: FieldRefNode }
type IsNotEmptyNode = { type: 'IsNotEmpty'; field: FieldRefNode }

// 全ノードの Union 更新
type ASTNode = ... | LogicalOpNode | NotNode | StringConditionNode | IsBlankNode | IsNotEmptyNode
```

---

### エバリュエーター拡張

```ts
case 'LogicalOp': {
  const results = node.operands.map((o) => Boolean(evalNode(o, ctx)))
  return node.op === 'AND'
    ? results.every(Boolean)
    : results.some(Boolean)
}

case 'Not':
  return !Boolean(evalNode(node.operand, ctx))

case 'StringCondition': {
  const str = String(resolveFieldPath(node.field.path, ctx.fields) ?? '')
  const val = node.value.value
  switch (node.fn) {
    case 'CONTAINS':    return str.includes(val)
    case 'STARTS_WITH': return str.startsWith(val)
    case 'ENDS_WITH':   return str.endsWith(val)
  }
}

case 'IsBlank': {
  const val = resolveFieldPath(node.field.path, ctx.fields)
  return val === null || val === undefined || val === ''
}

case 'IsNotEmpty': {
  const val = resolveFieldPath(node.field.path, ctx.fields)
  return val !== null && val !== undefined && val !== ''
}
```

**BUILTINS への追加（関数呼び出し形式）:**

```ts
AND:        (args) => args.every(Boolean),
OR:         (args) => args.some(Boolean),
NOT:        (args) => !Boolean(args[0]),
ISBLANK:    (args) => args[0] === null || args[0] === undefined || args[0] === '',
ISNOTEMPTY: (args) => args[0] !== null && args[0] !== undefined && args[0] !== '',
CONTAINS:   (args) => String(args[0]).includes(String(args[1])),
STARTS_WITH:(args) => String(args[0]).startsWith(String(args[1])),
ENDS_WITH:  (args) => String(args[0]).endsWith(String(args[1])),
```

---

### 使用例

**ネスト IF:**
```
IF(income > 5000000,
  "高所得",
  IF(income > 3000000,
    "中所得",
    "標準"
  )
)
```

**AND / OR:**
```
IF(AND(age >= 65, CONTAINS(category, "障害")), "特別控除対象", "通常")
```

**文字列条件:**
```
IF(STARTS_WITH(code, "A"), "区分A", "その他")
```

**ISBLANK:**
```
IF(ISBLANK(employee.department), "部署未設定", employee.department)
```

---

### `visibilityRule` との統合

`ElementBase.visibilityRule?: string` は同じ計算式エンジンで評価する。
条件式は `boolean` を返す必要があり、`false` の場合は要素を非表示にする。

```ts
// ElementRenderer.tsx での visibilityRule 評価
const isVisible = useMemo(() => {
  if (!element.visibilityRule) return true
  try {
    const result = evaluateExpression(element.visibilityRule, evalCtx)
    return Boolean(result)
  } catch {
    return true  // エラー時は表示扱い（安全側）
  }
}, [element.visibilityRule, evalCtx])
```

**設計判断:** `visibilityRule` は `CalculationRule` とは独立した式として `ElementBase` に設定する。
同じ `evaluateExpression()` を使うため、IF / AND / OR / CONTAINS などをそのまま使える。

---

### テストケース追加

```ts
describe('IF 条件式拡張', () => {
  test('ネスト IF',
    () => expect(evaluate(
      'IF(income > 5000000, "高", IF(income > 3000000, "中", "低"))',
      ctxWith({ income: 4000000 })
    )).toBe('中'))

  test('AND',
    () => expect(evaluate(
      'IF(AND(age >= 18, age < 65), "現役", "その他")',
      ctxWith({ age: 30 })
    )).toBe('現役'))

  test('OR',
    () => expect(evaluate(
      'IF(OR(status == "A", status == "B"), "優先", "通常")',
      ctxWith({ status: 'B' })
    )).toBe('優先'))

  test('NOT',
    () => expect(evaluate('IF(NOT(ISBLANK(name)), name, "匿名")',
      ctxWith({ name: '山田太郎' })
    )).toBe('山田太郎'))

  test('CONTAINS',
    () => expect(evaluate(
      'IF(CONTAINS(category, "特別"), "対象", "対象外")',
      ctxWith({ category: '特別控除' })
    )).toBe('対象'))

  test('ISBLANK',
    () => expect(evaluate('ISBLANK(field)', ctxWith({ field: '' }))).toBe(true))

  test('ISNOTEMPTY',
    () => expect(evaluate('ISNOTEMPTY(field)', ctxWith({ field: '値' }))).toBe(true))

  test('複合条件（AND + CONTAINS）',
    () => expect(evaluate(
      'AND(income > 0, CONTAINS(type, "給与"))',
      ctxWith({ income: 100000, type: '給与所得' })
    )).toBe(true))
})
```

---

## テスト戦略

### テストの全体構成

```
src/
  lib/
    tokenParser.test.ts           ← 単体テスト
    calculationEngine.test.ts     ← 単体テスト
    textStyleUtils.test.ts        ← 単体テスト
    numberFormatter.test.ts       ← 単体テスト
    dateFormatter.test.ts         ← 単体テスト
  hooks/
    useInlineEdit.test.ts         ← Hook テスト（@testing-library/react）
  components/canvas/
    TextElementRenderer.test.tsx  ← コンポーネント単体テスト
    TextInlineEditor.test.tsx     ← インライン編集の統合テスト
    MentionPicker.test.tsx        ← ピッカーの操作テスト
```

**カバレッジ目標: 80%以上**（testing.md に準拠）

---

### `tokenParser.test.ts` — トークンパーサ

```ts
describe('parseTokens', () => {
  test('テキストのみ',       () => expect(parseTokens('hello')).toEqual([{ type: 'text', value: 'hello' }]))
  test('トークンのみ',       () => expect(parseTokens('{{name}}')).toEqual([{ type: 'token', key: 'name', raw: '{{name}}' }]))
  test('テキスト + トークン', () => /* 氏名は {{employee.name}} です */)
  test('複数トークン',       () => /* {{a}} と {{b}} */)
  test('ネストなし誤字',     () => /* {name} はトークンではない */)
  test('空文字',            () => expect(parseTokens('')).toEqual([]))
  test('calc. 参照',        () => /* {{calc.total}} */)
  test('tplVar 日本語',     () => /* {{tplVar.会社名}} */)
})

describe('insertMentionToken', () => {
  test('基本挿入',     () => /* '氏名は @em' → '氏名は {{employee.name}}' */)
  test('末尾への挿入', () => /* '@name' → '{{employee.name}}' */)
  test('中間への挿入', () => /* 'before @em after' → 'before {{employee.name}} after' */)
  test('query 0文字', () => /* '@' → '{{employee.name}}' */)
  test('カーソル位置', () => /* newCursorOffset の検証 */)
})

describe('detectMentionTrigger', () => {
  test('@ のみ',         () => /* { triggerIndex: 0, query: '' } */)
  test('@ + query',      () => /* { triggerIndex: X, query: 'em' } */)
  test('email アドレス', () => /* null (@ 前が単語文字) */)
  test('@ + 空白',       () => /* null (query に空白) */)
  test('@ なし',         () => /* null */)
})
```

---

### `calculationEngine.test.ts` — 計算エンジン

```ts
describe('parseExpression + evaluate', () => {
  // 基本演算
  test('加算', test('減算', test('乗算', test('除算',
  test('演算子優先順位', test('括弧',

  // フィールド参照
  test('単純フィールド', test('ネストフィールド', test('配列フィールド',

  // 集計関数
  test('SUM', test('COUNT', test('AVG', test('MAX', test('MIN',

  // 条件
  test('IF 真', test('IF 偽', test('ネスト IF',
  test('AND', test('OR', test('NOT',
  test('CONTAINS', test('STARTS_WITH', test('ENDS_WITH',
  test('ISBLANK 空', test('ISBLANK null', test('ISNOTEMPTY',

  // 比較演算子
  test('>', test('<', test('>=', test('<=', test('==', test('!=',

  // エラーケース
  test('ゼロ除算',       () => expect(() => evaluate('1/0', ctx)).toThrow(DivisionByZeroError))
  test('未知関数',        () => expect(() => parseExpression('UNKNOWN(x)')).toThrow(ParseError))
  test('括弧未閉',        () => expect(() => parseExpression('(1+2')).toThrow(ParseError))
  test('循環参照',        () => expect(() => sortRules(circular)).toThrow(CircularDependencyError))
  test('未定義フィールド', () => /* onError 設定に応じた動作 */)
})

describe('sortCalculationRules', () => {
  test('依存なし',         () => /* 元の順序が維持 */)
  test('依存あり',         () => /* netIncome は totalIncome の後 */)
  test('循環参照検出',     () => /* throws CircularDependencyError */)
})

describe('applyFormat', () => {
  test('type: none',   () => expect(applyFormat(42, { type: 'none' })).toBe('42'))
  test('type: number', () => /* '#,##0' */)
  test('type: date',   () => /* 'YYYY/MM/DD' */)
  test('type: text',   () => /* prefix + value + suffix */)
})
```

---

### `useInlineEdit.test.ts` — Hook テスト

```ts
// @testing-library/react の renderHook を使用

describe('useInlineEdit', () => {
  test('初期状態は isEditing = false')
  test('enterEditMode() で isEditing = true になる')
  test('commitEdit() で onCommit が呼ばれ isEditing = false になる')
  test('cancelEdit() で onCancel が呼ばれ content が元に戻る')
  test('Enter キーで commitEdit が発火する')
  test('Escape キーで cancelEdit が発火する')
  test('IME 変換中は input を無視する（isComposing = true）')
  test('compositionEnd 後に content が更新される')
  test('@ 入力で mentionState が設定される')
  test('handleMentionSelect() でトークンが挿入される')
  test('email アドレスの @ では mentionState が設定されない')
})
```

---

### `TextInlineEditor.test.tsx` — 統合テスト

```tsx
// ユーザー操作のシミュレーション

describe('TextInlineEditor', () => {
  test('ダブルクリックで編集モードに入る')
  test('テキスト入力後 Enter で確定される')
  test('Escape で変更がキャンセルされる')
  test('フォーカスアウトで確定される')
  test('@ 入力で MentionPicker が表示される')
  test('MentionPicker で候補を選択するとトークンが挿入される')
  test('ロック要素のダブルクリックでは編集モードに入らない')
  test('readonly モードではダブルクリックを無視する')
})
```

---

### `MentionPicker.test.tsx` — ピッカーテスト

```tsx
describe('MentionPicker', () => {
  test('データタブにデータソースフィールドが表示される')
  test('システムタブにシステム変数が表示される')
  test('query で候補が絞り込まれる')
  test('↑↓ キーで候補を移動できる')
  test('Enter で候補が選択される')
  test('Escape で onDismiss が呼ばれる')
  test('候補が0件になるとピッカーが閉じる')
  test('タブ切替で別カテゴリが表示される')
})
```

---

### TDD の実施順序

実装は testing.md の TDD フローに従い、以下の順序で進める:

1. **`tokenParser.ts`** — ユーティリティの核心。最初に書く
2. **`calculationEngine.ts`** — 基本演算 → 集計関数 → IF/AND/OR → エラー処理 の順
3. **`textStyleUtils.ts`** — `resolveStyle()` / `textStyleToCss()` の純関数
4. **`numberFormatter.ts`** / **`dateFormatter.ts`** — フォーマット関数
5. **`useInlineEdit.ts`** — Hook テスト（renderHook）
6. **`TextInlineEditor.tsx`** — 統合テスト（userEvent でダブルクリック等をシミュレート）
7. **`MentionPicker.tsx`** — 操作テスト

各ステップで: 🔴 テスト作成（RED）→ 🟢 実装（GREEN）→ 🔵 リファクタ（IMPROVE）

---

## Storybook 全 Story 一覧

### `TextElementRenderer.stories.tsx`

表示専用レンダラーのビジュアル確認。

| Story 名 | 概要 | State |
|---|---|---|
| `Default` | 基本テキスト、スタイル全継承 | content='サンプルテキスト', style={} |
| `WithBinding` | トークン入りテキスト | content='氏名は {{employee.name}} です', データ有 |
| `BindingNoData` | データソースなし時のトークン表示 | content='{{employee.name}}', dataSource=null |
| `Bold` | 太字 | fontWeight: 'bold' |
| `Italic` | 斜体 | fontStyle: 'italic' |
| `Underline` | 下線 | textDecoration: 'underline' |
| `StrikeThrough` | 取り消し線 | textDecoration: 'line-through' |
| `SmallFont` | 小フォント | fontSize: 8 |
| `LargeFont` | 大フォント | fontSize: 32 |
| `Multiline` | 複数行 + lineHeight | content='行1\n行2\n行3', lineHeight: 1.8 |
| `CenterAlign` | 中央揃え | textAlign: 'center' |
| `RightAlign` | 右揃え | textAlign: 'right' |
| `JustifyAlign` | 両端揃え | textAlign: 'justify' |
| `VerticalMiddle` | 縦中央揃え | verticalAlign: 'middle', 高さ 30mm |
| `VerticalBottom` | 縦下揃え | verticalAlign: 'bottom', 高さ 30mm |
| `WithBackground` | 背景色付き | backgroundColor: '#fef3c7' |
| `WithPadding` | パディング | padding: {top:4, right:8, bottom:4, left:8} |
| `LongTextEllipsis` | 省略（...） | overflow: 'ellipsis', 幅が狭い |
| `LongTextHidden` | はみ出し非表示 | overflow: 'hidden' |
| `LetterSpacing` | 広い文字間隔 | letterSpacing: 0.2 |
| `WithBorder` | 背景色 + 文字色 | color: '#1e40af', backgroundColor: '#eff6ff' |
| `AllStylesOverride` | 全スタイル上書き | 全プロパティを明示的に設定 |
| `InheritAll` | 全スタイル継承 | style={}, defaultTextStyle が適用される |

---

### `TextInlineEditor.stories.tsx`

インライン編集のインタラクション確認（Storybook Interactions を使用）。

| Story 名 | 概要 | 確認ポイント |
|---|---|---|
| `Default` | 編集前の初期状態 | 通常表示 |
| `EditingMode` | 編集モードに入った状態 | contenteditable の枠線表示 |
| `EditingWithContent` | 既存テキストがある状態で編集開始 | 既存テキストが選択されている |
| `WithTokenHighlight` | `{{token}}` を含む状態で編集 | Phase 1: プレーンテキスト / Phase 2: span 表示 |
| `MentionPickerOpen` | @ 入力後にピッカーが開いている | ドロップダウンが anchorRect 直下に表示 |
| `MentionPickerFiltering` | `@em` と入力後の絞り込み状態 | 'em' に一致する候補のみ表示 |
| `CommitOnEnter` | Enter キーで確定（Interactions） | `onCommit` が呼ばれる |
| `CancelOnEscape` | Escape でキャンセル（Interactions） | `onCancel` が呼ばれ content が元に戻る |
| `CommitOnBlur` | フォーカスアウトで確定（Interactions） | 外側をクリック → 確定 |
| `LockedElement` | locked=true ではダブルクリック無効 | 編集モードに入らない |

---

### `MentionPicker.stories.tsx`

@ ピッカードロップダウンの確認。

| Story 名 | 概要 | State |
|---|---|---|
| `DataTab` | [データ] タブ表示 | dataSource あり、全フィールド表示 |
| `DataTabFiltered` | [データ] タブ + 絞り込み | query='em', employee.* だけ表示 |
| `SystemTab` | [システム] タブ | ページ番号・日付等の変数一覧 |
| `DateTab` | [日付] タブ | 相対日付一覧 |
| `CalcTab` | [計算式] タブ | calculationRules 一覧 |
| `EmptyResults` | 絞り込み結果0件 | query='xyzxyz' → 候補なし表示 |
| `KeyboardNavigation` | ↑↓ キーで移動（Interactions） | focusedIndex が変化する |
| `SelectCandidate` | Enter で選択（Interactions） | `onSelect` が呼ばれる |
| `DismissOnEscape` | Escape で閉じる（Interactions） | `onDismiss` が呼ばれる |
| `NoDataSource` | データソース未設定 | [データ] タブが空 / メッセージ表示 |
| `NoCalcRules` | 計算式ルールなし | [計算式] タブが空 |

---

### `PropertiesPanel.stories.tsx` — スタイルタブ追加分

既存の PropertiesPanel に「スタイル」タブを追加した後の Story。

| Story 名 | 概要 |
|---|---|
| `TextSelected_BasicTab` | テキスト要素選択 → [基本] タブ |
| `TextSelected_StyleTab` | テキスト要素選択 → [スタイル] タブ |
| `TextSelected_AllInherited` | 全プロパティ継承中（グレー背景） |
| `TextSelected_AllOverridden` | 全プロパティ上書き中（白背景 + ✕） |
| `TextSelected_MixedState` | 一部継承・一部上書きが混在 |
| `PaddingLinkedMode` | パディング一括入力モード |
| `PaddingUnlinkedMode` | パディング個別入力モード |
| `FontPickerOpen` | フォントファミリー セレクト開いた状態 |

---

### `TemplateSettingsDialog.stories.tsx`（新規）

| Story 名 | 概要 |
|---|---|
| `DefaultTextStyleTab` | [テキストデフォルト] タブ |
| `VariablesTab_Empty` | [変数] タブ（変数未定義） |
| `VariablesTab_WithEntries` | [変数] タブ（変数3件） |
| `VariablesTab_Adding` | 変数追加インライン行が開いている状態 |
| `CalcRulesTab_Empty` | [計算式] タブ（ルール未定義） |
| `CalcRulesTab_WithRules` | [計算式] タブ（ルール3件） |
| `CalcRulesTab_Editing` | 計算式エディタが開いている状態 |
| `CalcRulesTab_Preview` | プレビュー（サンプルデータで評価済み） |

---

### Decorator 設計

全 TextElement 系 Story に共通の Decorator:

```tsx
// .storybook/decorators/reportStoreDecorator.tsx
export const withReportStore = (defaultTextStyle?: TextStyle) =>
  (Story: StoryFn) => {
    useEffect(() => {
      useReportStore.setState((s) => ({
        report: {
          ...s.report,
          defaultTextStyle: defaultTextStyle ?? DEFAULT_TEXT_STYLE,
        },
      }))
    }, [])
    return <Story />
  }
```

---

## プロパティパネルの完全実装設計

### コンポーネントツリー

```
PropertiesPanel                       ← 選択状態によるルーティング
  └─ TextPropertiesPanel              ← TextElement 選択時
       ├─ Tabs ([基本] [スタイル])
       │    ├─ BasicPropertiesTab     ← 位置・サイズ・ID・表示条件
       │    └─ StylePropertiesTab     ← フォント・スタイル・色・パディング
       │         ├─ FontSection
       │         │    ├─ FontFamilySelect
       │         │    ├─ PropInputUnit (fontSize)
       │         │    ├─ PropInputUnit (lineHeight)
       │         │    └─ PropInputUnit (letterSpacing)
       │         ├─ StyleSection
       │         │    ├─ TextStyleToggleGroup (B / I / U / S)
       │         │    ├─ TextAlignGroup (≡左 / ≡中 / ≡右 / ≡両端)
       │         │    ├─ PropSelect (verticalAlign)
       │         │    ├─ PropSelect (overflow)
       │         │    └─ PropSelect (wordBreak)
       │         ├─ ColorSection
       │         │    ├─ ColorInput (color)
       │         │    └─ ColorInput (backgroundColor)
       │         └─ PaddingSection
       │              └─ PaddingInputGroup
       └─ ResetAllButton               ← 「すべてをテンプレートデフォルトに戻す」
```

---

### `PropInputUnit` — 汎用数値入力（継承状態付き）

```ts
interface PropInputUnitProps {
  label: string
  value: number | undefined           // undefined = 継承中
  defaultValue: number                // テンプレートデフォルト値（placeholder 用）
  unit?: 'pt' | 'em' | '×' | 'mm'
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
  onReset: () => void                 // ✕ クリック → undefined に戻す
}
```

**レンダリングロジック:**
```tsx
const isInherited = value === undefined
const displayValue = isInherited ? undefined : value
const placeholder = String(defaultValue)

<div className={cn('flex items-center gap-1', isInherited && 'opacity-60')}>
  <label>{label}</label>
  <input
    type="number"
    value={displayValue ?? ''}
    placeholder={placeholder}
    min={min}
    max={max}
    step={step}
    className={cn(
      'w-16 rounded border px-2 py-1 text-right',
      isInherited ? 'bg-gray-100 text-gray-400' : 'bg-white'
    )}
    onChange={(e) => onChange(Number(e.target.value))}
  />
  {unit && <span className="text-xs text-gray-500">{unit}</span>}
  {!isInherited && (
    <button onClick={onReset} className="text-gray-400 hover:text-gray-700">✕</button>
  )}
</div>
```

---

### `PropSelect` — セレクト入力（継承状態付き）

```ts
interface PropSelectProps<T extends string> {
  label: string
  value: T | undefined                // undefined = 継承中
  defaultValue: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  onReset: () => void
}
```

**実装:** `<select>` をラップ。継承中は `value=""` を選択状態にして `defaultValue` をプレースホルダー的に表示。

---

### `TextStyleToggleGroup` — B / I / U / S トグル

```ts
interface TextStyleToggleGroupProps {
  fontWeight: 'normal' | 'bold' | undefined
  fontStyle: 'normal' | 'italic' | undefined
  textDecoration: string | undefined         // 'underline' | 'line-through' | 'underline line-through'
  defaultFontWeight: 'normal' | 'bold'
  defaultFontStyle: 'normal' | 'italic'
  defaultTextDecoration: string
  onChangeFontWeight: (v: 'normal' | 'bold' | undefined) => void
  onChangeFontStyle: (v: 'normal' | 'italic' | undefined) => void
  onChangeTextDecoration: (v: string | undefined) => void
}
```

**B / I は排他でなく独立トグル。U と S は組み合わせ可能。**

トグルの状態:
- `value === undefined` かつ `defaultValue === 'bold'` → アクティブ（継承）
- `value === 'bold'` → アクティブ（明示的上書き）
- `value === 'normal'` → 非アクティブ（明示的上書き）

クリック時の挙動:
- 非アクティブ → アクティブ: `onChange('bold')` / `onChange('underline')`
- アクティブかつ値が明示 → 継承に戻す: `onReset()` ではなく `onChange('normal')` or `undefined`

---

### `ColorInput` — 色入力（カラーピッカー + hex）

```ts
interface ColorInputProps {
  label: string
  value: string | undefined           // undefined = 継承中 ('transparent' は明示的設定)
  defaultValue: string
  onChange: (value: string) => void
  onReset: () => void
}
```

**UI:**
```
テキスト  [●] [#0f172a    ] [✕]
         ↑
         カラーサークルアイコン（クリックでカラーピッカーポップオーバー）
```

**カラーピッカー:** shadcn/ui の `Popover` + `<input type="color">` を組み合わせる。
Phase 1 では `<input type="color">` で十分。Phase 2 でカスタムピッカー（透明対応含む）に移行。

**transparent の扱い:**
- `backgroundColor` では `transparent` を選択可能にする（チェックボックスか専用ボタン）
- `color` では `transparent` は不要

---

### `PaddingInputGroup` — パディング（一括/個別モード）

```ts
interface PaddingInputGroupProps {
  value: { top: number; right: number; bottom: number; left: number } | undefined
  defaultValue: { top: number; right: number; bottom: number; left: number }
  onChange: (v: { top: number; right: number; bottom: number; left: number }) => void
  onReset: () => void
}
```

**State（内部）:**
```ts
const [linked, setLinked] = useState(false)
```

**個別モード（デフォルト）:**
```
      [ 2.0 ]
[ 4.0 ] 🔗 [ 4.0 ]
      [ 2.0 ]
```
`🔗` をクリック → 一括モードに切替

**一括モード:**
```
すべて [ 4.0 ] mm  🔓
```
`🔓` をクリック → 個別モードに戻る（各辺は一括値を引き継ぐ）

継承中は全体が `opacity-60` + グレー背景。✕ クリックで一括リセット。

---

### `FontFamilySelect` — フォントファミリー

```ts
interface FontFamilySelectProps {
  value: string | undefined
  defaultValue: string
  onChange: (value: string) => void
  onReset: () => void
}
```

**オプション:**
```tsx
const FONT_OPTIONS = [
  { value: "'Noto Sans JP', sans-serif", label: 'Noto Sans JP' },
  { value: "Meiryo, 'Meiryo UI', sans-serif", label: 'Meiryo' },
  { value: "'Yu Gothic', 'YuGothic', sans-serif", label: Yu Gothic' },
  { value: "'Hiragino Kaku Gothic Pro', sans-serif", label: 'Hiragino Kaku Gothic' },
  { value: "'JetBrains Mono', monospace", label: 'JetBrains Mono' },
]
```

選択肢のラベルは各フォントで表示する（`font-family` CSS を `<option>` に適用）。

---

### `StylePropertiesTab` の全体構造

```tsx
function StylePropertiesTab({ element, defaultTextStyle, onUpdate }: Props) {
  const s = element.style   // Partial<TextStyle>
  const d = defaultTextStyle

  return (
    <div className="space-y-4 p-3">
      {/* フォントセクション */}
      <Section label="フォント">
        <FontFamilySelect value={s.fontFamily} defaultValue={d.fontFamily}
          onChange={(v) => onUpdate({ fontFamily: v })}
          onReset={() => onUpdate({ fontFamily: undefined })} />
        <div className="flex gap-2">
          <PropInputUnit label="サイズ" value={s.fontSize} defaultValue={d.fontSize}
            unit="pt" min={1} max={200}
            onChange={(v) => onUpdate({ fontSize: v })}
            onReset={() => onUpdate({ fontSize: undefined })} />
          <PropInputUnit label="行間" value={s.lineHeight} defaultValue={d.lineHeight}
            unit="×" min={0.5} max={5.0} step={0.1}
            onChange={(v) => onUpdate({ lineHeight: v })}
            onReset={() => onUpdate({ lineHeight: undefined })} />
        </div>
        <PropInputUnit label="字間" value={s.letterSpacing} defaultValue={d.letterSpacing}
          unit="em" min={-0.5} max={2.0} step={0.01}
          onChange={(v) => onUpdate({ letterSpacing: v })}
          onReset={() => onUpdate({ letterSpacing: undefined })} />
      </Section>

      {/* スタイルセクション */}
      <Section label="スタイル">
        <TextStyleToggleGroup ... />
        <TextAlignGroup value={s.textAlign} defaultValue={d.textAlign}
          onChange={(v) => onUpdate({ textAlign: v })}
          onReset={() => onUpdate({ textAlign: undefined })} />
        <div className="flex gap-2">
          <PropSelect label="縦揃え" value={s.verticalAlign} defaultValue={d.verticalAlign}
            options={VERTICAL_ALIGN_OPTIONS} ... />
          <PropSelect label="改行" value={s.wordBreak} defaultValue={d.wordBreak}
            options={WORD_BREAK_OPTIONS} ... />
        </div>
        <PropSelect label="オーバーフロー" value={s.overflow} defaultValue={d.overflow}
          options={OVERFLOW_OPTIONS} ... />
      </Section>

      {/* 色セクション */}
      <Section label="色">
        <ColorInput label="テキスト" value={s.color} defaultValue={d.color}
          onChange={(v) => onUpdate({ color: v })}
          onReset={() => onUpdate({ color: undefined })} />
        <ColorInput label="背景" value={s.backgroundColor} defaultValue={d.backgroundColor}
          onChange={(v) => onUpdate({ backgroundColor: v })}
          onReset={() => onUpdate({ backgroundColor: undefined })} />
      </Section>

      {/* パディングセクション */}
      <Section label="パディング（mm）">
        <PaddingInputGroup value={s.padding} defaultValue={d.padding}
          onChange={(v) => onUpdate({ padding: v })}
          onReset={() => onUpdate({ padding: undefined })} />
      </Section>

      {/* 一括リセット */}
      <button
        className="w-full text-right text-xs text-blue-500 underline hover:text-blue-700"
        onClick={() => onUpdate({ /* 全プロパティ undefined */ })}
      >
        すべてをテンプレートデフォルトに戻す
      </button>
    </div>
  )
}
```

---

### `onUpdate` の型と store 連携

```ts
// StylePropertiesTab が受け取るコールバック
type OnUpdate = (partialStyle: Partial<TextStyle>) => void

// PropertiesPanel 側での実装
const handleStyleUpdate: OnUpdate = (partialStyle) => {
  updateElement(element.id, (el) => {
    if (el.type !== 'text') return el
    return { ...el, style: { ...el.style, ...partialStyle } }
  })
}

// 全リセット
const handleResetAll: OnUpdate = () => {
  updateElement(element.id, (el) => {
    if (el.type !== 'text') return el
    return { ...el, style: {} }
  })
}
```

---

## `contenteditable` の険悪地帯と回避策

`contenteditable` は強力だが、知らないと踏む地雷だらけ。主要な落とし穴と対処法をまとめる。

---

### 1. paste でリッチテキスト（HTML）が混入する

**問題:** ユーザーがリッチテキストをペーストすると、`<b>`, `<span style="...">` などの HTML タグが contenteditable 内に挿入される。
`textContent` で取得すると tag が剥がれるが、`{{token}}` の span（Phase 2）が壊れる。

**回避策:**
```ts
editorRef.current.addEventListener('paste', (e) => {
  e.preventDefault()
  const text = e.clipboardData?.getData('text/plain') ?? ''
  // プレーンテキストとして挿入
  document.execCommand('insertText', false, text)  // 旧来の方法（後述）
  // または:
  const selection = window.getSelection()
  if (selection?.rangeCount) {
    selection.deleteFromDocument()
    selection.getRangeAt(0).insertNode(document.createTextNode(text))
  }
})
```

**Phase 1 でのシンプルな実装:** `document.execCommand('insertText', false, text)` は deprecated だが、2026年現在まだ全ブラウザで動作する。代替は `Selection API` の手動操作。

---

### 2. `textContent` と `innerText` の違い

| プロパティ | 改行の扱い | `<br>` の扱い | パフォーマンス |
|---|---|---|---|
| `textContent` | `\n` 含む | 無視（削除） | 速い |
| `innerText` | レイアウト依存 | `\n` に変換 | 遅い（再レイアウト） |

**推奨:** 値の取得・設定には常に `textContent` を使う。
`contenteditable` 内の改行は `<div>` や `<br>` として表現されるが、`textContent` 取得時は `\n` として正規化される。

**実際の取得:**
```ts
// React が管理する state ではなく、DOM から直接取得（IME 対応のため）
const getRawContent = (el: HTMLDivElement): string => {
  // Chrome は改行に <div> を使い、Firefox は <br> を使う
  // どちらも textContent で \n に変換される
  return el.textContent ?? ''
}
```

---

### 3. 改行の挙動がブラウザによって異なる

**問題:** Enter キーを押した時の動作が異なる:
- Chrome: `<div><br></div>` を挿入（前の行も `<div>` でラップされる）
- Firefox: `<br>` を挿入
- Safari: `<div>` を挿入

**回避策 (Enter で改行しない場合):**
```ts
// Enter → 確定、Shift+Enter → 改行
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    commitEdit()
  }
  // Shift+Enter は自然に改行される（ブラウザ依存だが許容）
}
```

**改行を `\n` に正規化する場合（Shift+Enter 対応）:**
```ts
// paste 後や入力確定後に normalizeNewlines() を呼ぶ
function normalizeNewlines(el: HTMLDivElement): void {
  // <br>, <div>, <p> を \n に変換してからプレーンテキストに置き換える
  const html = el.innerHTML
  const normalized = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')   // 残りのタグを削除
  if (el.textContent !== normalized) {
    el.textContent = normalized
    // カーソルを末尾に戻す
  }
}
```

---

### 4. `<br>` が末尾に自動挿入される（Chrome）

**問題:** Chrome は空の contenteditable や改行の後に `<br>` を自動挿入する。
`textContent` に影響しないが、Phase 2 の span 操作で邪魔になる。

**回避策:** 読み取り時には問題なし。書き込み時（textContent を設定する時）は自動的に解決される。

---

### 5. `maxLength` が効かない

**問題:** `<input>` とは違い、`<div contenteditable>` には `maxLength` 属性がない。

**回避策:**
```ts
const handleInput = (e: InputEvent) => {
  const MAX_LENGTH = 10000   // 帳票テキストの現実的な上限
  const el = editorRef.current
  if (!el) return
  if ((el.textContent?.length ?? 0) > MAX_LENGTH) {
    // 超過分を切り捨て
    el.textContent = el.textContent?.slice(0, MAX_LENGTH) ?? ''
    setCursorAtOffset(el, MAX_LENGTH)
  }
  // ...通常の処理
}
```

---

### 6. `selection` が失われるタイミング

**問題:** DropDown（MentionPicker）が表示されると、contenteditable のフォーカスが失われ、カーソル位置が消える。

**回避策:** MentionPicker の親要素に `onMouseDown={(e) => e.preventDefault()}` を設定する。
`mousedown` を止めると `blur` が発火しないため、contenteditable のフォーカス（= selection）が保持される。

```tsx
<MentionPicker
  onMouseDown={(e) => e.preventDefault()}   // ← フォーカスを奪わない
  ...
/>
```

---

### 7. `spellcheck` と IME の競合

**問題:** `spellcheck` が有効だと、日本語入力中に赤波線が出てユーザー体験が悪い。

**回避策:**
```tsx
<div
  contentEditable="true"
  spellCheck={false}    // ← 帳票テキストにスペルチェックは不要
  lang="ja"             // ← IME ヒントとして設定
  ...
/>
```

---

### 8. `textContent` 設定後にカーソルが先頭に戻る

**問題:** 確定後に `textContent = newContent` とセットすると、カーソルが先頭（offset 0）に戻る。
次の編集開始時に不便。

**回避策:** 確定後は通常表示に切り替えるので、カーソル位置は問題にならない。
編集再開時（次の enterEditMode）は末尾にカーソルを置く。

```ts
const enterEditMode = () => {
  setIsEditing(true)
  // 次の tick で DOM に反映されてから focus & カーソル移動
  requestAnimationFrame(() => {
    const el = editorRef.current
    if (!el) return
    el.focus()
    setCursorAtOffset(el, el.textContent?.length ?? 0)  // 末尾に配置
  })
}
```

---

### 9. `contenteditable` のデフォルトスタイルのリセット

**問題:** ブラウザによって `contenteditable` 要素のデフォルトスタイルが異なる（アウトライン、マージンなど）。

**CSS リセット:**
```css
[contenteditable] {
  outline: none;           /* フォーカスリングはカスタム border で代替 */
  user-select: text;       /* ドラッグ中に誤ってテキスト選択されないよう制御 */
  -webkit-user-select: text;
  white-space: pre-wrap;   /* 改行と空白を保持 */
  word-break: break-word;  /* デフォルトの改行ルール */
}
```

---

### 10. `execCommand` の代替（将来対応）

`document.execCommand('insertText', ...)` は deprecated だが、2026年時点で代替の `Selection API` は一部機能が不完全。
Phase 1 では `execCommand` を使い、将来的に `Selection API` 完全移行を検討する。

監視すべき MDN エラー: `insertText` がどのブラウザバージョンで廃止されるかのアナウンス。

---

## 全ブレーンストーム整合性チェックと統合設計

3つのブレーンストーム文書を横断してチェックし、矛盾・重複・抜け漏れを解決する。

**参照文書:**
- A: `2026-04-05-report-definition-studio-architecture-brainstorm.md` (アーキテクチャ)
- B: `2026-04-05-atomic-design-component-breakdown-brainstorm.md` (Atomic Design + Element 要件)
- C: `2026-04-05-text-element-brainstorm.md` (TextElement 詳細、本文書)

---

### 矛盾点と解決策

#### 1. `TextStyle` の定義範囲

| 文書 | TextStyle の内容 |
|---|---|
| A | 定義なし（`style: TextStyle` として参照のみ） |
| B | 基本 6プロパティ（fontSize, fontWeight, fontStyle, color, textAlign, fontFamily） |
| C | 16プロパティに拡張（lineHeight, textDecoration, letterSpacing, verticalAlign, backgroundColor, padding, overflow, wordBreak, whiteSpace 追加） |

**解決:** **C の拡張版を正とする。** B の `TextStyle` 定義と `StylePropsPanel.style: TextStyle` の Props は C に合わせて更新する。

#### 2. `PropInputUnit` の Props

| 文書 | Props |
|---|---|
| B | `value: number`, `unit: string`, `onChange`, `min?` |
| C | `value: number \| undefined` (継承対応), `defaultValue: number`, `onReset`, `min`, `max`, `step` 追加 |

**解決:** **C の定義が正しい。** B の `PropInputUnit` Atom の定義を C に合わせて更新する。
`undefined = 継承中` の設計は `PropInputUnit` の核心機能。

#### 3. `StylePropsPanel`（Organism）vs `StylePropertiesTab`（C）

| 文書 | コンポーネント名 | 役割 |
|---|---|---|
| B | `StylePropsPanel` (Organism) | 右パネルのスタイルタブ全体 |
| C | `StylePropertiesTab` (Function) | `PropertiesPanel` 内のタブコンテンツ |

**解決:** 両者は**同一コンポーネント**。名称は `StylePropertiesTab` に統一する（タブコンテンツとして使われるため）。
B の `StylePropsPanel` は廃止し `StylePropertiesTab` にリネーム。

#### 4. `StyleToolbar` (Molecule) の範囲

| 文書 | コンポーネント | 含むトグル |
|---|---|---|
| B | `StyleToolbar` (Molecule) | B/I + textAlign + color |
| C | `TextStyleToggleGroup` | B/I/U/S（下線・取り消し線を追加、align/color は別コンポーネントへ） |

**解決:** `StyleToolbar` を **2つに分割する:**
- `TextStyleToggleGroup` — B/I/U/S のトグル（C の定義通り）
- `TextAlignGroup` — 水平配置トグル（B の align 部分から独立）
- `ColorInput` — テキスト色/背景色（B の color 部分から独立、C で詳細定義）

B の `StyleToolbar` Molecule は廃止（または `TextStyleToggleGroup` + `TextAlignGroup` の組み合わせに置き換え）。

#### 5. `tokenParser.ts` vs 既存の `dataBinding.ts`

**現状:** `dataBinding.ts` に `interpolate()` が実装済み。C が新たに `tokenParser.ts` を追加提案。

**解決:**
```
dataBinding.ts（既存）
  → interpolate()     ← 値置換ロジック（維持）
  → resolveField()    ← フィールド参照解決（維持）

tokenParser.ts（新規）
  → parseTokens()     ← {{key}} トークンをパース（新規）
  → insertMentionToken()  ← @ 挿入処理（新規）
  → detectMentionTrigger() ← @ トリガー検出（新規）
  → re-export interpolate from dataBinding （利便性のため）
```

`dataBinding.ts` は変更せず、`tokenParser.ts` が `interpolate` を re-export する形で統合。

#### 6. `visibilityRule` の評価エンジン

- C: `ElementBase.visibilityRule?: string` を計算式エンジンで評価
- A: `ValidationRule` が ReportDefinition レベルに存在
- B: `ConstraintPropsPanel` が `ValidationRule` を表示

**解決:** 区別を明確化:
- `visibilityRule` = **要素レベル**の表示/非表示条件式（ElementBase に追加、calculationEngine で評価）
- `ValidationRule` = **帳票レベル**の入力検証ルール（ConstraintPropsPanel で編集、PDF 出力時に適用）
- 2つは**別物**。混同しないよう命名を維持する。

#### 7. `CalculationRule` の定義

- A: `calculationRules: CalculationRule[]` として型名のみ登場
- C: 完全な型定義とエバリュエーター

**解決:** **C が正式定義**。A の `CalculationRule` はここで定義された型を指す。

---

### 抜け漏れコンポーネント（Atomic Design に追加が必要）

#### C で定義されたが B に未掲載のコンポーネント

| コンポーネント | 提案カテゴリ | 追加先 |
|---|---|---|
| `TemplateSettingsDialog` | Organism | organisms/ に追加 |
| `MentionPicker` | Molecule（キャンバス固有） | molecules/canvas/ または canvas/ |
| `MentionPickerTabs` | Atom（MentionPicker 内部） | — |
| `MentionCandidateList` | Molecule（MentionPicker 内部） | — |
| `TextInlineEditor` | Canvas コンポーネント（Organism相当） | canvas/ に追加 |
| `EditableContent` | Canvas コンポーネント（Atom相当） | canvas/ に追加 |
| `TextElementRenderer` | Canvas コンポーネント | canvas/ に追加 |
| `FontFamilySelect` | Atom（PropInputUnit の派生） | atoms/ に追加 |
| `PaddingInputGroup` | Molecule（4方向入力グループ） | molecules/ に追加 |
| `ColorInput` | Atom（ColorSwatch の拡張版） | atoms/ で ColorSwatch を拡張 |

#### 新規 lib ファイル

| ファイル | 役割 |
|---|---|
| `src/lib/tokenParser.ts` | {{key}} パース・@ 挿入処理 |
| `src/lib/calculationEngine.ts` | 計算式パーサ・エバリュエーター |
| `src/lib/textStyleUtils.ts` | resolveStyle() / textStyleToCss() |
| `src/lib/numberFormatter.ts` | 数値フォーマット |
| `src/lib/dateFormatter.ts` | 日付フォーマット |

#### 新規 hook ファイル

| ファイル | 役割 |
|---|---|
| `src/hooks/useInlineEdit.ts` | インライン編集の全ステート管理 |

---

### `ReportDefinition` 型の最終統合（A + C を統合）

```ts
interface ReportDefinition {
  // --- A (アーキテクチャ) から ---
  metadata: Metadata
  pageSettings: PageSettings
  dataSources: DataSourceDefinition[]
  outputVariants: OutputVariant[]
  submissionModels: SubmissionModel[]
  validationRules: ValidationRule[]      // 帳票レベルの入力検証ルール
  pages: Page[]

  // --- C (TextElement) で追加 ---
  defaultTextStyle: TextStyle            // 全 TextElement のデフォルトスタイル
  templateVariables: TemplateVariable[]  // {{tplVar.xxx}} トークン用
  calculationRules: CalculationRule[]    // {{calc.xxx}} トークン用
}
```

**備考:** `calculationRules` は A でも定義されていたが型定義は C が提供。整合的。

---

### `ReportStore` のアクション補完（B + C を統合）

B で必要とされた未実装アクション + C で追加が必要なアクション:

```ts
// B で未実装として挙げられたアクション
alignElements(pageId, elementIds, alignment)
bringForward(pageId, elementId)
sendBackward(pageId, elementId)

// C で新規追加が必要なアクション
updateTemplateVariables(variables: TemplateVariable[])
addTemplateVariable(variable: TemplateVariable)
removeTemplateVariable(key: string)
addCalculationRule(rule: CalculationRule)
updateCalculationRule(key: string, patch: Partial<CalculationRule>)
removeCalculationRule(key: string)
updateDefaultTextStyle(style: Partial<TextStyle>)
```

---

### コンポーネント命名の最終決定表

| B での名称 | C での名称 | 最終決定 | 備考 |
|---|---|---|---|
| `StylePropsPanel` | `StylePropertiesTab` | **`StylePropertiesTab`** | タブコンテンツとして正確 |
| `PropInputUnit` (min? のみ) | `PropInputUnit` (継承対応) | **C の定義** | 継承モデル対応で拡張 |
| `StyleToolbar` | `TextStyleToggleGroup` + `TextAlignGroup` | **分割** | B の StyleToolbar は廃止 |
| `ColorSwatch` | `ColorInput` (hex + picker) | **`ColorInput`** に統一 | ColorSwatch は ColorInput に吸収 |
| `BasicPropsPanel` | `BasicPropertiesTab` | **`BasicPropertiesTab`** | 命名統一（Tab 接尾辞） |
| `BindingPropsPanel` | — | **`BindingPropertiesTab`** | 命名統一 |
| `ConstraintPropsPanel` | — | **`ConstraintPropertiesTab`** | 命名統一 |

---

### Phase 1 実装スコープの最終確定

B と C を合わせた **Phase 1 の成果物:**

**新規 lib:**
- `tokenParser.ts`, `textStyleUtils.ts`, `numberFormatter.ts`, `dateFormatter.ts`

**新規 hooks:**
- `useInlineEdit.ts`

**新規 components/canvas:**
- `TextElementRenderer.tsx`, `TextInlineEditor.tsx`, `EditableContent.tsx`, `MentionPicker.tsx`

**新規 components/atoms:**
- `IconButton`, `PropInput`, `PropInputUnit`（継承対応版）, `FontFamilySelect`, `ColorInput`, `StyleButton`, `Toggle`, `Badge`, `EmptyState`

**新規 components/molecules:**
- `PropRow`, `PropRow2`, `TextStyleToggleGroup`, `TextAlignGroup`, `PaddingInputGroup`, `PaletteItem`, `PaletteCategory`, `LayerItem`, `DataSourceNode`

**新規 components/organisms:**
- `AppHeader`, `EditorToolbar`, `TemplateSettingsDialog`, `StylePropertiesTab`, `BindingPropertiesTab`

**既存コンポーネントの更新:**
- `PropertiesPanel`: [基本][スタイル][バインディング][制約] タブ構成に更新
- `ElementRenderer`: TextElement の resolveStyle + textStyleToCss を使うように更新
- `CanvasElement`: インライン編集の TextInlineEditor 統合

**型定義の更新:**
- `TextStyle` を拡張版に置き換え
- `ElementBase` に `name`, `visibilityRule`, `printable` を追加
- `ReportDefinition` に `defaultTextStyle`, `templateVariables`, `calculationRules` を追加

---

## Resolved Questions

1. **インライン編集の必要性** → 必須。ダブルクリックで contenteditable に切り替え。
2. **スタイルの範囲** → 一般的なテキストボックスでできること全て。lineHeight / textDecoration / backgroundColor / letterSpacing / padding / verticalAlign / overflow / wordBreak / whiteSpace を追加。
3. **テンプレート全体設定との関係** → CSS inherit モデル。`ReportDefinition.defaultTextStyle` をデフォルト値とし、TextElement.style で上書き。
4. **変数挿入** → `{{key}}` トークンを維持。インライン編集中に `@` でピッカー表示（データソース変数 / システム変数 / 相対日付 / 計算式）。
5. **編集中の Undo/Redo** → 編集確定後に1エントリ。編集中は ⌘Z をブラウザネイティブに任せる。
6. **IME 入力** → `compositionEnd` 後にのみ store へ反映。変換中間状態は store に入れない。
7. **`{{token}}` のクリック** → トークン全体を選択（Phase 1 はプレーンテキスト扱い、Phase 2 で span 化）。
8. **ロック要素のダブルクリック** → 何もしない。cursor: default のまま。
9. **Escape キー** → キャンセル（編集前の content に戻す）。Enter → 確定（Shift+Enter で改行）。
10. **継承モデル** → `ReportDefinition.defaultTextStyle` をテンプレート設定ダイアログで設定。継承中はグレー背景・`✕` 非表示、上書き中は白背景・`✕` あり。プロパティ1つずつリセット可能。
11. **@メンションピッカー** → `@` 入力で即時表示。タブ: [データ][システム][日付][計算式]。挿入後 `@` を削除して `{{token}}` のみ残す。Escape でキャンセル（`@` は残す）。テンプレート変数・固定日付・相対日付をサポート。

---

## Next Steps

→ `/workflows:plan` で実装計画を作成する

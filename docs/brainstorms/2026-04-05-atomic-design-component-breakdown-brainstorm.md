---
date: 2026-04-05
topic: atomic-design-component-breakdown
---

# Atomic Design によるUIコンポーネント分解と機能要件定義

## What We're Building

UIモック (`src/mocks/report-editor-ui.html`) をベースに、帳票テンプレートエディタのUIコンポーネントを Atomic Design (Atoms → Molecules → Organisms → Templates → Pages) に従って体系的に分解し、各コンポーネントの機能要件を定義する。

これにより Storybook でのコンポーネント駆動開発が可能になり、再利用性・テスタビリティが向上する。

---

## Why This Approach

UIモックには5つの主要エリア（Header / Toolbar / Left Panel / Canvas / Right Panel / Bottom Panel）が存在する。  
Atomic Design で分解することで:
- 小さな部品を独立してテスト・Storybook 表示できる
- 同じ Atom（例: `PropInput`）を複数の Organism で再利用できる
- 段階的に実装・置き換えが可能になる

---

## コンポーネント分解

---

### Atoms（原子：最小の UI 部品）

| コンポーネント名 | 説明 | 機能要件 |
|---|---|---|
| `IconButton` | アイコンのみのボタン（Toolbar の各ボタン、レイヤーアイコン等） | `icon`, `title`, `active`, `disabled`, `onClick` をサポート。ホバー/アクティブスタイル |
| `TextButton` | テキスト+アイコンのボタン（Header の「保存」「プレビュー」「出力」） | `label`, `icon`, `variant(default/primary)`, `onClick` |
| `TabButton` | タブ切り替えボタン（左パネル・右パネル・ボトムパネルのタブ） | `label`, `active`, `onClick`。下線インジケータ付き |
| `PropInput` | プロパティ入力フィールド（右パネルの各入力） | `value`, `onChange`, `placeholder`. フォーカス時に primary border |
| `PropInputUnit` | 単位付き入力フィールド（幅・高さ等の mm 入力）。**継承状態対応**（undefined = 継承中、✕ リセットボタン付き） | `value: number\|undefined`, `defaultValue: number`, `unit`, `min`, `max`, `step`, `onChange`, `onReset` |
| `ColorInput` | カラーピッカー + hex 入力（テキスト色・背景色）。**継承状態対応**（旧 `ColorSwatch` を拡張統合） | `value: string\|undefined`, `defaultValue: string`, `onChange`, `onReset` |
| `FontFamilySelect` | フォントファミリーセレクト。**継承状態対応** | `value: string\|undefined`, `defaultValue: string`, `onChange`, `onReset` |
| `StyleButton` | 太字/斜体/下線等のスタイルトグルボタン | `icon`or`label`, `active`, `onClick` |
| `Toggle` | ON/OFF トグルスイッチ（制約・バインディング設定） | `checked`, `onChange`. CSS アニメーション付き |
| `Badge` | タイプラベル（レイヤーの HEADER/BODY/FOOTER タグ、データソース型タグ） | `label`, `color`. 小さい角丸ピル形状 |
| `Divider` | セパレーター（Toolbar の `tb-sep`、パネル内の境界線） | 縦/横の variant |
| `EmptyState` | 未選択・未データ状態の表示 | `icon`, `message` |
| `ZoomSelect` | ズーム率セレクトボックス | `value`, `options`, `onChange` |

---

### Molecules（分子：Atom の組み合わせ）

| コンポーネント名 | 説明 | 機能要件 |
|---|---|---|
| `PropRow` | ラベル + 入力フィールドの1行（`prop-label` + `PropInput`） | `label`, `children(input)`. 横並び、ラベル幅固定 |
| `PropRow2` | 2列グリッドの入力行（位置X/Y、幅/高さ等） | `children` を2カラムグリッドで配置 |
| `TextStyleToggleGroup` | B/I/U/S の独立トグルボタン群（旧 `StyleToolbar` から分離）。継承状態対応 | `fontWeight`, `fontStyle`, `textDecoration` + undefined（継承中）対応, `onChange*`, `onReset*` |
| `TextAlignGroup` | 水平配置ボタン群（左/中央/右/両端）。継承状態対応 | `value: 'left'\|'center'\|'right'\|'justify'\|undefined`, `defaultValue`, `onChange`, `onReset` |
| `PaddingInputGroup` | 4方向パディング入力（上/右/下/左 + 一括モードトグル）。継承状態対応 | `value: Padding\|undefined`, `defaultValue: Padding`, `onChange`, `onReset` |
| `BindingPathInput` | データバインディングパス入力（パス入力 + 式エディタモック） | `path`, `onPathChange`, フォントはmonospace |
| `PaletteItem` | パレットの1アイテム（アイコン + ラベル、ドラッグ可能） | `icon`, `label`, `onDragStart`. ホバーでblue強調 |
| `PaletteCategory` | カテゴリ見出し + 折りたたみ（テキスト系/図形系/入力系/複合系/特殊） | `title`, `icon`, `collapsed`, `onToggle`, `children` |
| `LayerItem` | レイヤーツリーの1行（インデント付き、表示/ロックアイコン） | `label`, `icon`, `indent`, `selected`, `visible`, `locked`, `onSelect`, `onToggleVisible`, `onToggleLocked` |
| `SectionLayerItem` | セクション行（LayerItem に sectionType バッジを追加） | `sectionType`, 展開アイコン付き |
| `VariantItem` | バリアント1行（色ドット + 名前 + メタ情報 + バッジ） | `name`, `color`, `meta`, `active`, `onClick` |
| `RuleItem` | バリデーションルール1行（severity バー + ruleId + 説明 + ターゲット） | `ruleId`, `severity(error/warning/info)`, `description`, `target` |
| `DataSourceNode` | データソースツリーの1ノード（アイコン + パス + 型バッジ） | `label`, `type(obj/col/str/num)`, `depth`, `expanded`, `onToggle` |
| `ResizeHandle` | キャンバス要素のリサイズハンドル（8方向） | `direction(n/s/e/w/ne/nw/se/sw)`, `onPointerDown` |
| `SnapLine` | スナップ表示ライン（水平/垂直） | `orientation(h/v)`, `position`, `visible` |

---

### Organisms（有機体：画面の機能ブロック）

| コンポーネント名 | 説明 | 機能要件 |
|---|---|---|
| `AppHeader` | 最上部ヘッダー（ロゴ + 帳票名入力 + バージョン + 保存/プレビュー/出力ボタン） | `reportName`, `version`, `onSave`, `onPreview`, `onExport` |
| `EditorToolbar` | ツールバー（Undo/Redo + 整列 + Z順 + グリッド/ルーラー + ズーム + バリアント切替） | 各操作の handler、`historyIndex`, `canUndo/canRedo`, `zoomLevel`, `activeVariant` |
| `ElementPalette` | 左パネル「ツール」タブ（カテゴリ折りたたみ式パレット） | カテゴリ展開/折りたたみ状態管理。ドラッグ開始で `addElement` |
| `LayerPanel` | 左パネル「レイヤー」タブ（Section + Element のツリー） | 階層ツリー表示、選択連動、表示/ロックトグル、ドラッグ並び替え |
| `ReportCanvas` | メインキャンバス（ルーラー + ページ + セクション + 要素） | DnD対応、Section表示、ズーム対応、スナップライン表示 |
| `SectionContainer` | キャンバス上のセクション（ホバー/選択ボーダー + セクションラベル） | `sectionType`, `selected`, `onSelect`, 内部に `CanvasElement` を配置 |
| `BasicPropsPanel` | 右パネル「基本」タブ（position x/y, size w/h, zIndex） | mm単位の位置・サイズ入力。`onUpdateElement` 経由で store 更新 |
| `StylePropertiesTab` | 右パネル「スタイル」タブ（フォント/色/テキスト配置/背景/パディング）。**継承モデル対応**（旧 `StylePropsPanel` をリネーム） | `TextStyleToggleGroup` + `TextAlignGroup` + `ColorInput` + `PaddingInputGroup` + 継承リセットボタン |
| `BindingPropertiesTab` | 右パネル「バインディング」タブ（旧 `BindingPropsPanel` をリネーム） | `BindingPathInput` + `PropRow` の組み合わせ |
| `ConstraintPropertiesTab` | 右パネル「制約」タブ（旧 `ConstraintPropsPanel` をリネーム） | `Toggle` + `PropRow` の組み合わせ、型別に表示項目を切り替え |
| `TemplateSettingsDialog` | テンプレート設定ダイアログ（[メタデータ][ページ設定][テキストデフォルト][変数][計算式]タブ）。**TextElement ブレスト追加** | `defaultTextStyle`, `templateVariables`, `calculationRules` の編集 UI |
| `PropertiesPanel` | 右パネル全体（タブ切替 + 各タブの内容） | 選択要素の type に応じてタブ構成を変化。未選択時は `EmptyState` |
| `DataSourcePanel` | ボトムパネル「データソース」タブ（ツリービュー + JSON入力） | `DataSourceNode` ツリー表示、JSON貼り付けでデータ更新 |
| `VariantsPanel` | ボトムパネル「バリアント」タブ（バリアント一覧 + 切替） | `VariantItem` リスト、追加/削除/アクティブ切替 |
| `ValidationRulesPanel` | ボトムパネル「検証ルール」タブ（ルール一覧 + 追加ボタン） | `RuleItem` リスト、ルール追加ダイアログ起動 |

---

### Templates（テンプレート：ページレイアウトの骨格）

| コンポーネント名 | 説明 | 機能要件 |
|---|---|---|
| `EditorLayout` | エディタ全体のグリッドレイアウト（Header / Toolbar / Left / Canvas / Right / Bottom） | CSS Grid `grid-template-areas` ベース。各エリアに Organism をスロット配置 |
| `PreviewLayout` | プレビューモード表示（複数ページを縦列表示） | `readonly=true` の `ReportCanvas` を複数表示 |

---

### Pages（ページ：実際の画面）

| コンポーネント名 | 説明 | 機能要件 |
|---|---|---|
| `EditorPage` | テンプレートエディタのメイン画面（現在の `App.tsx` に相当） | Zustand store から状態取得、`EditorLayout` に各 Organism を渡す |
| `TemplateGalleryPage` | テンプレート選択画面（テンプレート一覧モーダル/画面） | テンプレート選択で `loadReport` を呼び出し |

---

## Key Decisions

- **Atoms は Zustand store に依存しない。** Props のみで動作させ、Storybook での単独表示を容易にする。
- **Organisms は store に接続する。** `useReportStore` フックを Organism レベルで使用し、Molecule/Atom には純粋な Props を渡す。
- **`PropInput` 等は shadcn/ui の Input と統合する。** 既存の Tailwind + shadcn 環境を活用し、スタイルの重複を避ける。
- **`EditorLayout` の分割方法は CSS Grid を維持。** 現在の `grid-template-areas` パターンはモックに忠実で十分機能する。
- **`LayerPanel` はフェーズ2で実装。** フェーズ1は `ElementPalette` と `PropertiesPanel` を優先する（現状の実装を Atomic Design に整理するのみ）。

---

## Resolved Questions

1. **shadcn/ui の既存コンポーネントとの境界** → `Button`, `Input`, `Select`, `Tabs` は shadcn/ui をそのまま Atom 扱いとする。プロジェクト固有の `PropInput`, `PropInputUnit`, `IconButton` 等のみ新規 Atom として作成する。
2. **`BindingPropsPanel` の式エディタ** → CodeMirror を今すぐ導入する。UIモックの `codemirror-mock` を実際の実装に置き換える。
3. **今回の実装スコープ** → **Phase 1** のみ。既存コンポーネントを Atomic Design に再分解し Storybook に登録する。新機能追加はしない。
4. **TextElement ブレストとの整合性（2026-04-05 更新）** → `TextStyle` は 16プロパティ版に拡張。`ColorSwatch` は `ColorInput` に統合。`StyleToolbar` は `TextStyleToggleGroup` + `TextAlignGroup` に分割。`StylePropsPanel` → `StylePropertiesTab` にリネーム。`PropInputUnit` は継承状態（undefined）対応版に更新。`TemplateSettingsDialog` Organism を追加。Canvas 層に `TextInlineEditor`, `MentionPicker` 等を追加。詳細は `2026-04-05-text-element-brainstorm.md` の「全ブレーンストーム整合性チェックと統合設計」セクションを参照。

---

---

## 詳細設計：Props 定義・状態管理・Storybook 構成

---

### Atoms — Props 定義と shadcn/ui 対応

| Atom | shadcn/ui 対応 | Props インターフェース | Storybook Stories |
|---|---|---|---|
| `IconButton` | `Button` variant="ghost" size="icon" | `icon: ReactNode`, `title?: string`, `active?: boolean`, `disabled?: boolean`, `onClick: () => void` | Default, Active, Disabled |
| `TextButton` | `Button` | `label: string`, `icon?: ReactNode`, `variant?: 'default'\|'primary'`, `onClick: () => void` | Default, Primary |
| `TabButton` | `Tabs` の tab trigger をラップ | `label: string`, `active: boolean`, `onClick: () => void` | Active, Inactive |
| `PropInput` | `Input` | `value: string\|number`, `onChange: (v: string) => void`, `placeholder?: string`, `type?: 'text'\|'number'` | Text, Number, Focused |
| `PropInputUnit` | `Input` + span | `value: number\|undefined`（undefined=継承）, `defaultValue: number`, `unit: string`, `onChange: (v: number) => void`, `onReset: () => void`, `min?`, `max?`, `step?` | Inherited（グレー）, Overridden（白+✕）, Validation Error |
| `ColorInput` | `Input` + `Popover` + `input[type=color]` | `value: string\|undefined`（undefined=継承）, `defaultValue: string`, `onChange: (c: string) => void`, `onReset: () => void` | Inherited, Overridden, Transparent |
| `FontFamilySelect` | `Select` | `value: string\|undefined`, `defaultValue: string`, `options: FontOption[]`, `onChange`, `onReset` | Inherited, Overridden |
| `StyleButton` | `Button` variant="outline" size="sm" | `icon?: ReactNode`, `label?: string`, `active: boolean`, `onClick: () => void` | Bold, Italic, Active/Inactive |
| `Toggle` | `Switch`（shadcn/ui） | `checked: boolean`, `onChange: (v: boolean) => void`, `label?: string` | On, Off |
| `Badge` | `Badge`（shadcn/ui） | `label: string`, `variant: 'header'\|'body'\|'footer'\|'obj'\|'col'\|'str'\|'num'` | 各バリアント |
| `Divider` | `Separator` | `orientation: 'horizontal'\|'vertical'` | H, V |
| `EmptyState` | 独自実装 | `icon: ReactNode`, `message: string` | NoSelection, NoData |
| `ZoomSelect` | `Select` | `value: number`, `options: number[]`, `onChange: (v: number) => void` | Default |

---

### Molecules — Props 定義と状態管理

#### `PropRow`
```ts
interface PropRowProps {
  label: string          // 左側ラベル（幅固定 54px）
  children: ReactNode    // 右側の入力要素（PropInput 等）
}
```
- ストア依存なし。純粋に layout のみ担当。

#### `PropRow2`
```ts
interface PropRow2Props {
  children: [ReactNode, ReactNode]  // 2カラムグリッド
}
```

#### `StyleToolbar`
```ts
interface StyleToolbarProps {
  bold: boolean
  italic: boolean
  textAlign: 'left' | 'center' | 'right'
  color: string
  onBoldChange: (v: boolean) => void
  onItalicChange: (v: boolean) => void
  onAlignChange: (v: 'left' | 'center' | 'right') => void
  onColorChange: (v: string) => void
}
```
- Storybook: Default（全オフ）、AllActive（全オン）

#### `BindingPathInput`
```ts
interface BindingPathInputProps {
  path: string
  expression: string
  onPathChange: (v: string) => void
  onExpressionChange: (v: string) => void
}
```
- 式エディタ: CodeMirror（`@codemirror/lang-javascript` + `@uiw/react-codemirror`）

#### `PaletteItem`
```ts
interface PaletteItemProps {
  icon: ReactNode
  label: string
  draggable?: boolean
  onDragStart?: (e: DragEvent) => void
  onClick?: () => void
}
```

#### `PaletteCategory`
```ts
interface PaletteCategoryProps {
  title: string
  icon: ReactNode
  defaultCollapsed?: boolean
  children: ReactNode  // PaletteItem[]
}
```
- `useState` で collapsed 状態を内部管理。ストア依存なし。

#### `LayerItem`
```ts
interface LayerItemProps {
  label: string
  icon: ReactNode
  indent: 0 | 1 | 2           // 0=section, 1=element, 2=nested
  selected: boolean
  visible: boolean
  locked: boolean
  onSelect: () => void
  onToggleVisible: () => void
  onToggleLocked: () => void
}
```

#### `SectionLayerItem`
```ts
interface SectionLayerItemProps extends LayerItemProps {
  sectionType: 'header' | 'body' | 'footer' | 'custom'
  expanded: boolean
  onToggleExpand: () => void
}
```

#### `VariantItem`
```ts
interface VariantItemProps {
  id: string
  name: string
  color: string     // ドット色
  meta?: string     // 右側の説明（「税務署提出用」等）
  active: boolean
  onClick: () => void
}
```

#### `RuleItem`
```ts
interface RuleItemProps {
  ruleId: string
  severity: 'error' | 'warning' | 'info'
  description: string
  target?: string
}
```

#### `DataSourceNode`
```ts
interface DataSourceNodeProps {
  label: string
  type: 'obj' | 'col' | 'str' | 'num'
  depth: number
  expandable: boolean
  expanded: boolean
  onToggle: () => void
  onDragStart?: (path: string) => void  // バインディングへのD&D
}
```

#### `ResizeHandle` / `SnapLine`
- 既に `CanvasElement.tsx` 内に `ResizeHandleEl` として実装済み。Molecule として独立ファイルに切り出す。

---

### Organisms — useReportStore 接続設計

#### `AppHeader`
```ts
// store から取得
const reportName = useReportStore(s => s.report.name)
const setReportName = useReportStore(s => s.setReportName)
// Props で受け取る（外部から）
interface AppHeaderProps {
  onPreview: () => void
  onExport: () => void
  onSave: () => void
}
```

#### `EditorToolbar`
```ts
// store から取得
const { undo, redo, historyIndex, history } = useReportStore(...)
const canUndo = historyIndex > 0
const canRedo = historyIndex < history.length - 1
// 新規追加が必要な store actions
// - alignElements(pageId, elementIds, alignment)  ← 未実装
// - bringForward / sendBackward  ← 未実装（削除されていたので再追加）
// Props
interface EditorToolbarProps {
  zoomLevel: number
  onZoomChange: (v: number) => void
  activeVariant: string
  variants: string[]
  onVariantChange: (v: string) => void
  showGrid: boolean
  onToggleGrid: () => void
  showRuler: boolean
  onToggleRuler: () => void
}
```

#### `LayerPanel`
```ts
// store から取得
const page = useReportStore(selectActivePage)
const selectedIds = useReportStore(s => s.selection.selectedElementIds)
const selectElement = useReportStore(s => s.selectElement)
// page.sections[] → SectionLayerItem + LayerItem のツリー構築
```

#### `PropertiesPanel`（タブ構成）
```ts
// store から取得
const selectedElements = useReportStore(selectSelectedElements)
const activePage = useReportStore(selectActivePage)
const updateElement = useReportStore(s => s.updateElement)

// タブ構成（element.type に応じて変化）
// - text:      基本 / スタイル / バインディング / 制約
// - image:     基本 / スタイル
// - shape:     基本 / スタイル
// - table:     基本 / テーブル構造 / ページング
// - dataField: 基本 / スタイル / バインディング / 制約
// - chart:     基本
```

#### `BasicPropsPanel`
```ts
interface BasicPropsPanelProps {
  elementId: string
  pageId: string
  position: { x: number; y: number }   // mm
  size: { width: number; height: number }  // mm
  zIndex: number
  onUpdate: (patch: Partial<ReportElement>) => void
}
```

#### `StylePropertiesTab`（旧 `StylePropsPanel` をリネーム）
```ts
interface StylePropertiesTabProps {
  style: Partial<TextStyle>    // ← Partial: undefined = テンプレートデフォルト継承
  defaultStyle: TextStyle      // ← テンプレートデフォルト（PropInputUnit の placeholder 用）
  onUpdate: (patch: Partial<TextStyle>) => void
  onResetAll: () => void       // ← 全プロパティ一括リセット
}
```

#### `BindingPropsPanel`
```ts
interface BindingPropsPanelProps {
  fieldKey?: string          // dataField 用
  content?: string           // text 用（{{binding}} 含む）
  expression?: string        // 計算式
  onUpdate: (patch: Partial<ReportElement>) => void
}
```

#### `DataSourcePanel`
```ts
// store から取得
const dataSource = useReportStore(s => s.report.dataSource)
const setDataSource = useReportStore(s => s.setDataSource)
// DataSourceNode ツリーを dataSource.fields から再帰構築
```

#### `VariantsPanel`
```ts
// Phase 1 では OutputVariant が未実装なのでプレースホルダー表示
// Phase 2 以降で store.report.outputVariants に接続
```

#### `ValidationRulesPanel`
```ts
// Phase 1 では ValidationRule が未実装なのでプレースホルダー表示
// Phase 2 以降で store.report.validationRules に接続
```

---

### Templates — レイアウト詳細

#### `EditorLayout`
```
grid-template-rows: 40px 36px 1fr 176px
grid-template-columns: 240px 1fr 280px
grid-template-areas:
  "header  header  header"
  "toolbar toolbar toolbar"
  "left    canvas  right"
  "bottom  bottom  bottom"
```
- 各エリアをスロット（`children` の名前付き props）で受け取る。
- `AppHeader`, `EditorToolbar`, `LeftPanel`, `ReportCanvas`, `PropertiesPanel`, `BottomPanel` を配置。

#### `PreviewLayout`
```ts
interface PreviewLayoutProps {
  pages: Page[]
  data: Record<string, unknown>
  onClose: () => void
}
```
- 各ページを `ReportCanvas readonly={true}` で縦列に並べる。

---

### Storybook 追加ファイル計画（Phase 1）

新規作成が必要な stories ファイル（既存6ファイルに追加）。
**※ 太字は TextElement ブレストとの整合性チェック後に追加・変更した項目**

```
src/lib/                                   ← テスト対象の新規 lib
  tokenParser.ts + tokenParser.test.ts
  calculationEngine.ts + calculationEngine.test.ts
  textStyleUtils.ts + textStyleUtils.test.ts
  numberFormatter.ts + numberFormatter.test.ts
  dateFormatter.ts + dateFormatter.test.ts

src/hooks/
  useInlineEdit.ts + useInlineEdit.test.ts

src/components/atoms/
  IconButton.tsx + IconButton.stories.tsx
  PropInput.tsx + PropInput.stories.tsx
  PropInputUnit.tsx + PropInputUnit.stories.tsx   ← 継承対応版（Inherited/Overridden/Error の3 Story）
  ColorInput.tsx + ColorInput.stories.tsx         ← 旧 ColorSwatch を拡張統合
  FontFamilySelect.tsx + FontFamilySelect.stories.tsx  ← 新規追加
  StyleButton.tsx + StyleButton.stories.tsx
  Toggle.tsx（shadcn Switch のラッパー）+ Toggle.stories.tsx
  Badge.tsx + Badge.stories.tsx
  EmptyState.tsx + EmptyState.stories.tsx

src/components/molecules/
  PropRow.tsx + PropRow.stories.tsx
  PropRow2.tsx + PropRow2.stories.tsx
  TextStyleToggleGroup.tsx + TextStyleToggleGroup.stories.tsx  ← 旧 StyleToolbar を分割
  TextAlignGroup.tsx + TextAlignGroup.stories.tsx              ← 旧 StyleToolbar を分割
  PaddingInputGroup.tsx + PaddingInputGroup.stories.tsx        ← 新規追加
  BindingPathInput.tsx + BindingPathInput.stories.tsx
  PaletteItem.tsx + PaletteItem.stories.tsx
  PaletteCategory.tsx + PaletteCategory.stories.tsx
  LayerItem.tsx + LayerItem.stories.tsx
  SectionLayerItem.tsx + SectionLayerItem.stories.tsx
  VariantItem.tsx + VariantItem.stories.tsx
  RuleItem.tsx + RuleItem.stories.tsx
  DataSourceNode.tsx + DataSourceNode.stories.tsx
  ResizeHandle.tsx（CanvasElement から切り出し）
  SnapLine.tsx（新規）

src/components/canvas/                    ← キャンバス固有コンポーネント
  TextElementRenderer.tsx + TextElementRenderer.stories.tsx    ← 新規追加
  TextInlineEditor.tsx + TextInlineEditor.stories.tsx          ← 新規追加
  EditableContent.tsx                                          ← 新規追加（stories なし）
  MentionPicker.tsx + MentionPicker.stories.tsx                ← 新規追加

src/components/organisms/
  AppHeader.tsx + AppHeader.stories.tsx
  EditorToolbar.tsx + EditorToolbar.stories.tsx（Toolbar.tsx をリネーム・拡張）
  LayerPanel.tsx + LayerPanel.stories.tsx
  StylePropertiesTab.tsx + StylePropertiesTab.stories.tsx      ← 旧 StylePropsPanel をリネーム
  BindingPropertiesTab.tsx + BindingPropertiesTab.stories.tsx  ← 旧 BindingPropsPanel をリネーム
  ConstraintPropertiesTab.tsx + ConstraintPropertiesTab.stories.tsx  ← 旧 ConstraintPropsPanel をリネーム
  TemplateSettingsDialog.tsx + TemplateSettingsDialog.stories.tsx    ← 新規追加
  DataSourcePanel.tsx（既存を移動）
  VariantsPanel.tsx（新規、Phase 1 はプレースホルダー）
  ValidationRulesPanel.tsx（新規、Phase 1 はプレースホルダー）

src/components/templates/
  EditorLayout.tsx + EditorLayout.stories.tsx
  PreviewLayout.tsx + PreviewLayout.stories.tsx
```

**廃止コンポーネント（リネーム/分割により削除）:**
- `ColorSwatch` → `ColorInput` に吸収
- `StyleToolbar` → `TextStyleToggleGroup` + `TextAlignGroup` に分割
- `StylePropsPanel` → `StylePropertiesTab` にリネーム
- `BindingPropsPanel` → `BindingPropertiesTab` にリネーム
- `ConstraintPropsPanel` → `ConstraintPropertiesTab` にリネーム
- `BasicPropsPanel` → `BasicPropertiesTab` にリネーム（`PropertiesPanel` の内部コンポーネントとして）

---

---

## キャンバス配置 Element の要件定義

---

### 設計方針（決定事項）

- **RepeatingContainer のキャンバス表示:** 破線ボーダー + `REPEATING: {binding}[]` ラベルを左上に表示。内部にテンプレート行を1件のみ描画する。
- **Checkbox / Radio / Select の編集モード:** デフォルト値の変更操作を編集モードでも行える（クリック/選択が機能する）。
- **編集モードと プレビューモードの差分:** 編集モードは選択ハンドル・ラベル・バインディングプレースホルダーを表示。プレビューモードは実データで描画し、ハンドルは非表示。

---

### Element 種別一覧と実装フェーズ

| 種別 | 型名（TypeScript） | フェーズ | UI モック対応 |
|---|---|---|---|
| テキスト | `TextElement` | Phase 1 ✅ 実装済み | `el-text` |
| ラベル | `LabelElement` | Phase 1 | `el-label` |
| データフィールド | `DataFieldElement` | Phase 1 ✅ 実装済み | `el-data-field` |
| 画像 | `ImageElement` | Phase 1 ✅ 実装済み | `el-img` |
| 図形（矩形・円・線） | `ShapeElement` | Phase 1 ✅ 実装済み | `el-shape-rect`, `el-line` |
| テーブル | `TableElement` | Phase 1 ✅ 実装済み | `el-table` |
| チャート | `ChartElement` | Phase 1 ✅ 実装済み | — |
| バーコード | `BarcodeElement` | Phase 2 | `el-barcode` |
| QRコード | `QRCodeElement` | Phase 2 | — |
| チェックボックス | `CheckboxElement` | Phase 2 | palette: Checkbox |
| ラジオボタン | `RadioElement` | Phase 2 | palette: RadioElement |
| セレクトボックス | `SelectElement` | Phase 2 | palette: TableElement(入力系) |
| 手書き入力フィールド | `ManualEntryField` | Phase 2 | palette: ManualEntry |
| コードマップフィールド | `CodeMappedField` | Phase 3 | palette: CodeMapped |
| 繰り返しコンテナ | `RepeatingContainer` | Phase 2 | palette: Repeating |
| 複合要素 | `CompositeElement` | Phase 3 | — |
| 注釈エリア | `AnnotationArea` | Phase 3 | — |

---

### Phase 1: 既存 Element の詳細要件

#### `TextElement`

**キャンバス描画**
- `whiteSpace: pre-wrap` + `wordBreak: break-word` でテキストを折り返し表示
- 編集モード: ダブルクリックでインライン編集（`contenteditable` or モーダル）
- バインディング `{{key}}` トークンは編集モードではそのまま表示、プレビューモードでは実値に置換

**TypeScript 型（拡張済み — TextElement ブレスト参照）**
```ts
interface TextElement extends ElementBase {
  type: 'text'
  content: string     // {{token}} を含む可能性あり
  style: Partial<TextStyle>  // undefined = テンプレートデフォルト継承（CSS inherit モデル）
}
```

`TextStyle` は 16プロパティに拡張済み（lineHeight, textDecoration, letterSpacing, verticalAlign,
backgroundColor, padding, overflow, wordBreak, whiteSpace 追加）。
詳細は `2026-04-05-text-element-brainstorm.md` の「TextStyle の完全定義」セクションを参照。

**プロパティパネルのタブ:** 基本 / スタイル / バインディング

**Storybook stories:** 詳細は TextElement ブレスト「Storybook 全 Story 一覧」参照（23 Story）

---

#### `LabelElement`（新規追加）

**UIモック:** `el-label` — 小さいフォント（11px）、色は `--text-2`、テキストのみ。編集不可の静的ラベル。

**キャンバス描画**
- テキストよりも小さく薄い色で表示（ラベル専用スタイル）
- 改行なし、1行固定。オーバーフローは ellipsis
- 編集モード: クリックでプロパティパネルに遷移（インライン編集なし）

**TypeScript 型（新規）**
```ts
interface LabelElement extends ElementBase {
  type: 'label'
  content: string
  style: Pick<TextStyle, 'fontSize' | 'color' | 'fontFamily'>
}
```

**プロパティパネルのタブ:** 基本 / スタイル

**Storybook stories:** Default, LongText（ellipsis確認）

---

#### `DataFieldElement`

**UIモック:** `el-data-field` — 下線ダッシュボーダー、primary色テキスト、monospace フォント

**キャンバス描画（編集モード）**
- `border-bottom: 1px dashed var(--primary)` スタイルで表示
- 実データなし時: `label` または `{{fieldKey}}` をプレースホルダーとして表示（斜体・グレー）
- データあり時: `resolveField(data, fieldKey)` の結果を表示

**キャンバス描画（プレビューモード）**
- 実データのみ表示、dashed border は除去
- `format` パターンが設定されている場合はフォーマット適用（例: `¥#,##0`）

**TypeScript 型（拡張）**
```ts
interface DataFieldElement extends ElementBase {
  type: 'dataField'
  fieldKey: string          // dot-notation（例: employee.name）
  label?: string            // プレースホルダーラベル
  format?: string           // 書式パターン（¥#,##0 等）→ numberFormatter / dateFormatter で処理
  defaultValue?: string     // データなし時のデフォルト値
  style: Partial<TextStyle> // ← Partial: undefined = テンプレートデフォルト継承
}
```

**プロパティパネルのタブ:** 基本 / スタイル / バインディング / 制約

**Storybook stories:** WithData, NoData（プレースホルダー表示）, Formatted

---

#### `TableElement`

**UIモック:** 列ヘッダー（背景 `#f1f5f9`、太字）、`border-collapse: collapse`、セル padding 4px 8px

**キャンバス描画**
- ヘッダー行: 背景グレー・太字
- データ行: 白背景
- セルの `{{binding}}` トークンは編集モードではそのまま表示
- 列幅は `tableLayout: fixed`

**編集モード専用:** テーブルヘッダーをクリックで列設定パネルを開く（Phase 2）

**TypeScript 型（拡張）**
```ts
interface TableElement extends ElementBase {
  type: 'table'
  rows: number
  columns: number
  data: string[][]          // セルコンテンツ（{{binding}} トークン可）
  headerRow: boolean
  dataBinding?: string      // Collection バインディングパス（RepeatingContainer 的用途）
  columnWidths?: number[]   // 各列の幅（mm）
}
```

**プロパティパネルのタブ:** 基本 / テーブル構造 / スタイル / バインディング

**Storybook stories:** Default, WithBinding, LargeTable, NoHeader

---

#### `ShapeElement`

**UIモック:** `el-shape-rect`（dbeafe背景、93c5fd枠線）、`el-line`（1.5px solid blue）

**キャンバス描画（矩形）**
- `fill`（背景色）、`stroke`（枠線色）、`strokeWidth`、`borderRadius` を適用

**キャンバス描画（線）**
- SVG `<line>` で描画。`x1=0, y1=height/2` → `x2=width, y2=height/2`

**キャンバス描画（円）**
- `border-radius: 50%` div

**TypeScript 型（拡張）**
```ts
interface ShapeElement extends ElementBase {
  type: 'shape'
  shape: 'rectangle' | 'circle' | 'line'
  fill?: string
  stroke?: string
  strokeWidth?: number
  borderRadius?: number      // 矩形の角丸（mm）
  opacity?: number           // 0〜1
}
```

**プロパティパネルのタブ:** 基本 / スタイル

**Storybook stories:** Rectangle, Circle, Line, WithOpacity

---

#### `ImageElement`

**UIモック:** `el-img` — プレースホルダー表示（破線枠 + 画像アイコン）

**キャンバス描画（編集モード）**
- src が空の場合: 破線枠 + 画像アイコン + "画像を設定" テキスト
- src がある場合: `<img>` で表示。`objectFit` に応じて contain / cover / fill

**プロパティパネル:** 画像URLまたはファイルアップロード、alt テキスト、objectFit 設定

**TypeScript 型（変更なし）**
```ts
interface ImageElement extends ElementBase {
  type: 'image'
  src: string
  alt: string
  objectFit: 'contain' | 'cover' | 'fill'
}
```

**Storybook stories:** Placeholder, WithSrc, Cover, Contain

---

#### `ChartElement`

**キャンバス描画**
- 編集モード・プレビューモード共に `[{chartType} chart]` プレースホルダー（Phase 1）
- Phase 2 以降: recharts ライブラリで実グラフ描画

**TypeScript 型（変更なし）**

**Storybook stories:** Bar, Line, Pie, Donut

---

### Phase 2: 新規 Element の詳細要件

#### `BarcodeElement`（新規）

**UIモック:** `el-barcode` — バー群 + テキスト（bindingKey 値）を縦積み

**キャンバス描画**
- 編集モード: バーコードのシミュレーション描画（疑似バー）+ `{{fieldKey}}` テキスト
- プレビューモード: `JsBarcode` / `react-barcode` ライブラリでリアルなバーコードを描画

**TypeScript 型（新規）**
```ts
interface BarcodeElement extends ElementBase {
  type: 'barcode'
  fieldKey: string           // バーコードに変換する値のバインディングパス
  barcodeType: 'CODE128' | 'EAN13' | 'QR' | 'NW7'
  showText: boolean          // テキスト値を下部に表示するか
}
```

**プロパティパネルのタブ:** 基本 / バインディング

---

#### `QRCodeElement`（新規）

**キャンバス描画**
- 編集モード: QRコード格子パターンのモック表示
- プレビューモード: `qrcode.react` で実 QR コードを描画

**TypeScript 型（新規）**
```ts
interface QRCodeElement extends ElementBase {
  type: 'qrcode'
  fieldKey: string           // QR化する値のバインディングパス
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H'
}
```

---

#### `CheckboxElement`（新規）

**キャンバス描画**
- 四角い枠 + チェックマーク（checked 状態をデフォルト値として保持）
- 編集モード: クリックで checked/unchecked を切り替え可能（デフォルト値設定）
- プレビューモード: `fieldKey` の値（boolean）に応じて表示

**TypeScript 型（新規）**
```ts
interface CheckboxElement extends ElementBase {
  type: 'checkbox'
  label?: string             // チェックボックス横のラベル
  fieldKey?: string          // バインディングパス（boolean 値）
  defaultChecked: boolean
  style?: Pick<TextStyle, 'fontSize' | 'color'>
}
```

---

#### `RadioElement`（新規）

**キャンバス描画**
- 円形枠 + 内側円（selected 状態）
- 編集モード: クリックで selected 切り替え可能

**TypeScript 型（新規）**
```ts
interface RadioElement extends ElementBase {
  type: 'radio'
  groupKey: string           // 同グループの RadioElement を識別するキー
  value: string              // この選択肢の値
  label?: string
  fieldKey?: string          // バインディングパス
  defaultSelected: boolean
  style?: Pick<TextStyle, 'fontSize' | 'color'>
}
```

---

#### `SelectElement`（新規）

**キャンバス描画**
- ドロップダウン形状（枠線 + 下向き矢印）
- 編集モード: クリックで options を展開できる

**TypeScript 型（新規）**
```ts
interface SelectElement extends ElementBase {
  type: 'select'
  options: Array<{ value: string; label: string }>
  fieldKey?: string          // バインディングパス
  defaultValue?: string
  style?: Pick<TextStyle, 'fontSize' | 'color'>
}
```

---

#### `ManualEntryField`（新規）

**UIモック:** テキスト入力フィールド（下線スタイル）

**キャンバス描画**
- 編集モード: `input[type=text]` として表示、実際にタイプ可能（デフォルト値設定）
- プレビューモード: 空フィールド表示（記入用帳票）

**TypeScript 型（新規）**
```ts
interface ManualEntryField extends ElementBase {
  type: 'manualEntry'
  label?: string
  defaultValue?: string
  constraint?: {
    required?: boolean
    maxLength?: number
    charType?: 'any' | 'fullwidth' | 'halfwidth' | 'numeric' | 'alphanumeric'
    pattern?: string
  }
  style: Partial<TextStyle> // ← Partial: undefined = テンプレートデフォルト継承
}
```

---

#### `RepeatingContainer`（新規）

**キャンバス描画（編集モード）**
- 破線ボーダー（`border: 2px dashed #6366f1`）で囲む
- 左上角に `REPEATING: {binding}[]` ラベル（紫バッジ）
- 内部にテンプレート行を **1件分のみ** 描画（実データではなくプレースホルダー）
- ドラッグ可能（コンテナごと移動）

**キャンバス描画（プレビューモード）**
- 実データの件数分だけテンプレートを繰り返し描画

**TypeScript 型（新規）**
```ts
interface RepeatingContainer extends ElementBase {
  type: 'repeatingContainer'
  binding: string                        // コレクションのバインディングパス（例: items）
  layoutMode: 'stacked' | 'table' | 'grid'
  templateElements: ReportElement[]      // 1件分のテンプレート要素
  minRows?: number
  maxRowsPerPage?: number
}
```

---

### Phase 3: 高度 Element の要件

#### `CodeMappedField`

コードセット（マスターデータ）から値を参照して表示するフィールド。
- `codeSetId`: コードセットの識別子
- `fieldKey`: コードキーのバインディングパス
- 表示値: コードセットから `fieldKey` の値に対応するラベルを取得

#### `CompositeElement`

複数の Element をグループ化した複合要素。
- 子要素を `children: ReportElement[]` で保持
- グループとして移動・リサイズ可能
- キャンバス上では境界線なしで子要素をそのまま描画

#### `AnnotationArea`

PDF 出力には含まれない編集メモ・注釈エリア。
- キャンバス上では黄色い付箋スタイルで表示
- `printable: false` 固定（プレビュー・エクスポートには含まれない）

---

### ElementRenderer の拡張設計

現在の `src/components/canvas/ElementRenderer.tsx` の `switch` 文に以下を追加:

```
Phase 1 追加:
  case 'label'     → LabelElement 描画

Phase 2 追加:
  case 'barcode'   → BarcodeElementRenderer（編集時はモック、preview時は JsBarcode）
  case 'qrcode'    → QRCodeElementRenderer（編集時はモック、preview時は qrcode.react）
  case 'checkbox'  → CheckboxElementRenderer（interactive）
  case 'radio'     → RadioElementRenderer（interactive）
  case 'select'    → SelectElementRenderer（interactive）
  case 'manualEntry'      → ManualEntryRenderer
  case 'repeatingContainer' → RepeatingContainerRenderer

Phase 3 追加:
  case 'codeMapped'  → CodeMappedFieldRenderer
  case 'composite'   → CompositeElementRenderer（再帰的に ElementRenderer を呼ぶ）
  case 'annotation'  → AnnotationAreaRenderer
```

### ReportElement Union 型の拡張

```ts
export type ReportElement =
  // Phase 1
  | TextElement
  | LabelElement        // 新規
  | ImageElement
  | TableElement
  | ChartElement
  | ShapeElement
  | DataFieldElement
  // Phase 2
  | BarcodeElement      // 新規
  | QRCodeElement       // 新規
  | CheckboxElement     // 新規
  | RadioElement        // 新規
  | SelectElement       // 新規
  | ManualEntryField    // 新規
  | RepeatingContainer  // 新規
  // Phase 3
  | CodeMappedField     // 新規
  | CompositeElement    // 新規
  | AnnotationArea      // 新規
```

### ElementBase の拡張

全 Element 共通で以下のプロパティを追加:

```ts
interface ElementBase {
  id: string
  type: ElementType
  position: Position       // mm
  size: Size               // mm
  zIndex: number
  locked: boolean
  visible: boolean
  // 追加するプロパティ:
  visibilityRule?: string  // 表示条件式（例: "variant.audience !== 'internal'"）
  printable?: boolean      // PDF/PNG 出力に含めるか（AnnotationArea は false 固定）
  name?: string            // レイヤーパネルに表示する人間可読な名前
}
```

### パレット（ElementPalette）の拡張

UIモックに合わせてカテゴリ分けを変更:

| カテゴリ | 要素 | フェーズ |
|---|---|---|
| テキスト系 | TextElement, LabelElement | Phase 1 |
| 図形系 | LineElement, RectangleElement, ImageElement | Phase 1 |
| 入力系 | CheckboxElement, RadioElement, SelectElement, ManualEntryField, CodeMappedField | Phase 2/3 |
| 複合・繰り返し | TableElement, RepeatingContainer, CompositeElement | Phase 1/2/3 |
| 特殊 | BarcodeElement, QRCodeElement, AnnotationArea, ChartElement | Phase 2/3 |

---

## Next Steps

→ `/workflows:plan` で実装計画を作成する

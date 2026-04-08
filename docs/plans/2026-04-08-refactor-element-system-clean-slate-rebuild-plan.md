---
title: "refactor: 要素システム Clean-slate リビルド"
type: refactor
status: active
date: 2026-04-08
origin: docs/brainstorms/2026-04-08-element-system-redesign-brainstorm.md
---

# refactor: 要素システム Clean-slate リビルド

## Enhancement Summary

**Deepened on:** 2026-04-08
**Sections enhanced:** 7
**Research agents used:** Composition patterns, PDF export, Architecture review, Security review, Learnings review, Recharts docs (Context7), JsBarcode/html2canvas (WebSearch)

### Key Improvements
1. **DataResolver を render prop → custom hook (`useDataResolver`) に変更** — 現代の React ベストプラクティスに基づく
2. **html2canvas の CSS Grid 制限を特定** — manualEntry グリッドは CSS border 方式をプライマリに、html2canvas-pro を検討
3. **ElementErrorBoundary の追加** — 個別要素のクラッシュをキャンバス全体に伝播させない
4. **画像アップロード API のセキュリティ仕様を具体化** — ファイルタイプ検証、サイズ制限、UUID ファイル名
5. **barcode の JAN13 = EAN-13 確認** — JsBarcode が EAN-13 としてネイティブサポート
6. **Recharts の具体的 API パターンを文書化** — ResponsiveContainer + 4 チャートタイプの実装パターン
7. **Zod スキーマを型定義と同時に作成** — Runtime 型ガードの初日からの導入

### New Considerations Discovered
- html2canvas は CSS Grid を完全サポートしていない → border-based 実装をプライマリに
- foreignObject は Safari で制限が厳しい → hanko は SVG text 維持 + PDF テスト優先
- `updateElement()` の `Partial<ReportElement>` パッチは型安全でない → `ALLOWED_KEYS_BY_TYPE` ホワイトリスト検討
- Recharts は SVG ベースで PDF 出力と相性が良い（html2canvas でキャプチャ可能）

## Overview

報告書デザインスタジオの全17要素を Composition 型パターンでゼロから再設計する。共通ビルディングブロック（`ElementFrame`, `TextContent`, `DataResolver` 等）を作り、各要素はそれらを組み合わせて構築する。label と table を廃止し 15 要素に整理。chart を Recharts で新規実装。PDF 出力安定性を最優先とする。

## Problem Statement / Motivation

現状の要素システムには以下の構造的問題がある:

1. **コード重複**: Text/Label の PropertiesPanel がほぼ同一。各要素のテキストスタイリング、ボーダー設定、データバインディング UI が個別実装
2. **PDF 出力不安定**: manualEntry のグリッド（SVG）、hanko の SVG テキスト、ruby 要素が html2canvas→jsPDF パイプラインで正しくレンダリングされない可能性
3. **未実装要素**: chart はプレースホルダー、barcode の code39/jan13 はスタブ
4. **要素の棲み分け不明確**: table / repeatingBand / formTable の 3 つのテーブル系要素が類似機能を持つ
5. **機能の不一貫**: ふりがな、書式設定、データバインディングの対応が要素ごとにバラバラ
6. **マジックナンバー散在**: mm→px 変換の `3.78` が各所にハードコード
7. **未使用型フィールド**: `groupBy`, `pageBreak` が型定義にあるが未実装

(see brainstorm: docs/brainstorms/2026-04-08-element-system-redesign-brainstorm.md)

## Proposed Solution

### Composition 型アーキテクチャ

```
src/elements/
├── _blocks/                   ← NEW: 共通ビルディングブロック
│   ├── renderers/
│   │   ├── ElementFrame.tsx       ボーダー、背景色、パディング
│   │   ├── TextContent.tsx        テキスト描画（フォント、配置、縦書き、ルビ）
│   │   ├── ElementErrorBoundary.tsx  要素単位のエラーキャッチ
│   │   ├── GridLines.tsx          CSS border ベース線描画
│   │   ├── BarcodeContent.tsx     QR/CODE128/CODE39/EAN13(JAN13)
│   │   └── ChartContent.tsx       Recharts wrapper
│   ├── hooks/
│   │   └── useDataResolver.ts     フィールド解決 + フォーマット適用
│   ├── panels/
│   │   ├── TextStyleSection.tsx   フォント、サイズ、太字、色、配置、縦書き
│   │   ├── BorderSection.tsx      ボーダー色、幅、スタイル、角丸
│   │   ├── DataBindingSection.tsx フィールドキー入力
│   │   ├── FormatSection.tsx      書式設定（小数桁数、カスタムパターン含む）
│   │   ├── LayoutSection.tsx      レイアウト選択
│   │   ├── FuriganaSection.tsx    ふりがな設定
│   │   ├── ColorSection.tsx       色設定（背景、交互行色）
│   │   └── ImageUploadSection.tsx 画像アップロード（Base64 / サーバー）
│   └── constants.ts               MM_TO_PX, 共通定数
├── _base/                     ← 既存: 低レベル UI プリミティブ（維持）
│   ├── sharedUI.tsx               PropSection, PropRow, NumInput, etc.
│   └── styleUtils.ts             toFlexAlign, etc.
├── text/                      ← label 統合後
├── dataField/
├── image/
├── shape/
├── chart/                     ← 新規実装
├── barcode/
├── checkbox/
├── eraSelect/
├── hanko/
├── manualEntry/
├── approvalStampRow/
├── revenueStamp/
├── repeatingBand/
├── repeatingList/
└── formTable/                 ← table 機能統合
```

### 要素の統合・変更サマリ

| 要素 | 変更内容 |
|------|----------|
| text | label 統合。ふりがな強化。`content` フィールドに統一 |
| ~~label~~ | **廃止** → text に統合 |
| dataField | FormatSection で小数桁数・カスタムパターン UI 完全化 |
| image | ImageUploadSection 追加（小: Base64 / 大: サーバー） |
| shape | SVG 維持（PDF 互換 OK）。変更最小 |
| ~~table~~ | **廃止** → formTable に統合 |
| chart | **新規実装** — Recharts (SVG ベース) |
| barcode | code39 / jan13 実装 |
| checkbox | ラベル位置オプション追加 (left/right/top/bottom) |
| eraSelect | マジックナンバー定数化 |
| hanko | SVG text 維持（foreignObject は Safari 制限で断念）。PDF テスト優先 |
| manualEntry | SVG グリッド → CSS border ベース（html2canvas の CSS Grid 制限を回避） |
| approvalStampRow | ImageUploadSection 統合 |
| revenueStamp | 変更最小 |
| repeatingBand | groupBy / pageBreak 実装、数値ソート修正 |
| repeatingList | pageBreak 実装 |
| formTable | table 機能統合、FormatSection 統合 |

## Technical Approach

### Architecture

#### 型定義の変更 (`src/types/index.ts`)

```typescript
// 廃止する型
// - LabelElement (TextElement に統合)
// - TableElement (FormTableElement に統合)

// ElementType union から 'label' | 'table' を除去

// TextElement の変更
export interface TextElement extends ElementBase {
  type: 'text'
  content: string          // 旧 Label の text もここに統一
  style: TextStyle
  furigana?: string
  furiganaScale?: number   // default: 0.5
}

// ChartElement の拡張
export interface ChartElement extends ElementBase {
  type: 'chart'
  chartType: 'bar' | 'line' | 'pie' | 'donut'
  dataBinding?: string
  title?: string
  xAxisKey?: string        // NEW
  yAxisKeys?: string[]     // NEW
  colors?: string[]        // NEW
  showLegend?: boolean     // NEW
  showGrid?: boolean       // NEW
}

// ImageElement の拡張
export interface ImageElement extends ElementBase {
  type: 'image'
  src: string              // URL or data: URI
  alt: string
  objectFit: 'contain' | 'cover' | 'fill' | 'none'
  opacity?: number
  uploadMethod?: 'base64' | 'server'  // NEW: tracking
}

// RepeatingBandElement の拡張
// groupBy: string → 実装 (グループヘッダー表示)
// pageBreak: 'none' | 'before' | 'after' → 実装

// CheckboxElement の拡張
// labelPosition: 'left' | 'right' | 'top' | 'bottom' → NEW
```

#### Composition ブロック設計

**Renderer ブロック — Props 契約:**

```typescript
// src/elements/_blocks/renderers/ElementFrame.tsx
interface ElementFrameProps {
  border?: { color: string; width: number; style?: 'solid' | 'dashed' | 'dotted'; radius?: number }
  background?: string
  padding?: { top?: number; right?: number; bottom?: number; left?: number }
  children: React.ReactNode
}

// src/elements/_blocks/renderers/TextContent.tsx
interface TextContentProps {
  text: string
  style: TextStyle
  furigana?: string
  furiganaScale?: number
}

// src/elements/_blocks/hooks/useDataResolver.ts ← render prop → hook に変更
function useDataResolver(fieldKey: string, data: Record<string, unknown>, options?: {
  format?: CalculationFormat
  fallbackText?: string
}): { resolved: string; raw: unknown; error: Error | null }
```

**Panel ブロック — Props 契約:**

```typescript
// 全 Panel ブロックは element と onChange を受け取る
interface PanelBlockProps<T extends ReportElement> {
  element: T
  onChange: (patch: Partial<T>) => void
}

// TextStyleSection: element.style の編集
// BorderSection: border 関連フィールドの編集
// DataBindingSection: fieldKey / dataSource の編集
// FormatSection: format の編集（小数桁数、カスタムパターン含む）
```

### Research Insights: Composition パターン

**DataResolver は hook にすべき (render prop ではなく):**
2025-2026 の React ベストプラクティスでは、hooks が render props を置き換えている。理由:
- コールバックのネストが回避できる（複数データ依存時に特に重要）
- `useCallback` で安定した参照を返し、memo 最適化に有利
- 可読性が高い

```typescript
// ✅ MODERN: Custom hook
function TextRenderer({ element, data }: Props) {
  const { resolved } = useDataResolver(element.fieldKey, data)
  return <TextContent text={resolved} style={element.style} />
}

// ❌ AVOID: Render prop nesting
<DataResolver fieldKey={element.fieldKey} data={data}>
  {({ resolved }) => <TextContent text={resolved} style={element.style} />}
</DataResolver>
```

**ElementErrorBoundary を追加:**
個別要素のレンダリングエラー（バーコードエンコード失敗、チャートデータ不正等）がキャンバス全体をクラッシュさせないよう、各要素を Error Boundary でラップする。

```typescript
// src/elements/_blocks/renderers/ElementErrorBoundary.tsx
<ElementErrorBoundary elementId={element.id} onRetry={() => forceUpdate()}>
  <ElementRenderer element={element} data={mergedData} />
</ElementErrorBoundary>
```

**Panel は Compound Component パターン:**
各 Panel セクションが内部で共有コンテキスト（element + onChange）にアクセスし、Props drilling を削減。

**型安全性強化 — Zod スキーマを初日から:**
新しい要素型を追加する際、TypeScript interface と同時に Zod スキーマも定義。JSON インポート時の runtime バリデーションに使用。`as unknown as T` キャストは一切使わない。

### Implementation Phases

#### Phase 1: 基盤 — 共通ブロック + 定数化 + 型変更

**Tasks:**

1. `src/elements/_blocks/constants.ts` に `MM_TO_PX = 3.7795275591` 等を定義
2. `src/elements/_blocks/renderers/` に Renderer ブロック 4 種 + hook 1 種を実装:
   - `ElementFrame.tsx` — ボーダー、背景、パディング
   - `TextContent.tsx` — テキスト描画（ふりがな含む、CSS ポジション方式）
   - `useDataResolver.ts` — custom hook でフィールド解決 + フォーマット適用
   - `GridLines.tsx` — CSS border ベース（**html2canvas が CSS Grid を完全サポートしないため、border-left/right 方式をプライマリに**）
   - `ImageUploader.tsx` — Base64 / サーバーアップロード切替
   - `ElementErrorBoundary.tsx` — 要素単位のエラーキャッチ + リトライ UI
3. `src/elements/_blocks/panels/` に Panel ブロック 7 種を実装:
   - `TextStyleSection.tsx`
   - `BorderSection.tsx`
   - `DataBindingSection.tsx`
   - `FormatSection.tsx` (小数桁数 / カスタムパターン入力あり)
   - `FuriganaSection.tsx`
   - `ColorSection.tsx`
   - `ImageUploadSection.tsx`
4. `src/types/index.ts` の型変更:
   - `LabelElement` 廃止、`TextElement` に統一
   - `TableElement` 廃止
   - `ChartElement` 拡張（xAxisKey, yAxisKeys, colors 等）
   - `ImageElement` に `uploadMethod` 追加
   - `CheckboxElement` に `labelPosition` 拡張
   - `ReportElement` union から `label`, `table` 除去
5. 各ブロックのユニットテスト

**Success criteria:**
- 全ブロックが独立してレンダリング可能
- ブロック単体テスト 80%+ カバレッジ
- マジックナンバーが constants.ts に集約

**Estimated effort:** 中

### Phase 1 詳細設計

#### 1-1. `constants.ts` — 共通定数

```typescript
// src/elements/_blocks/constants.ts

/** 1mm = 3.7795275591px @ 96dpi */
export const MM_TO_PX = 3.7795275591

/** デフォルトフォントサイズ (mm) */
export const DEFAULT_FONT_SIZE = 3.5

/** デフォルト行間 */
export const DEFAULT_LINE_HEIGHT = 1.4

/** フォントファミリー一覧 */
export const FONT_FAMILIES = [
  'sans-serif', 'serif', 'monospace',
  'Noto Sans JP', 'Noto Serif JP', 'BIZ UDPGothic', 'BIZ UDPMincho',
  'Meiryo', 'MS Gothic', 'MS Mincho', 'Yu Gothic', 'Yu Mincho',
] as const

/** チャートデフォルトカラー */
export const DEFAULT_CHART_COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#a4de6c']

/** 画像アップロード制約 */
export const UPLOAD_CONSTRAINTS = {
  maxServerSize: 5 * 1024 * 1024,      // 5 MB
  maxBase64Size: 2 * 1024 * 1024,      // 2 MB
  allowedMimes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const,
} as const
```

#### 1-2. `ElementFrame.tsx` — ボーダー + 背景 + パディング

既存の要素では各 Renderer が個別にボーダーや背景を CSS で設定している。これを統一する。

```typescript
// src/elements/_blocks/renderers/ElementFrame.tsx
import { memo, type CSSProperties, type ReactNode } from 'react'
import { MM_TO_PX } from '../constants'

interface BorderConfig {
  color: string
  width: number       // mm
  style?: 'solid' | 'dashed' | 'dotted'
  radius?: number     // mm
}

interface PaddingConfig {
  top?: number; right?: number; bottom?: number; left?: number  // mm
}

interface ElementFrameProps {
  border?: BorderConfig
  background?: string
  padding?: PaddingConfig
  className?: string
  children: ReactNode
}

export const ElementFrame = memo(function ElementFrame({
  border, background, padding, className, children,
}: ElementFrameProps) {
  const style: CSSProperties = {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    ...(background && { backgroundColor: background }),
    ...(border && {
      border: `${border.width}mm ${border.style ?? 'solid'} ${border.color}`,
      borderRadius: border.radius ? `${border.radius}mm` : undefined,
    }),
    ...(padding && {
      paddingTop: padding.top ? `${padding.top}mm` : undefined,
      paddingRight: padding.right ? `${padding.right}mm` : undefined,
      paddingBottom: padding.bottom ? `${padding.bottom}mm` : undefined,
      paddingLeft: padding.left ? `${padding.left}mm` : undefined,
    }),
  }
  return <div style={style} className={className}>{children}</div>
})
```

**テスト方針:** border/background/padding の各パターンをスナップショットテスト。

#### 1-3. `TextContent.tsx` — テキスト描画

既存の TextRenderer (`src/elements/text/Renderer.tsx:16-59`) から抽出。全テキスト系要素（text, dataField, checkbox label, eraSelect 等）で再利用。

```typescript
// src/elements/_blocks/renderers/TextContent.tsx
import { memo } from 'react'
import type { TextStyle } from '@/types'
import { toFlexAlign } from '@/elements/_base/styleUtils'
import { DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT } from '../constants'

interface TextContentProps {
  text: string
  style: TextStyle
  furigana?: string
  furiganaScale?: number  // default: 0.5
}

export const TextContent = memo(function TextContent({
  text, style, furigana, furiganaScale = 0.5,
}: TextContentProps) {
  const isVertical = style.writingMode === 'vertical-rl'

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      writingMode: isVertical ? 'vertical-rl' : undefined,
      justifyContent: toFlexAlign(style.verticalAlign),
      overflow: 'hidden',
    }}>
      <div style={{
        fontSize: `${style.fontSize ?? DEFAULT_FONT_SIZE}mm`,
        fontWeight: style.fontWeight ?? 'normal',
        fontStyle: style.fontStyle ?? 'normal',
        textDecoration: style.textDecoration ?? 'none',
        color: style.color ?? '#000000',
        backgroundColor: style.backgroundColor ?? 'transparent',
        fontFamily: style.fontFamily,
        textAlign: style.textAlign ?? 'left',
        textAlignLast: style.textAlign === 'justify' ? 'justify' : undefined,
        letterSpacing: style.letterSpacing != null ? `${style.letterSpacing}em` : undefined,
        lineHeight: style.lineHeight ?? DEFAULT_LINE_HEIGHT,
        paddingTop: style.paddingTop != null ? `${style.paddingTop}mm` : undefined,
        paddingRight: style.paddingRight != null ? `${style.paddingRight}mm` : undefined,
        paddingBottom: style.paddingBottom != null ? `${style.paddingBottom}mm` : undefined,
        paddingLeft: style.paddingLeft != null ? `${style.paddingLeft}mm` : undefined,
        whiteSpace: 'pre-wrap',
        wordBreak: isVertical ? 'break-all' : 'break-word',
        alignSelf: 'stretch',
      }}>
        {furigana ? (
          // ふりがな: CSS position 方式（PDF 互換性のため <ruby> は使わない）
          <span style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute',
              top: `-${furiganaScale * 100}%`,
              left: 0,
              fontSize: `${furiganaScale * 100}%`,
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}>{furigana}</span>
            {text}
          </span>
        ) : text}
      </div>
    </div>
  )
})
```

**重要な変更点:**
- `<ruby>` → CSS position: absolute 方式（PDF 互換性）
- TextStyle のデフォルト値を constants から参照
- 全テキスト系要素で再利用可能

**テスト方針:**
- 横書き / 縦書きのスナップショット
- ふりがなありなしの表示
- 各スタイルプロパティの適用

#### 1-4. `useDataResolver.ts` — フィールド解決 hook

```typescript
// src/elements/_blocks/hooks/useDataResolver.ts
import { useMemo } from 'react'
import { resolveField } from '@/lib/dataBinding'
import { applyFormat } from '@/lib/formatUtils'
import type { CalculationFormat } from '@/types'

interface DataResolverOptions {
  format?: CalculationFormat
  fallbackText?: string
}

interface DataResolverResult {
  resolved: string
  raw: unknown
  error: Error | null
}

export function useDataResolver(
  fieldKey: string,
  data: Record<string, unknown>,
  options: DataResolverOptions = {},
): DataResolverResult {
  return useMemo(() => {
    try {
      const raw = resolveField(data, fieldKey)
      if (raw == null) {
        return { resolved: options.fallbackText ?? '', raw: null, error: null }
      }
      const formatted = options.format
        ? applyFormat(raw, options.format)
        : String(raw)
      return { resolved: formatted, raw, error: null }
    } catch (e) {
      return { resolved: options.fallbackText ?? '', raw: null, error: e as Error }
    }
  }, [fieldKey, data, options.format, options.fallbackText])
}
```

**利点 (render prop 対比):**
- ネストなし — 複数フィールドを解決する要素でも flat
- useMemo で自動メモ化
- error を返却 — ElementErrorBoundary と連携可能

#### 1-5. `GridLines.tsx` — CSS border ベースグリッド

既存の manualEntry SVG グリッド (`src/elements/manualEntry/Renderer.tsx:21-48`) を CSS border 方式に変換。

```typescript
// src/elements/_blocks/renderers/GridLines.tsx
import { memo } from 'react'

interface GridLinesProps {
  count: number          // グリッド列数
  lineColor: string
  lineWidth?: number     // mm (default: 0.3)
  showOuterBorder?: boolean  // 外枠表示 (default: true)
}

export const GridLines = memo(function GridLines({
  count, lineColor, lineWidth = 0.3, showOuterBorder = true,
}: GridLinesProps) {
  if (count <= 0) return null

  // CSS border で列を表現（html2canvas 互換性のため CSS Grid は使わない）
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0,
      width: '100%', height: '100%',
      display: 'flex',
      border: showOuterBorder ? `${lineWidth}mm solid ${lineColor}` : undefined,
      pointerEvents: 'none',
    }}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            borderRight: i < count - 1 ? `${lineWidth}mm solid ${lineColor}` : undefined,
          }}
        />
      ))}
    </div>
  )
})
```

**方針:** flexbox + border-right で列分割。CSS Grid は html2canvas で完全サポートされないため不使用。

#### 1-6. `ElementErrorBoundary.tsx` — 要素単位エラーキャッチ

```typescript
// src/elements/_blocks/renderers/ElementErrorBoundary.tsx
import { Component, type ReactNode } from 'react'

interface Props {
  elementId: string
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ElementErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  handleRetry = () => this.setState({ hasError: false, error: null })

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: '#fef2f2', border: '1px solid #fca5a5',
          fontSize: '10px', color: '#991b1b', padding: '4px',
          flexDirection: 'column', gap: '4px',
        }}>
          <span>描画エラー</span>
          <button
            onClick={this.handleRetry}
            style={{ fontSize: '9px', textDecoration: 'underline', cursor: 'pointer' }}
          >
            再試行
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
```

#### 1-7. Panel ブロック — `TextStyleSection.tsx`

既存の TextPropertiesPanel (`src/elements/text/PropertiesPanel.tsx:21-85`) から「テキストスタイル」セクションを抽出。

```typescript
// src/elements/_blocks/panels/TextStyleSection.tsx
import type { TextStyle } from '@/types'
import { PropSection, PropRow, NumInput, ColorInput, IconToggle } from '@/elements/_base/sharedUI'
import { FONT_FAMILIES, DEFAULT_FONT_SIZE } from '../constants'
// lucide icons, TextVerticalAlignIcons imports...

interface TextStyleSectionProps {
  style: TextStyle
  onStyleChange: (patch: Partial<TextStyle>) => void
  /** ふりがな表示 (default: false) */
  showFurigana?: boolean
  furigana?: string
  onFuriganaChange?: (value: string | undefined) => void
}

export function TextStyleSection({
  style, onStyleChange,
  showFurigana, furigana, onFuriganaChange,
}: TextStyleSectionProps) {
  return (
    <PropSection title="テキストスタイル">
      {/* フォント選択 */}
      {/* フォントサイズ */}
      {/* Bold/Italic/Underline/Strikethrough toggles */}
      {/* 文字色、背景色 */}
      {/* 横揃え (left/center/right/justify) */}
      {/* 縦揃え (top/middle/bottom) */}
      {/* 行間、文字間隔 */}
      {/* 文字方向 (horizontal/vertical) */}
      {/* オプション: ふりがな入力 */}
    </PropSection>
  )
}
```

**利用例:**
```typescript
// text の PropertiesPanel
<TextStyleSection
  style={el.style}
  onStyleChange={(s) => onChange({ style: { ...el.style, ...s } })}
  showFurigana
  furigana={el.furigana}
  onFuriganaChange={(v) => onChange({ furigana: v })}
/>

// dataField の PropertiesPanel（ふりがな不要）
<TextStyleSection
  style={el.style}
  onStyleChange={(s) => onChange({ style: { ...el.style, ...s } })}
/>
```

#### 1-8. Panel ブロック — その他のセクション概要

| ブロック | Props | UI 内容 |
|----------|-------|---------|
| `BorderSection` | `border: BorderConfig, onChange` | 色、幅、スタイル(solid/dashed/dotted)、角丸 |
| `DataBindingSection` | `fieldKey: string, onChange` | FieldKeyInput コンポーネント再利用 |
| `FormatSection` | `format: CalculationFormat, onChange` | 書式タイプ selector + **小数桁数 input** + **カスタムパターン input** |
| `FuriganaSection` | `enabled, ratio, dataSource, onChange` | トグル + ratio slider + data source input |
| `ColorSection` | `colors: Record<string, string>, onChange` | 動的カラーピッカーリスト（背景、交互行色等） |
| `ImageUploadSection` | `src, uploadMethod, onChange` | ファイル選択 + プレビュー + Base64/サーバー自動切替 |

**FormatSection の重要な改善:**
現在の dataField では小数桁数やカスタムパターンの入力 UI が欠落している。FormatSection で完全化する:

```typescript
// format.type === 'decimal' の場合 → 小数桁数入力を表示
// format.type === 'custom' の場合 → カスタムパターン入力を表示
<PropRow label="書式">
  <SelectInput value={format.type} onChange={...} options={FORMAT_OPTIONS} />
</PropRow>
{format.type === 'decimal' && (
  <PropRow label="小数桁数">
    <NumInput value={format.decimalPlaces ?? 2} onChange={...} min={0} max={10} />
  </PropRow>
)}
{format.type === 'custom' && (
  <PropRow label="パターン">
    <input type="text" value={format.customPattern ?? ''} onChange={...} />
  </PropRow>
)}
```

#### Phase 1 実装順序

1. `constants.ts` — 他の全ブロックが参照
2. `ElementFrame.tsx` + テスト
3. `TextContent.tsx` + テスト（ふりがな CSS 方式含む）
4. `useDataResolver.ts` + テスト
5. `GridLines.tsx` + テスト
6. `ElementErrorBoundary.tsx` + テスト
7. `TextStyleSection.tsx` + テスト
8. `BorderSection.tsx`, `DataBindingSection.tsx`, `FormatSection.tsx` + テスト
9. `FuriganaSection.tsx`, `ColorSection.tsx`, `ImageUploadSection.tsx` + テスト
10. 型定義変更（`src/types/index.ts`）+ Zod スキーマ

---

#### Phase 2: 既存要素のリビルド（テキスト系 + 基本要素）

**Tasks:**

1. **text** — Label 統合。TextContent + DataResolver ブロック使用。PropertiesPanel を TextStyleSection + FuriganaSection + DataBindingSection で構成
2. **dataField** — DataResolver + TextContent + FormatSection 使用。FormatSection に小数桁数・カスタムパターン UI 追加
3. **image** — ImageUploadSection 統合。Base64 ↔ サーバー自動切替ロジック
4. **shape** — 最小変更。ElementFrame でボーダー統一（SVG レンダリング維持）
5. **checkbox** — labelPosition 追加（left/right/top/bottom）
6. **eraSelect** — マジックナンバーを constants 参照に変更
7. **hanko** — SVG text 維持（foreignObject は Safari で制限あり断念）。PDF 出力テストで互換性確認
8. **manualEntry** — GridLines ブロック使用（SVG → CSS border ベース）。FuriganaSection 統合
9. **revenueStamp** — ElementFrame ブロック使用。最小変更
10. **approvalStampRow** — ImageUploadSection 統合
11. `ElementRenderer.tsx` から `label` / `table` の case 削除
12. `elementFactories.ts` — `createLabelElement` / `createTableElement` 廃止、他ファクトリをブロック対応に更新
13. `ElementPalette.tsx` — Label / Table をパレットから除去

**Success criteria:**
- 全既存要素が新ブロックを使用してレンダリング
- PropertiesPanel が共通セクションで構成
- 既存テスト + 新規テスト合わせて 80%+ カバレッジ

**Estimated effort:** 大

---

#### Phase 3: 新機能実装（chart + barcode 完全化 + repeating 拡張）

**Tasks:**

1. **chart 実装**:
   - `recharts` パッケージ追加
   - `src/elements/_blocks/renderers/ChartContent.tsx` — Recharts wrapper
   - `src/elements/chart/Renderer.tsx` — 4 チャートタイプ（bar, line, pie, donut）
   - `src/elements/chart/PropertiesPanel.tsx` — ChartContent 設定 UI
   - デザインプレビュー（データなし時のモック表示）
2. **barcode 完全化**:
   - `src/elements/_blocks/renderers/BarcodeContent.tsx` — 統一 barcode wrapper
   - **JAN13 は EAN-13 と同一** — JsBarcode が `EAN13` フォーマットとしてネイティブサポート。`kind: 'jan13'` は内部で `FORMAT: 'EAN13'` にマップ
   - CODE39 も JsBarcode でサポート済み。react-barcode 経由で利用可能

### Research Insights: Recharts 実装パターン

**4 チャートタイプの具体的実装:**

```typescript
// src/elements/_blocks/renderers/ChartContent.tsx
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, Label,
} from 'recharts'

interface ChartContentProps {
  chartType: 'bar' | 'line' | 'pie' | 'donut'
  data: Record<string, unknown>[]
  xAxisKey?: string
  yAxisKeys?: string[]
  colors?: string[]
  title?: string
  showLegend?: boolean
  showGrid?: boolean
  width: number   // mm
  height: number  // mm
}

// Bar: <BarChart><Bar dataKey={yAxisKeys[0]} fill={colors[0]} /></BarChart>
// Line: <LineChart><Line type="monotone" dataKey={yAxisKeys[0]} /></LineChart>
// Pie: <PieChart><Pie data={data} dataKey={yAxisKeys[0]} nameKey={xAxisKey} /></PieChart>
// Donut: Pie + innerRadius={60}
// 全て <ResponsiveContainer width="100%" height="100%"> でラップ
```

**PDF 出力との相性:** Recharts は SVG ベースで出力するため、html2canvas でキャプチャ可能。ただし `<ResponsiveContainer>` は ResizeObserver に依存するため、エクスポート時は固定サイズ指定が必要。

**デフォルトカラーパレット:**
```typescript
const DEFAULT_CHART_COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#a4de6c']
```
3. **repeatingBand 拡張**:
   - `groupBy` 実装 — グループヘッダー行の自動挿入
   - `pageBreak` 実装 — 印刷時改ページ制御
   - 数値ソート修正（localeCompare → 数値判定 + Number 変換）
4. **repeatingList 拡張**:
   - `pageBreak` 実装
5. **formTable**:
   - 旧 table のユースケースをカバーする簡易モード（rows×columns で初期化）
   - FormatSection 統合（セルレベルの書式設定 UI）

**Success criteria:**
- chart が 4 種のチャートを Recharts で描画
- barcode が 4 種全てレンダリング可能
- groupBy / pageBreak が動作
- formTable で旧 table の全ユースケースをカバー

**Estimated effort:** 大

### Phase 3 詳細設計

#### 3-1. ChartContent 実装 — Recharts wrapper

```typescript
// src/elements/_blocks/renderers/ChartContent.tsx
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, Label,
} from 'recharts'
import { memo } from 'react'
import { DEFAULT_CHART_COLORS } from '../constants'

interface ChartContentProps {
  chartType: 'bar' | 'line' | 'pie' | 'donut'
  data: Record<string, unknown>[]
  xAxisKey?: string
  yAxisKeys?: string[]
  colors?: string[]
  title?: string
  showLegend?: boolean
  showGrid?: boolean
}

export const ChartContent = memo(function ChartContent(props: ChartContentProps) {
  const { chartType, data, xAxisKey, yAxisKeys = [], colors = DEFAULT_CHART_COLORS, showLegend = true, showGrid = true } = props

  if (!data.length) {
    return <div style={{ /* プレースホルダー */ }}>データなし</div>
  }

  switch (chartType) {
    case 'bar':
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis dataKey={xAxisKey} />
            <YAxis />
            <Tooltip />
            {showLegend && <Legend />}
            {yAxisKeys.map((key, i) => (
              <Bar key={key} dataKey={key} fill={colors[i % colors.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )

    case 'line':
      return (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis dataKey={xAxisKey} />
            <YAxis />
            <Tooltip />
            {showLegend && <Legend />}
            {yAxisKeys.map((key, i) => (
              <Line key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )

    case 'pie':
    case 'donut':
      return (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey={yAxisKeys[0] ?? 'value'}
              nameKey={xAxisKey ?? 'name'}
              cx="50%" cy="50%"
              innerRadius={chartType === 'donut' ? '40%' : 0}
              outerRadius="80%"
              label={chartType === 'pie'}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip />
            {showLegend && <Legend />}
          </PieChart>
        </ResponsiveContainer>
      )
  }
})
```

**エクスポート時の注意:** `ResponsiveContainer` は ResizeObserver に依存。PDF エクスポート時は要素の `size` (mm) から固定 px サイズを計算して直接渡す。

#### 3-2. BarcodeContent 完全化

```typescript
// src/elements/_blocks/renderers/BarcodeContent.tsx
import { memo } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import ReactBarcode from 'react-barcode'
import { MM_TO_PX } from '../constants'

type BarcodeKind = 'qr' | 'code128' | 'code39' | 'jan13'

interface BarcodeContentProps {
  kind: BarcodeKind
  value: string
  width: number   // mm
  height: number  // mm
  errorCorrection?: 'L' | 'M' | 'Q' | 'H'
  darkColor?: string
  lightColor?: string
  showText?: boolean
}

// JsBarcode フォーマットマップ
const FORMAT_MAP: Record<BarcodeKind, string> = {
  qr: 'QR',           // qrcode.react で処理
  code128: 'CODE128',
  code39: 'CODE39',
  jan13: 'EAN13',     // JAN13 = EAN-13（日本名）
}

export const BarcodeContent = memo(function BarcodeContent(props: BarcodeContentProps) {
  const { kind, value, width, height, darkColor = '#000', lightColor = '#fff', showText = true } = props

  if (kind === 'qr') {
    const size = Math.min(width, height) * MM_TO_PX
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <QRCodeSVG value={value || ' '} size={size} fgColor={darkColor} bgColor={lightColor} level={props.errorCorrection ?? 'M'} />
      </div>
    )
  }

  // CODE128, CODE39, EAN13(JAN13) — react-barcode (JsBarcode) で統一処理
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <ReactBarcode
        value={value || (kind === 'jan13' ? '4901234567890' : '0000000000')}
        format={FORMAT_MAP[kind]}
        width={1.2}
        height={height * MM_TO_PX * 0.75}
        displayValue={showText}
        lineColor={darkColor}
        background={lightColor}
        margin={2}
        fontSize={8}
      />
    </div>
  )
})
```

**JAN13 バリデーション:** EAN-13 は 12 桁 + チェックディジット 1 桁 = 13 桁。JsBarcode が自動でチェックディジットを計算するが、入力値のバリデーション（数字 12-13 桁）を PropertiesPanel で行う。

#### 3-3. groupBy 実装アルゴリズム

```typescript
// repeatingBand の sortBy 後、groupBy を適用
function applyGroupBy(
  records: Record<string, unknown>[],
  groupByKey: string,
): { groupLabel: string; records: Record<string, unknown>[] }[] {
  const groups: Map<string, Record<string, unknown>[]> = new Map()
  for (const record of records) {
    const key = String(resolveField(record, groupByKey) ?? '')
    const group = groups.get(key) ?? []
    group.push(record)
    groups.set(key, group)
  }
  return Array.from(groups, ([groupLabel, recs]) => ({ groupLabel, records: recs }))
}

// レンダリング: グループヘッダー行を各グループの先頭に挿入
// グループヘッダーは groupLabel をフル幅で表示、背景色を少し変える
```

#### 3-4. 数値ソート修正

既存の問題 (`Renderer.tsx:111-113`): `String(va).localeCompare(String(vb))` は数値を辞書順でソートしてしまう。

```typescript
// 修正: 数値判定 + Number 変換
function smartCompare(a: unknown, b: unknown): number {
  const numA = Number(a)
  const numB = Number(b)
  // 両方が有効な数値の場合は数値比較
  if (!isNaN(numA) && !isNaN(numB)) return numA - numB
  // それ以外は文字列比較
  return String(a ?? '').localeCompare(String(b ?? ''))
}
```

#### 3-5. pageBreak 実装

CSS の `break-before` / `break-after` プロパティを使用。PDF 出力時に `@media print` で有効化。

```typescript
// RepeatingBand / RepeatingList の外側 div に適用
const pageBreakStyle: CSSProperties = {
  breakBefore: el.pageBreak === 'before' ? 'page' : undefined,
  breakAfter: el.pageBreak === 'after' ? 'page' : undefined,
}

// html2canvas は CSS break プロパティを直接処理できないため、
// jsPDF 側で要素の位置を基にページ分割を制御する方式を併用
```

**注意:** html2canvas は CSS print メディアクエリを無視するため、pageBreak は jsPDF 側のページ分割ロジックで実装する必要がある。具体的には:
1. 各要素の y 座標 + 高さからページ境界を計算
2. `pageBreak: 'before'` の要素が前のページに入りきる場合でも強制改ページ
3. `pageBreak: 'after'` の要素の直後で改ページ

---

#### Phase 4: PDF 出力安定化 + テンプレート作り直し

**Tasks:**

1. **PDF 出力テスト**:
   - 全 15 要素を含むテスト用テンプレート作成
   - html2canvas + jsPDF パイプラインで全要素の出力検証
   - 問題のある要素の個別修正（特に chart SVG, hanko foreignObject）
2. **ふりがなの PDF 対応**:
   - `<ruby>` → CSS position: absolute + font-size 調整方式に変更
   - TextContent ブロック内で統一
3. **既存テンプレートの作り直し**:
   - `src/templates/builtinTemplates.ts` の全テンプレートを新型定義で再作成
   - label → text, table → formTable の変換を手動で実施
4. **エクスポート互換性テスト**:
   - PNG / PDF 出力を全テンプレートで検証
   - ブラウザ間の表示差異確認（Chrome, Safari, Firefox）

**Success criteria:**
- 全 15 要素が PDF で正しく表示される
- ふりがなが PDF で読める
- 全ビルトインテンプレートが新型定義で動作

**Estimated effort:** 中

### Research Insights: PDF 出力安定性

**html2canvas の確認済み制限事項:**
| CSS 機能 | html2canvas サポート | 対策 |
|----------|---------------------|------|
| CSS Grid | **部分的** — 完全サポートではない | border-left/right ベースの実装をプライマリに |
| writing-mode: vertical-rl | **不安定** — バージョンにより挙動が異なる | テスト必須。問題があれば transform: rotate で代替 |
| `<ruby>` 要素 | **未サポート** | CSS position: absolute でシミュレーション |
| SVG 内 foreignObject | **制限的** — Safari は特に厳しい | hanko は SVG text を維持し、foreignObject は使わない |
| SVG (基本) | **可** — Recharts の SVG 出力はキャプチャ可能 | chart は SVG 直接出力で OK |
| Pseudo-elements (::before) | **部分的** | 実コンテンツは疑似要素に入れない |

**html2canvas-pro の検討:**
`html2canvas-pro` は html2canvas のフォークで、CSS カラー関数やイメージスムージングのサポートが追加されている。CSS Grid サポートも改善されている可能性があるが、プロダクション実績は html2canvas より少ない。Phase 4 のテスト段階で比較評価する。

**代替案の将来検討:**
| ライブラリ | 長所 | 短所 |
|-----------|------|------|
| Puppeteer (サーバーサイド) | ピクセルパーフェクト、全 CSS サポート | サーバーインフラ必要 |
| @react-pdf/renderer | React コンポーネントベース | 全要素を react-pdf 用に書き直す必要 |
| 現行 (html2canvas + jsPDF) | クライアントサイド完結 | CSS Grid/縦書き/ruby に制限あり |

→ 現行スタックを維持しつつ制限を回避する設計にし、将来的にサーバーサイド PDF 生成への移行パスを残す。

**hanko の方針変更:**
研究結果から、foreignObject は Safari で重大な制限がある。**hanko は既存の SVG text レンダリングを維持**し、foreignObject への変更は行わない。代わりに、PDF 出力テストで問題がないことを確認する。

**エクスポート時の注意点 (学習ドキュメントより):**
- 全ページを `Promise.all()` で並列レンダリング（ページ 0 の二重レンダリングを防止）
- `isExporting` フラグで並行エクスポートを防止（メモリ破損リスク）
- エクスポートボタンは loading 状態を表示し disabled にする
- エラーは `role="alert"` トーストで 5 秒表示（console のみは不可）

### Phase 4 詳細設計: PDF 出力テスト計画

#### 4-1. 要素別 PDF 互換性マトリクス（テスト項目）

| 要素 | レンダリング方式 | PDF リスク | テスト優先度 |
|------|-----------------|-----------|-------------|
| text | HTML/CSS | 縦書き、ふりがな | **高** |
| dataField | HTML/CSS | フォーマット表示 | 中 |
| image | `<img>` | CORS、Base64 サイズ | 中 |
| shape | SVG | 低リスク（実績あり） | 低 |
| chart | Recharts SVG | ResponsiveContainer→固定サイズ変換 | **高** |
| barcode (QR) | SVG (qrcode.react) | 低リスク | 低 |
| barcode (CODE128/39/EAN13) | SVG (JsBarcode) | 初実装のためテスト必須 | **高** |
| checkbox | HTML/CSS | 低リスク | 低 |
| eraSelect | HTML/CSS | 低リスク | 低 |
| hanko | SVG text | テキスト配置、フォント | **高** |
| manualEntry | CSS border | グリッド線の描画 | **高** |
| approvalStampRow | HTML + img | 画像読み込み | 中 |
| revenueStamp | HTML/CSS + SVG line | 低リスク | 低 |
| repeatingBand | HTML table-like | 多行、集計行 | 中 |
| repeatingList | HTML flex | カードレイアウト | 中 |
| formTable | HTML table-like | セル種別混在 | 中 |

#### 4-2. PDF テスト用テンプレート構成

全 15 要素を 1 つのテンプレートに配置し、以下のバリエーションをテスト:

**ページ 1: テキスト系**
- text (横書き + トークン補間)
- text (縦書き + ふりがな)
- dataField (通貨書式 + 小数桁数)
- label 統合確認（text で静的テキスト）

**ページ 2: データ表示系**
- chart (bar + 5 データポイント)
- chart (pie + 4 カテゴリ)
- barcode (QR + CODE128 + CODE39 + EAN13)
- image (Base64 + サーバー URL)

**ページ 3: テーブル系**
- repeatingBand (5 行 + ヘッダー + フッター集計)
- repeatingList (grid レイアウト + 4 カード)
- formTable (header + 3 body rows + footer)

**ページ 4: 入力系 + 日本語帳票**
- manualEntry (line, box, grid 各モード)
- checkbox (4 方向 labelPosition)
- eraSelect (row レイアウト)
- hanko (円形 + 矩形)
- approvalStampRow (3 セル)
- revenueStamp

#### 4-3. ふりがなの CSS position 方式詳細

```css
/* <ruby> タグの代替 — CSS position 方式 */
.furigana-wrapper {
  position: relative;
  display: inline-block;
}
.furigana-text {
  position: absolute;
  top: -0.6em;        /* 親テキストの上に配置 */
  left: 0;
  font-size: 50%;     /* furiganaScale で制御 */
  line-height: 1;
  white-space: nowrap;
  letter-spacing: 0.1em;  /* ふりがなを親テキスト幅に合わせて均等化 */
}
```

**制限:** CSS position 方式は `<ruby>` に比べて自動的な文字幅調整ができない。長いふりがなは親テキストからはみ出る可能性がある。overflow: hidden で切り詰めるか、ふりがなの letter-spacing を動的計算する。

#### 4-4. html2canvas-pro 評価計画

Phase 4 のテスト段階で以下の比較を実施:

```bash
npm install html2canvas-pro --save-dev  # 評価用
```

1. 同じテスト用テンプレートを html2canvas と html2canvas-pro の両方で出力
2. CSS border ベースの GridLines が正しくキャプチャされるか比較
3. 縦書きテキストの品質比較
4. パフォーマンス比較（100+ 要素のページ）
5. 結果に基づいて html2canvas-pro への移行を判断

---

#### Phase 5: クリーンアップ + テスト充実

**Tasks:**

1. 旧コードの完全削除:
   - `src/elements/label/` ディレクトリ削除
   - `src/elements/table/` ディレクトリ削除（formTable に統合済み）
   - `LabelElement`, `TableElement` 型の残参照を grep して全除去
2. テストカバレッジ 80%+ 達成:
   - 各ブロックのユニットテスト
   - 各要素の Renderer テスト
   - 各要素の PropertiesPanel テスト
   - PDF 出力の統合テスト（スナップショット）
3. `CLAUDE.md` 更新:
   - 新しい要素追加手順（ブロック合成パターン）
   - 廃止要素の記載削除
4. ドキュメント:
   - ブロック一覧と使い方
   - 要素タイプ一覧（15 種）

**Success criteria:**
- 旧コードが完全に除去されている
- テストカバレッジ 80%+
- `CLAUDE.md` が最新

**Estimated effort:** 小

## Alternative Approaches Considered

1. **レイヤー分離型リファクタ** — 型 → レンダリング → UI の 3 層を段階的に改善。リスクは低いが全体完了まで時間がかかり、構造的重複が残る期間が長い。(see brainstorm)

2. **課題駆動の個別修正** — Critical → High → Medium の順に個別修正。即効性は高いが構造的改善にならず、新要素追加の手間は変わらない。(see brainstorm)

3. **Config 駆動型** — 要素の機能を宣言的に定義し、汎用 Renderer/Panel が自動生成。Plugin 的だが各要素固有のレンダリングロジックに柔軟に対応しにくい。(see brainstorm)

→ **Composition 型**を選択: React の思想に合致し、柔軟性が高く、既存の sharedUI.tsx パターンの自然な拡張。

## System-Wide Impact

### Interaction Graph

- Element 作成: `ElementPalette` → `elementFactories.createXxxElement()` → `store.addElement()` → `pushHistory()` → `CanvasElement` → `ElementRenderer` → 型別 Renderer
- Element 編集: PropertiesPanel → `store.updateElement()` → immer `produce` → `pushHistory()` → ElementRenderer 再描画
- PDF 出力: `exportUtils.exportToPdf()` → `html2canvas(canvasEl)` → `jsPDF.addImage()` — ElementRenderer の DOM 出力がそのまま PDF になる

### Error & Failure Propagation

- Renderer クラッシュ → ElementRenderer の `assertNever()` が未知の型をキャッチ。Error Boundary（学習ドキュメントで要件として記載）で個別要素のクラッシュを封じ込め
- PDF 出力失敗 → try/catch + toast 通知（既存パターン `exportUtils.ts:59`）
- データバインディング解決失敗 → fallbackText 表示（DataResolver ブロック内で処理）

### State Lifecycle Risks

- **label→text マイグレーション不完全**: ビルトインテンプレートを手動で作り直すため、外部保存されたテンプレート JSON に旧 `label` 型が残る可能性。ファイルインポート時に旧型検出 + エラー表示が必要
- **Store の型不整合**: `ReportElement` union 変更後、既存の store 内データとの不整合。`loadReport` 時にバリデーション + 型変換が必要

### API Surface Parity

- `ElementRenderer.tsx` — switch 文から `label`, `table` case 削除
- `elementFactories.ts` — `createLabelElement`, `createTableElement` 削除
- `ElementPalette.tsx` — パレット項目から除去
- `src/types/index.ts` — `ElementType`, `ReportElement` union 変更
- バックエンド API (`/api/v2/templates`) — テンプレート JSON スキーマが変わるため、バックエンド側のバリデーションも更新が必要

### Integration Test Scenarios

1. **Text 要素でトークン補間 + ふりがな + PDF 出力**: text に `{{name}}` + ふりがな設定 → データバインド → PDF 出力 → ふりがなが正しく表示される
2. **formTable でヘッダー + body 繰り返し + フッター集計**: formTable に header/body/footer 行 → body を dataSource でバインド → SUM 集計がフッターに表示 → PDF 出力
3. **chart の作成→設定→PDF 出力**: chart をキャンバスに配置 → chartType 選択 → dataBinding 設定 → プレビューでチャート表示 → PDF 出力で SVG が正しくレンダリング
4. **画像アップロード（Base64 / サーバー）**: 小画像を image 要素にドロップ → Base64 で保存 → 大画像をドロップ → サーバーにアップロード → URL 参照で表示
5. **旧テンプレート JSON インポート**: `label` 型を含む旧 JSON をインポート → エラー表示 or 自動変換

## Acceptance Criteria

### Functional Requirements

- [ ] 15 種全要素が Composition ブロックを使用してレンダリングされる
- [ ] label 要素が廃止され、text に統合されている
- [ ] table 要素が廃止され、formTable に統合されている
- [ ] chart が Recharts で bar/line/pie/donut の 4 種を描画できる
- [ ] barcode が qr/code128/code39/jan13 の 4 種をレンダリングできる
- [ ] image 要素で画像アップロード（Base64 / サーバー）が動作する
- [ ] repeatingBand で groupBy / pageBreak が動作する
- [ ] repeatingList で pageBreak が動作する
- [ ] dataField の FormatSection で小数桁数・カスタムパターンが設定できる
- [ ] checkbox で labelPosition (left/right/top/bottom) が選択できる
- [ ] 全要素の PropertiesPanel が共通セクション（TextStyleSection 等）で構成されている

### Non-Functional Requirements

- [ ] 全 15 要素が PDF 出力で正しく表示される
- [ ] manualEntry のグリッドが CSS grid で描画される（SVG 不使用）
- [ ] hanko のテキストが PDF で正しく表示される
- [ ] ふりがなが PDF で正しく表示される（CSS position 方式）
- [ ] マジックナンバーが constants.ts に集約されている
- [ ] 100+ 要素のキャンバスでパフォーマンス劣化なし（React.memo 適用）

### Quality Gates

- [ ] テストカバレッジ 80%+
- [ ] ビルド成功 (`npm run build`)
- [ ] Lint パス (`npm run lint`)
- [ ] 全ビルトインテンプレートが新型定義で動作
- [ ] CLAUDE.md が最新の要素追加手順を反映

## Dependencies & Prerequisites

- `recharts` パッケージの追加（chart 実装用）
- `react-barcode` が code39 / jan13 をサポートしているか確認（非対応の場合は代替ライブラリ）
- バックエンド API のテンプレート JSON スキーマ更新（`/api/v2/templates`）
- 画像アップロード用のバックエンド API エンドポイント（サーバーアップロード方式用）

## Risk Analysis & Mitigation

| リスク | 影響 | 対策 |
|--------|------|------|
| Recharts の PDF 出力互換性 | chart が PDF で崩れる | Recharts は SVG ベースで html2canvas と相性良好（確認済み）。ResponsiveContainer はエクスポート時に固定サイズに切替 |
| ~~react-barcode が code39/jan13 非対応~~ | ~~barcode 実装不可~~ | **解決済み**: JsBarcode が CODE39, EAN-13 (=JAN13) をネイティブサポート |
| html2canvas が CSS grid を正しくキャプチャしない | manualEntry のグリッドが PDF で消える | **方針変更**: CSS border-left/right ベースをプライマリ実装に。html2canvas-pro も Phase 4 で評価 |
| ~~foreignObject の PDF 互換性~~ | ~~hanko テキストが PDF で消える~~ | **方針変更**: Safari の制限が厳しいため foreignObject は使わない。SVG text を維持 |
| 外部保存テンプレートの互換性破壊 | ユーザーの既存テンプレートが読めなくなる | ファイルインポート時に Zod スキーマで旧型検出 + エラーメッセージ表示 |
| updateElement() の型安全性 | 異なる要素タイプのフィールドが混入 | `ALLOWED_KEYS_BY_TYPE` ホワイトリストで patch をフィルタ |
| 画像アップロード API のセキュリティ | ファイル偽装、XSS、SSRF | 下記セキュリティ仕様参照 |

### Research Insights: セキュリティ要件

**画像アップロード API セキュリティ仕様:**

```typescript
// Frontend: アップロード制約
const UPLOAD_CONSTRAINTS = {
  maxSize: 5 * 1024 * 1024,        // 5 MB (サーバーアップロード)
  maxBase64Size: 2 * 1024 * 1024,  // 2 MB (Base64 inline、既存制限に合わせる)
  allowedMimes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  allowedExtensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
}
```

**Backend API 仕様 (Java/Javalin):**
- `POST /api/v2/images/upload` — MultipartFile 検証 (MIME + サイズ)
- UUID ファイル名で保存（ディレクトリトラバーサル防止）
- `Content-Disposition: attachment`（ブラウザ実行防止）
- `X-Content-Type-Options: nosniff`
- 返却: `{ url: "/api/v2/images/{uuid}.png" }`

**既存セキュリティ制御の維持:**
- `isSafeImageSrc()` — data:image/* + https:// のみ許可（SVG はブロック — XSS 防止）
- prototype pollution フィルタ — resolveField のドットパスで `__proto__`, `constructor`, `prototype` を除外
- Zod スキーマバリデーション — JSON インポート時の runtime 型検証
- CSP ヘッダー — `default-src 'self'; img-src 'self' data: https://`

**追加セキュリティ考慮事項:**
- チャートデータは Recharts に直接渡す前にサニタイズ不要（Recharts は textContent で描画、innerHTML は使わない）
- バーコード値は JsBarcode がフォーマットバリデーションを行う（不正値はエラー）
- トークン補間 `{{fieldKey}}` は React の JSX として描画されるため XSS リスクは低い（innerHTML 系 API を使わない限り安全）

## Future Considerations

- **要素プラグインシステム**: 将来的に外部プラグインで要素タイプを追加可能にする（Config 駆動型のハイブリッド）
- **ネスト要素**: 要素内に子要素を配置できるコンテナ要素
- **条件付き表示 UI**: conditionalDisplay の PropertiesPanel UI（現在は型のみ対応、UI なし）
- **アニメーション**: プレゼンテーション用途でのトランジション
- **レスポンシブサイズ**: mm 固定ではなく、パーセンテージベースのサイズ指定

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-08-element-system-redesign-brainstorm.md](../brainstorms/2026-04-08-element-system-redesign-brainstorm.md) — Key decisions: Text/Label 統合、table 廃止→formTable、Composition 型パターン採用、Recharts でチャート実装、画像アップロード Base64+サーバー両対応

### Internal References

- Element dispatcher: `src/components/canvas/ElementRenderer.tsx:46-100`
- Element factories: `src/lib/elementFactories.ts`
- Type definitions: `src/types/index.ts:194-583`
- Export pipeline: `src/lib/exportUtils.ts:1-60`
- Shared UI primitives: `src/elements/_base/sharedUI.tsx`
- Style utilities: `src/elements/_base/styleUtils.ts`
- Element palette: `src/components/sidebar/ElementPalette.tsx`

### Institutional Learnings

- React.memo 必須: `docs/solutions/performance-issues/react-canvas-rerender-optimization.md`
- Export エラーハンドリング: `docs/solutions/logic-errors/export-error-handling-json-api.md`
- XSS/画像 src バリデーション: `docs/solutions/security-issues/xss-prototype-pollution-image-validation.md`
- Runtime 型ガード必須: `docs/solutions/logic-errors/component-quality-code-cleanup.md`
- Aggregation stack overflow 防止: `docs/solutions/logic-errors/runtime-errors-aggregation-store-type-safety.md`
- Zustand batch updates + state leak: `docs/solutions/performance-issues/zustand-store-batch-updates-and-state-leak-fixes.md`
- Accessibility (ARIA, keyboard): `docs/solutions/ui-bugs/accessibility-aria-keyboard-navigation.md`
- Pointer event leak 防止: `docs/solutions/ui-bugs/canvas-editor-snap-zoom-pointer-fixes.md`

### External References

- Recharts documentation: Context7 `/recharts/recharts` (107 snippets, benchmark 86.65)
- JsBarcode supported formats: [GitHub - lindell/JsBarcode](https://github.com/lindell/JsBarcode) — CODE128, EAN-13, CODE39, ITF, MSI, Pharmacode, Codabar
- html2canvas limitations: [html2canvas features](https://html2canvas.hertzen.com/features/)
- html2canvas-pro (enhanced fork): [npm html2canvas-pro](https://www.npmjs.com/package/html2canvas-pro)

### Key Performance Rules (from learnings)

全 Renderer で適用すべきルール:
1. **React.memo** — 全 Renderer コンポーネントと CanvasElement に適用必須
2. **useShallow** — 配列/オブジェクト props は useShallow で安定参照化
3. **Array index キー禁止** — React リストは必ず stable ID (uuid) をキーに
4. **reduce() で集計** — `Math.min(...values)` のスプレッド展開は 1000+ 件でスタックオーバーフロー
5. **レンダー中の store mutation 禁止** — Zustand actions は useEffect 内で呼ぶ
6. **100+ 要素でテスト** — 開発中にパフォーマンスの劣化を早期発見

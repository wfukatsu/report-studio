---
title: "feat: トップナビゲーション3タブ統合"
type: feat
status: active
date: 2026-04-13
origin: docs/brainstorms/2026-04-13-tab-navigation-consolidation-brainstorm.md
deepened: 2026-04-13
---

# feat: トップナビゲーション3タブ統合

## Enhancement Summary

**Deepened on:** 2026-04-13
**Research agents used:** display:none/Activity API調査, ARIA tablist調査, Zustandパターン調査, アーキテクチャレビュー, TypeScriptレビュー, パフォーマンスレビュー, データ管理UX調査, テンプレート管理UX調査

### Key Improvements (調査で判明した変更点)

1. **`display:none` → React `<Activity>` API に変更** — React 19.2 の `<Activity>` を使うことで、Effects が自動的に pause/resume され、手動ガードが不要になる。`display:none` のみでは `ReportCanvas` と `CanvasElement` の document/window レベル keyboard listener が非アクティブタブでも発火し続ける。
2. **`inert` 属性を必須化** — `<Activity>` が使えない場合の `display:none` フォールバックとして、`inert` 属性をキャンバスラッパーに追加しないと keyboard event が他タブに漏れる。
3. **`display: contents` は使用禁止** — レイアウト破壊・ARIA 破損のリスク。代わりに `display: flex` を使用。
4. **`AppTab` 型の定義場所変更** — `uiSlice.ts` ではなく `src/store/types.ts` に定義（循環インポート防止）
5. **データ管理タブのサブナビ** — 縦リスト形式（左サイドバー）を採用。データブラウザはサイドバー埋め込みではなく外部リンク（別ページ or 全幅展開）。
6. **テンプレート管理タブ** — モーダル廃止。カードグリッド + 右詳細パネルのスライドイン方式。バリアント管理は詳細パネル内アコーディオン。
7. **`UISlice` Pick の不完全バグ修正** — 既存の `livePreviewData`/`invalidateLivePreviewData` が `UISlice` Pick から漏れている（既存バグ）。同時に修正する。

---

## Overview

現在分散しているUI（デザインエディタ・各種モーダル・`/data-browser`別ページ）を、トップナビゲーション型の3タブ構成に統合する。タブは「デザイン」「データ管理」「テンプレート管理」の3つ。デザインタブは React `<Activity>` API（React 19.2+）による非破壊マウントで状態を保持する。

(see brainstorm: docs/brainstorms/2026-04-13-tab-navigation-consolidation-brainstorm.md)

---

## Proposed Solution

```
┌──────────────────────────────────────────────────┐
│  [ デザイン ] [ データ管理 ] [ テンプレート管理 ]      │  ← TopNavigation (role="tablist")
├──────────────────────────────────────────────────┤
│                                                  │
│   <Activity> で デザインタブを常時マウント           │
│   他タブは条件付きレンダリング (React.lazy 推奨)     │
│                                                  │
└──────────────────────────────────────────────────┘
```

### デザインタブ（現状維持 + Activity ラップ）

現在の `App.tsx` のキャンバス・ツールバー・左右サイドバーのレイアウトをそのまま維持。`<Activity mode={activeTab === 'design' ? 'visible' : 'hidden'}>` でラップすることで：
- Zustand state（選択要素・ズーム等）が保持される
- DOM state（スクロール位置・dnd-kit 状態）が保持される
- `useEffect` の cleanup が自動実行され、keyboard listeners が非アクティブ時に停止する
- メモリ効率：Fiber ツリーはメモリに保持、DOM ノードはデタッチ

### データ管理タブ（新規）

左サイドナビ（縦リスト） + 右コンテンツ領域のレイアウト:

```
┌────────────────┬──────────────────────────────────┐
│ データソース    │                                  │
│ スキーマ       │  選択中セクションのコンテンツ        │
│ 計算フィールド  │  （フル幅・スクロール可能）          │
│ バリデーション  │                                  │
│ 回答フィールド  │                                  │
│ ↗ データブラウザ│  ← 別ページへのリンク or 全幅表示  │
└────────────────┴──────────────────────────────────┘
```

含めるコンポーネント:
- `DataSourcePanel` — データソース設定
- `SchemaPanel` — テーブル・カラム定義
- `CalculationTab` — 計算フィールド（`DataBindingModal` から切り出し）
- `ValidationTab` — バリデーション設定（`DataBindingModal` から切り出し）
- `ResponsesPanel` — 回答フィールド
- `DataBrowserPage` — データブラウザへのリンク（サイドバー内埋め込みは幅不足のため外部リンクが推奨）

### テンプレート管理タブ（新規）

モーダルを廃止し、カードグリッド + 右詳細パネルのページUI:

```
┌────────────────────────────────────────────────────────┐
│ [Search] [Category ▼] [tag1 ×] [Clear]          ☰≡   │
│ ──────────────────────────────────────────────────     │
│ Built-in (5)                                           │
│ [card][card][card][card]                               │
│ My Templates (3)                                       │
│ [card][card][card]       │ 右詳細パネル（スライドイン）  │
│                          │ [thumbnail]                  │
│                          │ name / category / tags       │
│                          │ Output Variants ▼            │
│                          │   Variant A [Edit][Del]      │
│                          │   [+ Add Variant]            │
│                          │ [Edit in Designer] [Del]     │
└────────────────────────────────────────────────────────┘
```

---

## Technical Considerations

### ✅ React `<Activity>` API（`display:none` から変更）

```tsx
import { Activity } from 'react';

type AppTab = 'design' | 'data' | 'templates';  // types.ts で定義

function AppShell() {
  const activeTab = useReportStore((s) => s.activeTab);

  return (
    <div className="flex flex-col h-screen">
      <TopNavigation />

      {/* Design tab: Activity でエフェクトを自動 pause/resume */}
      <Activity mode={activeTab === 'design' ? 'visible' : 'hidden'}>
        <div
          role="tabpanel"
          id="top-panel-design"
          aria-labelledby="top-tab-design"
          className="flex flex-1 overflow-hidden"
        >
          <DesignTab />
        </div>
      </Activity>

      {/* Data / Template tabs: 条件付きレンダリング（状態保持不要） */}
      {activeTab === 'data' && (
        <div role="tabpanel" id="top-panel-data" aria-labelledby="top-tab-data"
             className="flex flex-1 overflow-hidden">
          <DataManagementTab />
        </div>
      )}
      {activeTab === 'templates' && (
        <div role="tabpanel" id="top-panel-templates" aria-labelledby="top-tab-templates"
             className="flex flex-1 overflow-hidden">
          <TemplateManagementTab />
        </div>
      )}
    </div>
  );
}
```

**Activity vs display:none の比較:**

| 観点 | display:none のみ | Activity |
|-----|-----------------|---------|
| Zustand state 保持 | ✅ | ✅ |
| DOM scroll 保持 | ✅ | ✅ |
| keyboard listeners | **❌ 常時発火** | ✅ 自動停止 |
| ポーリング/タイマー | **❌ 継続稼働** | ✅ 自動停止 |
| メモリ | 多（DOM 維持） | 少（DOM デタッチ） |
| Reactバージョン要件 | なし | **React 19.2+** |

**React バージョン確認:**
```bash
npm ls react
# 19.2.x 以上が必要。19.0.x の場合は upgrade が必要:
# npm install react@latest react-dom@latest
```

### ⚠️ `inert` 属性（display:none フォールバック時の必須対策）

Activity が使えない場合（React 19.0.x のまま運用する場合）の代替案。`display:none` だけでは `ReportCanvas.tsx` と `CanvasElement.tsx` の document/window keyboard listener が他タブでも発火する。`inert` 属性でキャンバスラッパー全体のイベントを無効化する:

```tsx
// display:none + inert の組み合わせ（Activity の代替）
<div
  style={{ display: activeTab === 'design' ? 'flex' : 'none' }}
  inert={activeTab !== 'design' ? '' : undefined}
>
  <DesignTab />
</div>
```

`inert` ブラウザサポート: Chrome 102+, Firefox 112+, Safari 15.5+（2026年現在全モダンブラウザ対応）

### `AppTab` 型の定義場所（`types.ts` に統一）

```typescript
// src/store/types.ts — StoreState interface の UIスライス部分に追加
export type AppTab = 'design' | 'data' | 'templates';

// StoreState 内:
activeTab: AppTab;
setActiveTab: (tab: AppTab) => void;
```

```typescript
// src/store/uiSlice.ts — UISlice Pick を拡張
export type UISlice = Pick<StoreState,
  // ...既存フィールド...
  | 'activeTab'        // 追加
  | 'setActiveTab'     // 追加
  | 'livePreviewData'          // ← 既存バグ修正（Pick から漏れていた）
  | 'invalidateLivePreviewData' // ← 既存バグ修正
>

// createUISlice factory 内:
activeTab: 'design' as AppTab,
setActiveTab: (tab) => set((s) => { s.activeTab = tab }),
```

**注意**: `index.ts` の変更は不要 — 既存の `...ui` スプレッドで自動的にピックアップされる。

### ARIA Tab Pattern（マニュアルアクティベーション）

```typescript
// src/components/layout/useTopTabNavigation.ts
export function useTopTabNavigation(
  tabs: AppTab[],
  selectedTab: AppTab,
  onSelect: (tab: AppTab) => void,
) {
  const tabRefs = useRef<Map<AppTab, HTMLButtonElement | null>>(new Map());

  const handleKeyDown = useCallback(
    (currentTabId: AppTab) => (e: KeyboardEvent<HTMLButtonElement>) => {
      // 日本語IME変換中はショートカットを無効化
      if (e.nativeEvent.isComposing) return;

      const idx = tabs.indexOf(currentTabId);
      let target: number | null = null;

      switch (e.key) {
        case 'ArrowLeft': target = idx === 0 ? tabs.length - 1 : idx - 1; break;
        case 'ArrowRight': target = idx === tabs.length - 1 ? 0 : idx + 1; break;
        case 'Home': target = 0; break;
        case 'End': target = tabs.length - 1; break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          onSelect(currentTabId); // マニュアルアクティベーション
          return;
        default: return;
      }

      e.preventDefault();
      // フォーカス移動のみ（アクティベートしない = マニュアル方式）
      tabRefs.current.get(tabs[target!])?.focus();
    },
    [tabs, onSelect],
  );

  const getTabProps = (tabId: AppTab) => ({
    role: 'tab' as const,
    id: `top-tab-${tabId}`,
    'aria-selected': tabId === selectedTab,
    'aria-controls': `top-panel-${tabId}`,
    tabIndex: tabId === selectedTab ? 0 : -1,  // roving tabindex
    onKeyDown: handleKeyDown(tabId),
    onClick: () => onSelect(tabId),
    ref: (el: HTMLButtonElement | null) => tabRefs.current.set(tabId, el),
  });

  return { getTabProps };
}
```

**マニュアルアクティベーションを採用する理由**: タブ切り替えはコンテンツの変更を伴うため、矢印キーでのフォーカス移動だけでは即時切り替えしない（Enter/Space で確定）。W3C ARIA spec が「コンテンツを即時に表示できない場合はマニュアル方式を推奨」と明示。

**日本語IME との衝突**: `e.nativeEvent.isComposing` ガードを全 keydown ハンドラのトップに追加する。React の合成イベントでは `isComposing` が正しく取れない場合があるため `e.nativeEvent.isComposing` を使うこと。

### デザインタブ keyboard shortcut の isolation

`Activity` を使う場合は自動的に解決されるが、`display:none` + `inert` 方式の場合は既存の keyboard handler にガードが必要:

```typescript
// App.tsx (→ DesignTab.tsx に移動後)
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    // Activity 方式の場合このガードは不要。
    // display:none + inert 方式の場合は必要:
    const currentTab = useReportStore.getState().activeTab;
    if (currentTab !== 'design') return;
    // ...以下既存ロジック
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [/* ... */]);
```

### TopNavigation — プレゼンテーショナルコンポーネント

```typescript
// src/components/layout/TopNavigation.tsx
interface TopNavigationProps {
  readonly activeTab: AppTab;
  readonly onTabChange: (tab: AppTab) => void;
}

export function TopNavigation({ activeTab, onTabChange }: TopNavigationProps) {
  // useReportStore は呼ばない — 純粋なプレゼンテーショナル
  const { getTabProps } = useTopTabNavigation(TABS, activeTab, onTabChange);
  // ...
}
```

`AppShell` でストアを購読し、props として渡す:
```typescript
function AppShell() {
  const activeTab = useReportStore((s) => s.activeTab);
  const setActiveTab = useReportStore((s) => s.setActiveTab);
  return <TopNavigation activeTab={activeTab} onTabChange={setActiveTab} />;
}
```

### `display: contents` 使用禁止

計画中の `display: contents` は以下の理由で使用禁止:
- flex/grid のレイアウト制約（`flex-1`, `overflow-hidden`）が破壊される
- ARIA role がブラウザによって伝播しない場合がある
- キャンバスエリアは flex コンテナを必要とする

代わりに `display: flex`（または `display: block`）を使用:
```tsx
// ❌ 禁止
<div style={{ display: activeTab === 'design' ? 'contents' : 'none' }}>

// ✅ 正しい
<div style={{ display: activeTab === 'design' ? 'flex' : 'none' }} className="flex-1 overflow-hidden">
```

### `DataBindingModal` の扱い

`CalculationTab`, `ValidationTab` は `DataBindingModal` の内部コンポーネントだが、`useReportStore` を直接参照しており props を持たない。切り出しは容易。`DataBindingModal` 自体はそのまま残すが、Data Management タブ内でも同じコンポーネントを直接配置する。

`BindingMapperTab` は `onClose?: () => void` prop があるが optional のため、タブ内インライン表示時は `onClose` を渡さなければ「閉じる」ボタンが非表示になる（既存実装がこの挙動を持つ）。

### `DataBrowserPage` の統合

`DataBrowserPage` は `dataBrowserStore`（独立Zustandストア）を使用。統合方法は2案:

**案A（推奨）**: 外部リンク方式 — Data Management タブの左ナビから `/data-browser` ルートへのリンクを表示（`↗` アイコン付き）。既存ルートを維持し、データグリッドの幅制約を回避。

**案B**: ルート廃止 + 全幅インライン表示 — `main.tsx` から `/data-browser` ルートを削除し、Data Management タブ内の全幅エリアにデータブラウザを表示。左ナビの「データブラウザ」を選択すると左ナビが非表示になりデータブラウザが全幅展開する。

### html2canvas エクスポートのガード

`display:none`（または `Activity` 非表示）状態のキャンバス DOM ノードを `html2canvas` に渡すと空白の PDF が生成される。`Toolbar.tsx` のエクスポートロジックにガードを追加:

```typescript
// Toolbar.tsx — エクスポートボタンのハンドラ
const handleExport = useCallback(async () => {
  const { activeTab } = useReportStore.getState();
  if (activeTab !== 'design') {
    toast.error('エクスポートはデザインタブで実行してください');
    return;
  }
  // 既存エクスポートロジック...
}, []);
```

### テンプレート保存後の cross-tab フロー

```
デザインタブ → [テンプレートとして保存] → インラインフォーム（名前/カテゴリ/タグ）
  → 保存成功 → トースト通知: "テンプレートを保存しました — テンプレート管理で確認 →"
    → トーストクリック → テンプレート管理タブに切り替え、新テンプレートをハイライト
```

実装:
```typescript
// uiSlice.ts に追加
pendingTemplateHighlight: string | null;  // テンプレートIDまたはnull
setPendingTemplateHighlight: (id: string | null) => void;

// TemplateManagementTab.tsx — マウント時にハイライト処理
useEffect(() => {
  const id = useReportStore.getState().pendingTemplateHighlight;
  if (id) {
    scrollToCard(id);
    highlightCard(id);
    setTimeout(() => setPendingTemplateHighlight(null), 5000);
  }
}, []);
```

---

## System-Wide Impact

### Interaction Graph

```
setActiveTab → uiSlice → AppShell re-render → Activity mode 切り替え
↓
Design tab: Effects pause (keyboard handlers, polling) → tab hidden
Data/Template tabs: conditional render → mount on first visit
```

`/data-browser` ルート廃止（案Bの場合） → `main.tsx` の Routes 変更 → `DataBrowserPage` コンポーネントは `DataManagementTab` 内に移動

`TemplateSelectionModal` / `TemplateManagerModal` / `VariantsModal` → タブ内ページUIに昇格 → モーダル open/close の `useState` を `Toolbar.tsx` / `App.tsx` から削除

### Error Propagation

各タブを独立した `ErrorBoundary` でラップ:
```tsx
<Activity mode={activeTab === 'design' ? 'visible' : 'hidden'}>
  <ErrorBoundary fallback={<DesignTabError />}>
    <DesignTab />
  </ErrorBoundary>
</Activity>
```

### State Lifecycle Risks

- **`Activity` 使用時**: hidden → visible 復帰時に全 `useEffect` の setup が再実行される。`useEffect` の依存配列が正確でないと意図しない副作用が発生する可能性がある。
- **auto-save (`App.tsx` L106–117)**: `DesignTab` の外（`AppShell` レベル）に保持すること。DesignTab コンポーネントへの移動後も auto-save は常時稼働が必要。
- **`DataBrowserPage` の `checkAuth` 呼び出し**: `App.tsx` が既に `checkAuth` を実行しているため、Data Management タブ内に埋め込む際は `DataBrowserPage` の `checkAuth` 呼び出しを除去（重複防止）。

### API Surface Parity

- `Toolbar.tsx` のテンプレート管理ボタン群 → タブナビゲーションボタンに変更
- `onSelect` コールバックパターン（`TemplateSelectionModal.onSelect`）はテンプレート適用ロジックとして維持
- テンプレートを「使用する」ボタンのクリック時：デザインタブに切り替えて `loadReport()` を実行

---

## データ管理タブ — 詳細設計

### 左サイドナビ仕様

```typescript
type DataSection =
  | 'datasource'   // データソース設定
  | 'schema'       // スキーマ定義
  | 'calculation'  // 計算フィールド
  | 'validation'   // バリデーション
  | 'responses'    // 回答フィールド
  | 'databrowser'; // データブラウザ（外部リンク）

// App.tsx に alongside leftTab/rightTab で管理（Zustand 不要）
const [dataSection, setDataSection] = useState<DataSection>('datasource');
```

### ナビゲーション状態の管理方針

| 方式 | 採用理由 |
|-----|---------|
| `useState`（推奨） | `leftTab` と同じパターン。エフェメラルな UI 状態を Zustand に入れない既存方針に従う |
| Zustand `uiSlice` | 他コンポーネントから参照が必要な場合のみ採用 |
| URL hash | この規模では不要。URL 同期は将来のルーター追加時に検討 |

### 空状態の設計

データソース未設定時:
```
┌─────────────────────────────────┐
│     [Database icon]             │
│  データソースが未設定です         │
│  ScalarDB のテーブルに接続する   │
│  か、サンプルJSONを設定して      │
│  テンプレートをプレビューできます  │
│  [ + データソースを設定する ]     │
└─────────────────────────────────┘
```

**重要**: データソース未設定でも左ナビの他セクションは非表示にしない。スキーマは独立して定義可能。「データソース必須」のセクションには小さなバッジ（!）を表示するのみ。

---

## テンプレート管理タブ — 詳細設計

### テンプレートカードの状態

| 状態 | 視覚表現 |
|-----|---------|
| Default | shadow-sm, thumbnail + name + category badge + tags |
| Hover | shadow-md, action buttons 表示（Use, ... メニュー） |
| Selected | ring-2 ring-primary, 右詳細パネルが開く |
| ハイライト | ring-2 ring-green-500 + "New" badge, 5秒アニメーション |
| Loading | skeleton shimmer |
| サムネイルなし | カテゴリアイコン + カテゴリ名の SVG placeholder |

### バリアント管理（モーダル廃止 → 詳細パネル内アコーディオン）

```
Output Variants ▼（accordion header）
├─ [+ バリアントを追加] input
├─ Row: "顧客向け" — 3要素非表示, 1フィールドマスク
│    └─ 展開時:
│         ├─ 非表示要素: [chip list]
│         └─ テキストマスクルール: [フィールドキー → 置換パターン]
└─ Row: "社内向け" — 5フィールドマスク
```

全バリアント操作は `addVariant`/`updateVariant`/`removeVariant` store actions に即時コミット（保存ボタン不要）。

---

## Acceptance Criteria

### Functional
- [ ] アプリ上部に「デザイン」「データ管理」「テンプレート管理」の3タブが表示される
- [ ] 各タブをクリックすると対応するコンテンツが表示される
- [ ] デザインタブから別タブに切り替えて戻ると、選択要素・ズームレベル・スクロール位置が保持されている
- [ ] 別タブ表示中にデザインタブの keyboard shortcuts（Ctrl+Z等）が誤発火しない
- [ ] データ管理タブに左サイドナビで各セクションを切り替えられる
- [ ] データ管理タブのデータソース未設定時に適切な空状態が表示される
- [ ] テンプレート管理タブでテンプレートのカードグリッドが表示される
- [ ] テンプレート管理タブでテンプレートカードクリックで右詳細パネルが開く
- [ ] テンプレート管理タブでバリアント管理が詳細パネル内で完結する
- [ ] デザインタブから「テンプレートとして保存」後、保存成功トーストからテンプレート管理タブへ遷移でき、新テンプレートがハイライトされる
- [ ] デザインタブ非アクティブ時にエクスポートボタンを押すとエラーメッセージが表示される

### Non-Functional
- [ ] `role="tablist"`, `role="tab"`, `role="tabpanel"` の ARIA 実装
- [ ] 矢印キー（Left/Right）でタブ間フォーカス移動、Enter/Space で選択（マニュアルアクティベーション）
- [ ] 日本語IME 変換中に tablist の矢印キーが誤動作しない（`isComposing` ガード）
- [ ] タブ切り替え視覚フィードバックが 100ms 以下

### Quality Gates
- [ ] TypeScript エラーなし (`npm run build` が通る)
- [ ] ESLint エラーなし
- [ ] 既存のテストが通る
- [ ] React バージョン 19.2+ に更新済み（Activity API 使用のため）

---

## Implementation Phases

### Phase 1: 基盤準備（React バージョン確認 + uiSlice 拡張）

**目標**: Activity API が使えることを確認し、store の型を拡張する

タスク:
1. `npm ls react` で React バージョン確認。19.0.x の場合 `npm install react@latest react-dom@latest`
2. `src/store/types.ts` に `AppTab` 型と `activeTab`/`setActiveTab` を `StoreState` に追加
3. `src/store/uiSlice.ts` の `UISlice` Pick に `activeTab`, `setActiveTab` を追加、併せて `livePreviewData`/`invalidateLivePreviewData` の漏れを修正
4. `createUISlice` factory に実装を追加（`activeTab: 'design' as AppTab`, `setActiveTab`）

**完了条件**: `npm run build` が通る、型エラーなし

---

### Phase 2: トップナビゲーションシェル（骨格）

**目標**: タブナビゲーションの骨格を作り、デザインタブを現状のまま移植する

タスク:
1. `src/hooks/useTopTabNavigation.ts` を新規作成
   - roving tabindex
   - ArrowLeft/Right/Home/End でフォーカス移動（アクティベートしない）
   - Enter/Space でアクティベート
   - `e.nativeEvent.isComposing` ガード
2. `src/components/layout/TopNavigation.tsx` を新規作成
   - `role="tablist"` + `aria-label="メインナビゲーション"`
   - 3つの `role="tab"` ボタン
   - プレゼンテーショナルコンポーネント（Zustand 参照なし）
3. `src/components/layout/AppShell.tsx` を新規作成
   - `useReportStore` から `activeTab`/`setActiveTab` を購読
   - `<Activity>` でデザインタブをラップ
   - データ・テンプレートタブは条件付きレンダリング
4. `src/main.tsx` のエントリーポイントを `App.tsx` → `AppShell.tsx` に変更
5. 既存の `App.tsx` コンテンツを `src/components/tabs/DesignTab.tsx` に移動
   - auto-save effect は `AppShell.tsx` に残す（常時稼働）
   - `canvasRef` は `DesignTab.tsx` 内で管理

**完了条件**: 3タブが表示され、デザインタブで従来通りの編集が動作する

---

### Phase 3: データ管理タブ

**目標**: データ管理関連UIを1つのタブに統合する

タスク:
1. `src/components/tabs/DataManagementTab.tsx` を新規作成
   - 左サイドナビ（縦リスト）+ 右コンテンツ領域のレイアウト
   - `useState<DataSection>` でセクション管理（Zustand 不要）
2. 左ナビのセクション実装:
   - データソース → `DataSourcePanel`
   - スキーマ → `SchemaPanel`
   - 計算フィールド → `CalculationTab`（DataBindingModal から直接インポート）
   - バリデーション → `ValidationTab`（同上）
   - 回答フィールド → `ResponsesPanel`
   - データブラウザ → `/data-browser` への外部リンクボタン（`window.open` or `<a target="_blank">`）
3. 空状態コンポーネントを実装（データソース未設定時の CTA）
4. `Toolbar.tsx` の `showDataModal` ローカル state を削除し、データ管理タブへの遷移ボタンに変更（`setActiveTab('data')`）

**完了条件**: データ管理タブで全セクションが正常に動作する

---

### Phase 4: テンプレート管理タブ

**目標**: テンプレート管理モーダルをフルページUIに昇格させる

タスク:
1. `src/components/tabs/TemplateManagementTab.tsx` を新規作成
   - Built-in テンプレートカードグリッド
   - My Templates カードグリッド（CRUD）
   - 右詳細パネル（スライドイン）
   - フィルターバー（Search + Category + Tags）
2. `src/components/templates/TemplateCard.tsx` を新規作成
   - Hover アクション、Selected 状態、ハイライトアニメーション
   - サムネイル（A4 比率 200x283px）
3. `src/components/templates/TemplateDetailPanel.tsx` を新規作成
   - メタデータ編集（名前/カテゴリ/タグ）
   - Output Variants アコーディオン
   - バリアント行（インライン展開エディタ）
   - [Edit in Designer] ボタン → `setActiveTab('design')` + `loadReport(template)`
4. `SaveTemplateDialog` からのポストセーブフロー実装:
   - `pendingTemplateHighlight` を `uiSlice` に追加
   - 保存成功時に `setPendingTemplateHighlight(templateId)` を呼び出す
   - 成功トースト: "テンプレートを保存しました — テンプレート管理で確認 →"（クリックで tab 切り替え）
   - `TemplateManagementTab` マウント時にハイライト処理
5. `Toolbar.tsx` のモーダルトリガーボタン群（`showVariantsModal`, `showManagerModal`）を削除し、テンプレート管理タブへの遷移ボタンに集約
6. `App.tsx` の `showTemplateModal` ローカル state を削除

**完了条件**: テンプレート管理タブでテンプレートの CRUD・バリアント管理が動作する

---

### Phase 5: エクスポートガード + クリーンアップ

タスク:
1. `Toolbar.tsx` のエクスポートボタンに `activeTab !== 'design'` チェックを追加
2. `main.tsx` の `/data-browser` ルートの扱い決定（保持 or リダイレクト）
3. 空になった旧モーダルコンポーネントの整理（削除またはモーダルとして残す）
4. `DataBrowserPage.tsx` の重複 `checkAuth` 呼び出しを除去（`AppShell` での auth 管理に統一）
5. `Toolbar.tsx` が 800 行以内に収まることを確認（目標: 削除後に 800 行以下）
6. TypeScript 型チェック通過（`npm run build`）
7. ESLint チェック通過
8. 既存テスト通過確認

---

## Open Questions（実装前に確認）

1. **データブラウザの配置**: 外部リンク（`/data-browser` ルート維持）か、タブ内全幅インライン表示か。案A（外部リンク）を推奨するが、要確認。
2. **テンプレート保存UIの方式**: `SaveTemplateDialog` のインラインフォーム化 vs ダイアログ維持。ダイアログ維持 + ポストセーブトーストが最も移行コストが低い。
3. **React バージョン**: 19.2+ に upgrade 可能か。不可能な場合は `display:none` + `inert` のフォールバック方式を採用。

---

## Dependencies & Risks

| リスク | 影響 | 対策 |
|--------|------|------|
| React 19.0.x のまま（Activity 未対応） | キーボードショートカット漏れ | `display:none` + `inert` 方式にフォールバック |
| Activity hidden → visible 復帰時の Effect 再実行 | 意図しない副作用 | useEffect 依存配列の監査 |
| `CalculationTab`/`ValidationTab` の切り出し | DataBindingModal の他タブへの影響 | DataBindingModal は残しつつ内部タブをスタンドアロン化 |
| html2canvas の非アクティブキャンバス | 空白 PDF 生成 | エクスポートボタンに activeTab ガードを追加 |
| `Toolbar.tsx` の肥大化継続 | 800行制限超過 | モーダル state 削除でフェーズ5完了後に 800 行以下を目標 |
| `TemplateSelectionModal` → `TemplateManagerModal` のネスト構造 | モーダル昇格時に孤児化した trigger が残る | 昇格前に全 open/close チェーンを監査 |

---

## Sources & References

### Origin
- **Brainstorm document:** [docs/brainstorms/2026-04-13-tab-navigation-consolidation-brainstorm.md](../brainstorms/2026-04-13-tab-navigation-consolidation-brainstorm.md)
  - Key decisions: (1) トップナビゲーション型3タブ, (2) デザインタブ状態保持, (3) モーダルをページUIに昇格

### Research Findings

#### React Activity API
- [React Activity API Reference](https://react.dev/reference/react/Activity) — `<Activity mode="hidden">` で Effects が pause/resume
- [React 19.2 is here: Activity API — LogRocket](https://blog.logrocket.com/react-19-2-is-here/) — 実装パターン
- React 19.2+ が必要。`npm ls react` でバージョン確認。

#### ARIA Tab Pattern
- [W3C WAI-ARIA APG Tabs Pattern — Manual Activation](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/examples/tabs-manual/)
- `tabIndex`: selected tab = 0, others = -1（roving tabindex）
- `aria-selected` は全タブに必須（false も明示）
- `e.nativeEvent.isComposing` ガードで日本語IME 対応

#### Zustand Slice 拡張パターン
- `AppTab` 型は `types.ts` で定義（`uiSlice.ts` ではない — 循環インポート防止）
- `setActiveTab: (tab) => set((s) => { s.activeTab = tab })` — immer mutation syntax
- `index.ts` の変更不要（`...ui` スプレッドが自動ピックアップ）

### Internal References
- `src/App.tsx` — デザインタブの元コンテンツ、ローカル state の洗い出し
- `src/main.tsx` — ルーティング変更対象
- `src/store/types.ts` — `AppTab`, `activeTab`, `setActiveTab` 追加先
- `src/store/uiSlice.ts` — `UISlice` Pick 拡張 + `livePreviewData` バグ修正
- `src/components/modals/DataBindingModal.tsx` — `CalculationTab`/`ValidationTab` の親
- `src/components/modals/TemplateSelectionModal.tsx` — テンプレート管理タブに昇格（L585: TemplateManagerModal をネスト — 移行前に監査必要）
- `src/components/modals/TemplateManagerModal.tsx` — テンプレート管理タブに昇格
- `src/components/modals/VariantsModal.tsx` — 詳細パネル内アコーディオンに昇格
- `src/components/modals/SaveTemplateDialog.tsx` — ダイアログ維持 + ポストセーブトースト追加
- `src/pages/DataBrowserPage.tsx` — データ管理タブに外部リンク or 統合
- `src/components/toolbar/Toolbar.tsx` — L133/144/145/146 のモーダル state 削除対象
- `src/components/canvas/ReportCanvas.tsx` — keyboard listeners (L161, L189, L208) が Activity で自動停止
- `src/components/canvas/CanvasElement.tsx` — window listeners (L71-83) が Activity で自動停止

### Institutional Knowledge
- `docs/solutions/feature-implementation/sidebar-ui-reorganization-databinding-modal-templates.md` — モーダル状態をuiSliceに保存するパターン
- `docs/solutions/ui-bugs/accessibility-aria-keyboard-navigation.md` — ARIA tablist 実装パターン

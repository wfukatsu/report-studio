# LayersPanel 改善ブレインストーム

**Date:** 2026-04-06  
**Status:** Draft

---

## What We're Building

LayersPanelの全面的な改善。現状は上下ボタンによる並び替えと基本的な表示/ロック切り替えのみだが、以下を追加する：

1. **ドラッグ＆ドロップ並び替え** — 上下ボタンを廃止し直感的な操作へ
2. **検索・フィルター** — 要素名・タイプで絞り込み
3. **セクション区切り表示** — header/body/footerのセクション境界を明示
   *(UIモックアップの要素タイプ別アイコン🔤📊🖼はスコープ外。現状の実装のまま)*
4. **グループレイヤー** — 複数要素をフォルダ型グループにまとめ、一括表示/ロック操作
5. **一括操作** — Cmd/Ctrl+クリックで複数選択 → まとめて表示切り替え・ロック（グループ外でも可）
6. **削除ボタン** — LayersPanelからも要素を削除可能

---

## Why This Approach (選定アプローチ)

### アプローチ A: インクリメンタル強化（推奨）

既存の要素モデルを変えず、UIと操作性を段階的に改善する。  
グループは**要素ID一覧を持つ別オブジェクト**としてストアに追加（`groups` フィールド）。要素のスキーマに影響なし。

**Pros:**
- 既存の `@dnd-kit/core`（既にプロジェクト内にある）を再利用できる
- 要素モデルへの破壊的変更なし → 既存データとの互換性が保たれる
- 段階的にリリース可能（検索→DnD→グループの順）

**Cons:**
- グループは"表示上の概念"にとどまる（グループのvisible=falseはレンダリング時にオーバーライド、要素の個別フラグは変更しない）
- グループのネスト（グループ内グループ）は複雑になるため今回は対象外

### アプローチ B: 要素モデル拡張（グループ型要素）

`ReportElement` に `type: 'group'` を追加し、`children: ReportElement[]` で階層化する。

**Pros:**
- 将来的にキャンバス上でのまとめ移動も可能になる

**Cons:**
- 型定義・ストア・レンダラーの大規模変更が必要
- 「表示管理のみ」という要件を超えたスコープになる
- ユーザー要件（表示管理のみ）に対してオーバーエンジニアリング

### アプローチ C: セクションをグループ代わりに使う

header/body/footer のセクションをグループ相当と位置づけ、グループ新規追加は不要とする。

**Cons:**
- セクションを増やしても現状UIでは管理できない
- ユーザーのニーズ（任意のグループ）に応えられない

**→ アプローチ A を採用。**

---

## Key Decisions

| 決定事項 | 選択 | 理由 |
|---------|------|------|
| DnD実装 | `@dnd-kit/sortable` | 既存の`@dnd-kit/core`と統合可能 |
| グループの保存場所 | `store.groups[]` (別フィールド) | 要素モデル無変更 |
| グループのネスト | 非対応（フラット1階層のみ） | YAGNI、実装コスト削減 |
| 検索対象 | 要素名 + タイプ名 | 最小限で効果的 |
| セクション区切り | LayersPanel内のヘッダー行 | 視覚的に分かりやすい |
| 削除操作 | ゴミ箱アイコンで要素削除 | 既存のstore.removeElementを呼ぶだけ |
| 複数選択 | Cmd/Ctrl+クリック | グループ外でも一括操作できる。グループは表示管理の概念として独立 |
| グループのスコープ | sectionId必須（同一セクション内のみ） | DnD制限と一貫性、実装をシンプルに保つ |

---

## Proposed Layer Panel UI Structure

```
┌─ LayersPanel ─────────────────────────────┐
│ 🔍 [検索ボックス]                           │
│                                           │
│ ▼ HEADER (2要素)                          │
│   ┌─ [≡] 🔤 company_logo    👁 🔒 🗑      │
│   └─ [≡] 📊 sales_chart     👁 🔒 🗑      │
│                                           │
│ ▼ BODY (5要素)                            │
│   ▼ [フォルダ] グループA    👁 🔒          │
│     ├─ [≡] 🔤 title         👁 🔒 🗑      │
│     └─ [≡] 📝 subtitle      👁 🔒 🗑      │
│   ─ [≡] 🖼 background        👁 🔒 🗑      │
│                                           │
│ ▼ FOOTER (1要素)                          │
│   └─ [≡] 🔤 page_number     👁 🔒 🗑      │
│                                           │
│ [+ グループ追加]                [要素数: 9] │
└────────────────────────────────────────────┘
```

---

## Store Changes

```typescript
// 追加するstore フィールド
interface ElementGroup {
  id: string
  name: string
  elementIds: string[]  // 含む要素のID（同一セクション内のみ）
  visible: boolean      // グループ全体の表示
  locked: boolean       // グループ全体のロック
  collapsed: boolean    // パネル上での折りたたみ
  pageId: string
  sectionId: string     // グループは同一セクション内に制限
}

// StoreStateに追加
groups: Record<string, ElementGroup>  // groupId → group

// 新規アクション
addGroup(pageId, name, elementIds?)
removeGroup(groupId)
updateGroup(groupId, patch)
assignToGroup(groupId, elementIds)
removeFromGroup(groupId, elementIds)
```

---

## Open Questions

（なし）

---

## Resolved Questions

1. **グループのvisible=falseにしたとき** → 要素の個別visibleフラグは変えない。グループのvisible設定がオーバーライドされる（レンダリング時にグループvisibleを優先）。グループを再表示すると要素の個別設定が復元される。
2. **DnDの範囲** → 同一セクション内のみ。セクション跨ぎ・グループ跨ぎのDnDは不可とする。
3. **リネームUI** → 現状のダブルクリックのままで十分。明示的なペンアイコン追加は不要。

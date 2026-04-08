---
date: 2026-04-08
topic: text-alignment-ux
---

# テキスト横揃え・縦揃え UI/UX 改善

## What We're Building

ラベル・データフィールド・テキスト要素のプロパティパネルに
「縦揃え」アイコントグル行（上揃え / 中央 / 下揃え）を追加する。
ラベルは常に「横揃え」「縦揃え」固定。レンダラー側で縦書き/横書きに応じた
軸マッピングが行われる（実装済み）。

## Why This Approach

**現状の問題:**
1. `verticalAlign` の UI コントロールが存在しない — スタイルプロパティはあるが設定不可
2. 縦書きモードでは横揃えアイコン（左/中央/右）が物理的に何を制御するか不明瞭

**レンダラー修正は完了済み:**
`LabelRenderer` / `DataFieldRenderer` は flexbox ベースで
横書き/縦書きの軸マッピングを正しく処理するようになった。
足りないのは **UI** のみ。

**ラベルが固定な理由:**
ユーザーは「この要素を横方向に右寄せしたい」「縦方向に中央揃えしたい」と
物理的な画面上の位置で考える。縦書き/横書きで制御する CSS 軸が変わっても
ユーザーの意図は「横=左右」「縦=上下」。
軸の変換はレンダラーが隠蔽する（実装済み）。

## Key Decisions

- **UI**: 「横揃え」行の下に「縦揃え」アイコントグル行を追加（上/中央/下の3アイコン）
- **ラベル**: 常に「横揃え」「縦揃え」（縦書き時も変えない）
- **対象パネル**: `LabelPropertiesPanel`, `TextPropertiesPanel`（label / text 要素）
- **アイコン**: Lucide の `AlignStartVertical`（上）、`AlignCenterVertical`（中央）、`AlignEndVertical`（下）を使用（Toolbar のインポートに既にある）
- **レンダラー変更**: 不要（flexbox マッピング実装済み）

## Resolved Questions

- 縦揃え UI 方式 → アイコントグル行 ✅
- ラベル表示 → 常に「横揃え」「縦揃え」固定 ✅
- レンダラー対応 → 実装済み（flexbox 軸マッピング） ✅

## Open Questions

なし。

## Scope

**変更ファイル:**
- `src/elements/label/PropertiesPanel.tsx` — 縦揃え行追加
- `src/elements/text/PropertiesPanel.tsx` — 縦揃え行追加

**新規ファイル: なし**
**レンダラー変更: なし**

## Next Steps

→ `/workflows:plan` で実装計画を作成する。

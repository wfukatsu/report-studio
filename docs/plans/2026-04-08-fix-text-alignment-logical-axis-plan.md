---
title: "fix: テキスト横揃え・縦揃えを CSS 論理軸モデルに統一"
type: fix
status: completed
date: 2026-04-08
---

# fix: テキスト横揃え・縦揃えを CSS 論理軸モデルに統一

## 仕様

### 横書き (horizontal-tb)

| 横揃え | 効果 | 縦揃え | 効果 |
|--------|------|--------|------|
| 左寄せ | 左に文字が寄せられる | 上寄せ | 上に文字が寄せられる |
| 中寄せ | 真ん中に文字が寄せられる | 中寄せ | 真ん中に文字が寄せられる |
| 右寄せ | 右に文字が寄せられる | 下寄せ | 下に文字が寄せられる |
| 均等寄せ | 左右均等に配置 | | |

### 縦書き (vertical-rl)

| 横揃え | 効果 | 縦揃え | 効果 |
|--------|------|--------|------|
| 左寄せ | **上**に文字が寄せられる | 上寄せ | **右**に文字が寄せられる |
| 中寄せ | 真ん中に文字が寄せられる | 中寄せ | 真ん中に文字が寄せられる |
| 右寄せ | **下**に文字が寄せられる | 下寄せ | **左**に文字が寄せられる |
| 均等寄せ | **上下**均等に配置 | | |

## 実装方針

`writing-mode` を**外側 flex コンテナ**に配置する。CSS の論理プロパティが自動的に軸変換を行うため、手動の軸スワップロジックが不要になる。

```
外側 div:
  display: flex
  flex-direction: column
  writing-mode: horizontal-tb | vertical-rl
  justify-content: 縦揃え（top→flex-start, middle→center, bottom→flex-end）

内側 div:
  text-align: 横揃え（left / center / right / justify）
  width: 100%（横書き時）/ height は CSS 自動）
```

CSS の `writing-mode` が flex コンテナに適用されると:
- **横書き**: column の主軸 = 上→下、text-align = 左→右 → そのまま
- **縦書き**: column の主軸 = 右→左（ブロック方向）、text-align = 上→下（インライン方向）
  - `justify-content: flex-start` = ブロック開始 = 右 → 縦揃え「上」= 右 ✓
  - `text-align: left` = インライン開始 = 上 → 横揃え「左」= 上 ✓

## 変更内容

### Label/Text/DataField レンダラー（3ファイル）

`toFlexAlign` / `vAlignToTextAlign` / 軸スワップロジックをすべて削除し、シンプルな構造に:

```tsx
<div style={{
  display: 'flex',
  flexDirection: 'column',
  writingMode: isVertical ? 'vertical-rl' : undefined,
  justifyContent: toFlexAlign(style.verticalAlign),  // 縦揃え → 常に justify-content
}}>
  <div style={{
    textAlign: style.textAlign ?? 'left',             // 横揃え → 常に text-align
    width: '100%',
  }}>
    {text}
  </div>
</div>
```

### テスト（ユーザー仕様の全14パターン）

横書き 7 パターン + 縦書き 7 パターン = 14 テストケース。

## Implementation Checklist

- [ ] LabelRenderer: writing-mode を外側に移動、軸スワップ削除
- [ ] TextRenderer: 同上
- [ ] DataFieldRenderer: 同上
- [ ] テスト: 横書き 7 パターン + 縦書き 7 パターン
- [ ] 全テスト通過

## Sources

- 仕様: ユーザー指定の横揃え×縦揃え×横書き/縦書きマトリクス
- CSS writing-mode + flex: `flex-direction: column` + `writing-mode: vertical-rl` で主軸がブロック方向（右→左）に変わる

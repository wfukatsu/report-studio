---
title: "fix: 扶養控除等申告書テンプレート PDF 忠実度 — 残件 DIFF-04/08~11 修正"
type: fix
status: active
date: 2026-04-08
origin: docs/brainstorms/2026-04-08-fuyou-kojo-remaining-diffs-brainstorm.md
---

# fix: 扶養控除等申告書テンプレート PDF 忠実度 — 残件 DIFF-04/08~11 修正

## Overview

国税庁公定様式との PDF 実物比較で特定された残件 5 件（DIFF-04/08/09/10/11）を
`src/templates/fuyouKojoTemplate.ts` のみで解消する。
新規ファイル・新規要素型・新規コンポーネントは一切不要。
変更はすべて定数調整と `lbl()` / `vlbl()` 要素の追加に限定される。

## Problem Statement / Motivation

DIFF-01〜03、05〜07 は前スプリントで実装済み。残件は以下：

| DIFF | 内容 | 影響 |
|------|------|------|
| DIFF-04 | 右端縦書き帳票説明文が未実装 | 様式一致度（視覚） |
| DIFF-08 | Section C「区分」列ラベル欠落 | 様式一致度（構造） |
| DIFF-09 | Section A「生計を一にする事実」欄の注記テキスト欠落 | 様式一致度（注記） |
| DIFF-10 | 列幅の微調整（name -2mm / address +2mm） | 様式一致度（寸法） |
| DIFF-11 | 注1 ボックスに（注2）テキスト欠落 + 高さ不足 | 様式一致度（注記） |

(see brainstorm: docs/brainstorms/2026-04-08-fuyou-kojo-remaining-diffs-brainstorm.md)

## Proposed Solution

**変更ファイル: `src/templates/fuyouKojoTemplate.ts` のみ**

各 DIFF を独立した変更として実装し、ビルド通過・目視確認後にコミット。

---

## Technical Details

### DIFF-04: 右端縦書き帳票説明文

**配置座標:**
- `x = ML + TABLE_W - 14 = 196`（右端 14mm 帯 — DIFF-03 のチェックエリアと同列）
- `y = Y.title + 34 = 37`（DIFF-03 のチェックエリア下端。`rect(ML+TABLE_W-14, Y.title+14, 14, 20)` の直下）
- `w = 14`, `h = Y.bottom - (Y.title + 34) = 237 - 37 = 200`
- `fontSize = 1.6`, `writingMode: 'vertical-rl'`, `locked: true`

**実装:**
```typescript
// src/templates/fuyouKojoTemplate.ts — タイトル行 push の末尾に追加
vlbl(
  'この申告書は、あなたの給与について扶養控除等を受けるために提出するものです。あなたは、給与の支払者を経由して提出先の各長に提出してください。なお、記載に当たっては、この申告書の裏面の記載についての注意を読んでください。',
  ML + TABLE_W - 14, Y.title + 34, 14, 200, 1.6,
)
```

> ⚠️ 実際のテキストは国税庁公開様式 PDF から転記すること。上記はプレースホルダー。

### DIFF-08: Section C「区分」列ラベル

**分析:** PDF では C 行マトリクス（一般/特別/同居特別 × 本人/同一生計配偶者/扶養親族）の
左側に「区分」という列見出しが存在する。現行コードには `COL.kubun` ラベル
（「障害者、寡婦、ひとり親又は勤労学生」）があるが「区分」の小ラベルが欠落。

**配置座標:**
- `x = COL.kubun.x = 8`（または `COL.name.x = ML+19 = 22` 直前の kubun 内）
- `y = CY = Y.rowC = 130`
- `w = COL.kubun.w = 14`, `h = 5`（上部ヘッダー行のみ）

**実装:**
```typescript
// Section C push 群の先頭に追加 (existing lbl('障害者、...) の前)
lbl('区分', COL.kubun.x, CY, COL.kubun.w, 5, { fontSize: 2.2, fontWeight: 'bold' }),
```

> 座標は実際の PDF と目視比較して調整すること。

### DIFF-09: Section A「生計を一にする事実」注記テキスト

**分析:** PDF では Section A の「生計を一にする事実」セル（`seikei` 列）内に
「（該当する場合は□を付けてください）」という小文字注記が印字されている。
`buildPersonRow` は汎用関数のため変更せず、Section A の `elements.push(...)` の
外側（`buildPersonRow` 呼び出し後）に追加ラベルとして配置する。

**配置座標:**
- `x = COL.seikei.x + 1 = 166`
- `y = Y.rowA + ROW_H.rowA - 6 = 50 + 16 - 6 = 60`（行下部に配置）
- `w = COL.seikei.w - 2 = 16`, `h = 5`
- `fontSize = 1.8`, `textAlign: 'left'`

**実装:**
```typescript
// Section A の elements.push(...buildPersonRow(Y.rowA, ROW_H.rowA)) の直後に追加
elements.push(
  lbl('（該当する場合は□を付けてください）',
    COL.seikei.x + 1, Y.rowA + ROW_H.rowA - 6,
    COL.seikei.w - 2, 5,
    { fontSize: 1.8, textAlign: 'left', verticalAlign: 'bottom' }),
)
```

### DIFF-10: 列幅微調整（name -2mm / address +2mm）

**重要**: ブレインストームでは `name.w: 24→22`、`address.w: 28→30`、`ido.w: 27→25`
の三列調整が挙げられていたが、合計が 207mm → 205mm に減少してしまう。
**実装では `name.w: 24→22`（-2mm）と `address.w: 28→30`（+2mm）のみ適用し、
合計 207mm を維持する。`ido.w` は変更しない。**

`name.w` が変わると、その右の列 (`kankei`, `myNumber`, ..., `address`) の `x` 座標がすべて
2mm 左にずれる。これらは COL オブジェクト定数として参照されているため、
**定数のみ変更すれば全呼び出し箇所が自動的に更新される。**

**変更内容 (src/templates/fuyouKojoTemplate.ts の COL 定数ブロック):**

| フィールド | 変更前 | 変更後 | 備考 |
|----------|------|------|------|
| `name.w` | 24 | 22 | −2mm |
| `kankei.x` | ML + 43 | ML + 41 | cascade |
| `myNumber.x` | ML + 51 | ML + 49 | cascade |
| `birthday.x` | ML + 73 | ML + 71 | cascade |
| `tokutei.x` | ML + 90 | ML + 88 | cascade |
| `income.x` | ML + 99 | ML + 97 | cascade |
| `nonRes.x` | ML + 113 | ML + 111 | cascade |
| `address.x` | ML + 134 | ML + 132 | cascade |
| `address.w` | 28 | 30 | +2mm |
| `seikei.x` | ML + 162 | ML + 162 | 変更不要（address 右端同じ） |
| `ido.x` | ML + 180 | ML + 180 | 変更不要 |

**検証**: `address.x(132) + address.w(30) = 162 = seikei.x(162)` ✓  
**合計確認**: 5+14+22+8+22+17+9+14+21+30+18+27 = 207mm ✓

### DIFF-11: 注1 高さ拡張 + （注2）テキスト追加

**ROW_H.note1: 14 → 20（+6mm）に伴う Y 座標カスケード:**

| Y 定数 | 変更前 | 変更後 |
|--------|------|------|
| `note1` | MT + 169 = 172 | 変更なし（起点） |
| `juminHdr` | MT + 183 = 186 | MT + 189 = 192 (+6) |
| `jumin1` | MT + 189 = 192 | MT + 195 = 198 (+6) |
| `jumin2` | MT + 203 = 206 | MT + 209 = 212 (+6) |
| `taishoku` | MT + 217 = 220 | MT + 223 = 226 (+6) |
| `bottom` | MT + 234 = 237 | MT + 240 = 243 (+6) |

**余白確認**: Y.bottom(243) + MT(3) = 246mm ＜ A4_H(297mm) — 残り 51mm。問題なし。
(see brainstorm: DIFF-11 リスク確認セクション)

**（注2）テキスト追加:**
```typescript
// 注1 の rect/lbl push の直後に追加
lbl(
  '（注2）同一生計配偶者とは、所得者と生計を一にする配偶者（青色事業専従者として給与の支払を受ける人及び白色事業専従者を除きます。）で、令和7年中の所得の見積額が48万円以下の人をいいます。',
  ML + 1, Y.note1 + ROW_H.note1 / 2 + 1, TABLE_W - 2, ROW_H.note1 / 2 - 2,
  { fontSize: 2.2, textAlign: 'left', verticalAlign: 'top' }),
```

---

## Acceptance Criteria

- [ ] DIFF-04: 右端 14mm 帯の下部（y=37〜237）に縦書き説明文が表示される。`locked: true`。
- [ ] DIFF-08: Section C マトリクス左上に「区分」ラベルが表示される。
- [ ] DIFF-09: Section A の「生計を一にする事実」セル内に注記テキストが小フォントで表示される。Section B/D には表示されない。
- [ ] DIFF-10: 氏名列が 2mm 狭く、住所欄が 2mm 広くなる。列の継ぎ目に隙間・重複がない。合計 207mm 維持。
- [ ] DIFF-11: 注1 ボックスが 20mm 高に拡張され、（注2）テキストが表示される。住民税・退職欄が 6mm 下にシフトし、Y.bottom = 243mm（A4 内に収まる）。
- [ ] TypeScript コンパイルエラーなし（`npm run build`）
- [ ] 既存テスト全通過（`npm test -- --run`）

## Implementation Checklist

### Step 1: DIFF-11 — Y 座標カスケード（先行して修正、他への影響最大）

- [ ] `ROW_H.note1`: 14 → 20
- [ ] `Y.juminHdr`: MT + 183 → MT + 189
- [ ] `Y.jumin1`: MT + 189 → MT + 195
- [ ] `Y.jumin2`: MT + 203 → MT + 209
- [ ] `Y.taishoku`: MT + 217 → MT + 223
- [ ] `Y.bottom`: MT + 234 → MT + 240
- [ ] 注1 ボックスの高さ参照が `ROW_H.note1` 経由であることを確認（`rect(ML, Y.note1, TABLE_W, ROW_H.note1)` — ✓）
- [ ] 注1 lbl の高さ参照が `ROW_H.note1` 経由であることを確認
- [ ] （注2）テキストを注1 ボックス下半分に追加

### Step 2: DIFF-10 — COL 定数調整

- [ ] `name.w`: 24 → 22
- [ ] `kankei.x`: ML + 43 → ML + 41
- [ ] `myNumber.x`: ML + 51 → ML + 49
- [ ] `birthday.x`: ML + 73 → ML + 71
- [ ] `tokutei.x`: ML + 90 → ML + 88
- [ ] `income.x`: ML + 99 → ML + 97
- [ ] `nonRes.x`: ML + 113 → ML + 111
- [ ] `address.x`: ML + 134 → ML + 132
- [ ] `address.w`: 28 → 30
- [ ] `ido.w` は変更しない（27 を維持）
- [ ] `colBoundaries` が COL 定数から自動計算されることを確認（手動変更不要）

### Step 3: DIFF-08 — Section C「区分」ラベル

- [ ] `lbl('区分', COL.kubun.x, CY, COL.kubun.w, 5, ...)` を Section C push 群に追加
- [ ] 目視確認: マトリクスのコラム見出しと整合する位置か

### Step 4: DIFF-09 — Section A 注記テキスト

- [ ] Section A の `buildPersonRow` 呼び出し後に注記 lbl を push
- [ ] `buildPersonRow` 関数本体は変更しない
- [ ] 目視確認: Section B（rowB1〜4）の seikei セルには表示されない

### Step 5: DIFF-04 — 右端縦書き説明文

- [ ] タイトル行の push 群の末尾に `vlbl(...)` を追加
- [ ] 国税庁公開様式 PDF から実際の説明文テキストを転記
- [ ] Y 座標が DIFF-03 チェックエリア（`Y.title + 14` 〜 `Y.title + 34`）と重複しないことを確認

### Step 6: 品質確認

- [ ] `npm test -- --run` で全テスト通過
- [ ] `npm run build` でビルドエラーなし
- [ ] dev サーバーで目視確認（扶養控除等申告書テンプレートを開く）

---

## System-Wide Impact

- **Interaction graph**: テンプレートは静的配列生成のみ（副作用なし）。`loadReport` → `store.loadReport()` → immer produce で page を更新。既存フローを変わらず通過する。
- **Error propagation**: 座標ミスはレイアウト崩れのみ（エラーはスローされない）。目視確認で検出する。
- **State lifecycle**: テンプレート定数の変更。ストア・永続化への影響なし。既存レポートデータには影響しない。
- **Integration tests**: テンプレートのレンダリング自体はユニットテストされていない。目視確認（dev サーバー）が主要な検証手段。

## Dependencies & Risks

| リスク | 対策 |
|--------|------|
| DIFF-10 COL cascade で見落とし箇所が生じる | COL 定数は全コードが参照するため自動適用。ただし `colBoundaries` の計算式を目視確認 |
| DIFF-11 +6mm で他要素と重複 | 計算済み: Y.bottom = 243mm、A4_H = 297mm、残り 51mm |
| DIFF-04 テキストが DIFF-03 エリアと重複 | y 始点を `Y.title + 34 = 37` に設定、DIFF-03 box は `Y.title + 14` 〜 `Y.title + 34` |
| DIFF-10 name.w と ido.w を両方変更すると合計 −2mm になる | ido.w の変更を明示的にスキップ（207mm 維持）|

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-04-08-fuyou-kojo-remaining-diffs-brainstorm.md](../brainstorms/2026-04-08-fuyou-kojo-remaining-diffs-brainstorm.md)
  — Key decisions: DIFF-04 は vlbl() 1本（DIFF-03 チェックエリア下部）、DIFF-09 は buildPersonRow 外で追加、DIFF-11 は +6mm カスケード、DIFF-10 は name/address のみ変更
- **課題レポート:** [docs/issues/fuyou-kojo-pdf-comparison-issues.md](../issues/fuyou-kojo-pdf-comparison-issues.md)
- **変更対象ファイル:** `src/templates/fuyouKojoTemplate.ts` (732行)
  - DIFF-11 Y 定数: line 204〜209
  - DIFF-10 COL 定数: line 161〜186
  - DIFF-08 Section C: line 502〜532
  - DIFF-09 Section A: line 447〜454
  - DIFF-04 タイトル行: line 234〜248

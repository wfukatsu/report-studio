---
status: pending
priority: p1
issue_id: "237"
tags: [code-review, performance, data-browser, backend]
dependencies: []
---

# ScalarDB スキャンが全行をJVMヒープにロードしてからページネーション

## Problem Statement

`V2ScalarDbScanController.scanRows()` は最大10,001行をJVMメモリに一括取得してからJavaでオフセット/リミットを適用している。ページ1を見るだけでも10,001行を取得する。10ユーザーが同時アクセスすると ~2GB のヒープ消費となりOOMリスクがある。

## Findings

```java
// V2ScalarDbScanController.java:100-118
Scan scan = Scan.newBuilder()
        .namespace(namespace).table(tableName)
        .all()
        .limit(MAX_SCAN_ROWS + 1)   // 常に10,001行取得
        .build();
tx = mgr.start();
List<Result> allRows = tx.scan(scan);  // 全行をJVMメモリへ
tx.commit();

// その後Java側でスライス
int fromIdx = Math.min(offset, total);
int toIdx = Math.min(fromIdx + limit, total);
List<Result> pageRows = cappedRows.subList(fromIdx, toIdx); // 50行だけ使用
```

- ページ50（offset=2450）のリクエストでも、2,500行全部をロードして2,450行を捨てる
- 複数ユーザーが大きいテーブルを閲覧するとヒープ枯渇のリスク
- フロントエンドのキャッシュ（`cacheScalarDbScan`）が使われていないため毎ページナビゲーションで全行取得

## Proposed Solutions

### Option A: `limit(offset + limit)` で取得行数を削減（推奨、短期）

```java
// MAX_SCAN_ROWS + 1 の代わりに offset + limit だけ取得
int fetchCount = Math.min(offset + limit + 1, MAX_SCAN_ROWS + 1);
Scan scan = Scan.newBuilder()
        .namespace(namespace).table(tableName)
        .all()
        .limit(fetchCount)
        .build();

tx = mgr.start();
List<Result> rows = tx.scan(scan);
tx.commit();

boolean truncated = (offset + limit >= MAX_SCAN_ROWS) && rows.size() >= fetchCount;
List<Result> pageRows = rows.subList(
    Math.min(offset, rows.size()),
    Math.min(offset + limit, rows.size())
);
// total の正確な値は取れないため -1 (unknown) を返すか、別途 COUNT 相当のスキャンを用意
```

- Pros: ヒープ使用量を O(offset + limit) に削減
- Cons: `total` の正確な値が取れない（truncated判定のみ可能）
- Effort: Small
- Risk: Low

### Option B: キャッシュを実際に読む（補完策）

`DataGrid.tsx` でキャッシュを読んでいないため、ページ変更ごとに全件APIを呼ぶ。

```tsx
// DataGrid.tsx の useEffect 内 (ScalarDB branch)
const cachedKey = `${source.namespace}.${source.table}:${offset}`
const cached = dataBrowserScalarDbCache[cachedKey]
if (cached) {
  setScalarDbData(cached)
  setLoadState('ok')
  return
}
// キャッシュミス時のみAPI呼び出し
```

- Pros: 戻るナビゲーション時にAPIリクエスト0
- Cons: キャッシュ無効化戦略が必要
- Effort: Small
- Risk: Low

## Acceptance Criteria

- [ ] Option A: ページネーションリクエストのヒープ使用が O(offset + limit) になる
- [ ] Option B: キャッシュ済みページに戻った場合APIリクエストを送らない
- [ ] バックエンドビルド通過

## Work Log

- 2026-04-12: code-review (PR #45) にて performance-oracle が発見

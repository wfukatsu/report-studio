---
status: complete
priority: p2
issue_id: "208"
tags: [code-review, security, rate-limiting, backend, data-binding-phase2]
dependencies: []
---

# `RateLimiter` 固定ウィンドウで境界での 2x バースト攻撃が可能

## Problem Statement

`auth/RateLimiter.java` は固定ウィンドウ実装 (`windowMs` 経過後にカウンタリセット)。
ウィンドウ境界で `5 + 5 = 10` リクエストを短時間に送れる。

`resolve-bindings` は ScalarDB への実データアクセスのため、
バースト攻撃でデータを大量取得される攻撃面が大きい。

## Findings

**File:** `server/src/main/java/com/report/server/auth/RateLimiter.java:61-66`

```java
// 固定ウィンドウ: windowStart から windowMs 経過後にリセット
if (now - window.windowStart >= windowMs) {
    windows.put(key, new Window(1, now));  // ← カウンタリセット
    return true;
}
```

**攻撃シナリオ**: ウィンドウ末尾に 5 リクエスト → 即座に次ウィンドウで 5 リクエスト = 10req in ~0ms

**既存パターン**: `v2ExportLimiter = new RateLimiter(3, 60_000L)` は重い操作に保守的なリミットを使用。

## Proposed Solutions

### Option A: 制限値を保守的に調整（最小コスト）

```java
// 5/10s → 3/10s に調整してバースト影響を軽減
new RateLimiter(3, 10_000L)
// 最悪ケース: 3+3=6req/短時間 (vs 5+5=10)
```

**Effort:** Trivial | **Risk:** Low

### Option B: 既存 RateLimiter にスライディングウィンドウ機能追加

実装が複雑になるため Phase 2 では Option A を採用し、Phase 3 で対応。

## Recommended Action

**Option A** を Phase 2 で適用。レートリミット値を `RateLimiter(3, 10_000L)` に設定。

## Acceptance Criteria

- [ ] `V2BindingResolveController` のレートリミットが `3/10s` per userId
- [ ] ウィンドウ境界攻撃でも最大 6req/短時間に制限される

## Work Log

- 2026-04-12: Discovered by Security reviewer (fixed-window 2x burst vulnerability)

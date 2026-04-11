---
status: pending
priority: p3
issue_id: "213"
tags: [code-review, agent-native, api, data-binding-phase2]
dependencies: []
---

# partition key 入力状態がコンポーネント `useState` のみ — エージェントからアクセス不可

## Problem Statement

`DataBindingOverviewPanel` の `previewParams`（partition key の値）がコンポーネントローカル `useState` に保存される。
エージェントが「customer C001 のデータでプレビューして」という要求を受けた場合、
partition key をプログラム的に設定する API が存在しない。

`resolve-bindings` エンドポイントは呼び出せるが、どのカラムが partition key かをエージェントが推論する必要がある。

## Findings

**Agent-native reviewer:**
> "Partition key state has no API surface — completely inaccessible to agents. P1 gap."

**但し**: Phase 2 の主要ユースケースはデザイナー操作。エージェント利用は Phase 3 以降の優先度。
このため P3 に格下げ。

## Proposed Solution (Phase 3 以降)

`GET /api/v2/templates/{id}/partition-key-requirements` を追加:
```json
[
  {
    "groupId": "grp_1",
    "namespace": "default",
    "tableName": "customers",
    "partitionKeys": [
      { "columnName": "customer_id", "type": "TEXT" }
    ]
  }
]
```

カタログから取得した `keyType == "PARTITION"` 情報をテンプレートのスキーマと組み合わせて返す。

**Effort:** Small | **Risk:** Low (Phase 3 タスク)

## Acceptance Criteria (Phase 3)

- [ ] エージェントが partition key 要件を1回の API 呼び出しで取得できる
- [ ] `buildFlatDataFromResolved` が export された純粋関数としてエージェントから参照可能

## Work Log

- 2026-04-12: Discovered by Agent-native reviewer (P1 demoted to P3 for Phase 2 scope)

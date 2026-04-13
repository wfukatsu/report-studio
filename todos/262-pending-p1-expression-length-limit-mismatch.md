---
status: pending
priority: p1
issue_id: "262"
tags: [code-review, architecture, backend, bug]
dependencies: []
---

# ExpressionEngine と Controller の式長上限不一致 — 500 vs 1000

## Problem Statement

`ExpressionEngine.java` は式の最大長を 500 文字に制限しているが、`V2EvaluateController.java` は 1000 文字でバリデーションしている。501〜1000 文字の式はコントローラーを通過するが、エンジン内部で例外が発生し、クリーンな 400 エラーではなく 500 エラーになる。

## Findings

- `server/src/main/java/com/report/server/ExpressionEngine.java:37`: `MAX_EXPRESSION_LENGTH = 500`
- `server/src/main/java/com/report/server/V2EvaluateController.java:37`: `MAX_EXPRESSION_LENGTH = 1000`

ユーザーが 501〜1000 文字の計算式を入力すると、コントローラーは「OK」として処理するが、エンジン側で `IllegalArgumentException` が発生し、ユーザーは意図不明な 500 エラーを受け取る。

## Proposed Solutions

### Solution A: 定数を共通クラスに移動（推奨）

```java
// AppConstants.java
public class AppConstants {
  public static final int MAX_EXPRESSION_LENGTH = 500;
}

// ExpressionEngine.java と V2EvaluateController.java で参照
```

- Effort: Small
- Risk: Low

## Acceptance Criteria

- [ ] 上限値が1箇所に定義されている
- [ ] 500文字超の式に対して 400 レスポンスが返る
- [ ] ユニットテストで上限バリデーションを検証

## Work Log

- 2026-04-13: architecture-strategist による code-review で発見（RED）

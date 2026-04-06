---
status: complete
priority: p1
issue_id: "105"
tags: [code-review, security, data-integrity]
dependencies: []
---

## Problem Statement

`validationRunner.ts` silently discards all JEXL evaluation errors. This means an `error`-severity validation rule that has a syntax error in its condition expression silently "passes" (no violation is emitted), bypassing the export gate that is supposed to block export on error violations. A user can unknowingly export a malformed report because their validation rule failed silently.

## Findings

**File:** `src/lib/validationRunner.ts:34–38`

```typescript
} catch {
  // Evaluation error — skip rule (don't block export for misconfigured rules)
}
```

**Impact:**

1. **Silent export gate bypass**: If an `error`-severity rule has a JEXL syntax error, `violations` remains empty, `hasErrors` is `false`, and export proceeds. The rule is supposed to block export but does not.

2. **No user feedback**: A user who writes `total < ` (malformed expression) sees no error when clicking export. The rule silently passes with zero violations.

3. **Conflates two different failure modes**: Parse errors (user misconfiguration) and runtime errors (data shape mismatch) are handled identically — both silently skipped. The comment says "don't block export for misconfigured rules" but this applies the same silent treatment to `severity: 'error'` rules as to `'warning'` rules.

**Security reviewer note (F-03):** "An attacker who can craft a report definition with a deliberately broken expression can bypass all error-severity validation gates."

## Proposed Solutions

**A) Emit synthetic violation for caught errors (Recommended, Small effort)**

```typescript
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  if (rule.severity === 'error') {
    // Error rule evaluation failed → push a violation so export is blocked
    violations.push({
      ruleKey: rule.id,
      message: `バリデーションルールの評価に失敗しました: ${msg}`,
    })
  }
  // Warning rules: skip silently (don't block export for warning misconfiguration)
}
```

Also add `evaluationErrors: Array<{ ruleId: string; error: string }>` to `ValidationResult` for diagnostic purposes.

**B) Surface all evaluation errors (More conservative)**
Push a violation for ALL caught errors regardless of severity, with a distinct message prefix. Let the UI differentiate "evaluation error" from "rule violation" visually.

**C) Keep silent for warnings, throw for errors (Strict)**
Re-throw evaluation errors from `error`-severity rules. This is too aggressive — it would abort the entire `Promise.all` and provide no violation list.

## Recommended Action

Option A — silent skip is fine for `warning` severity (don't block export), but `error` severity evaluation failures should produce a blocking violation.

## Technical Details

- **File**: `src/lib/validationRunner.ts`
- **Callers**: `src/components/toolbar/Toolbar.tsx:runPreflight` uses `result.hasErrors` to block export
- `ValidationViolation` type is at `src/store/types.ts:60–63`

## Acceptance Criteria

- [ ] An `error`-severity rule with a broken JEXL expression emits a violation and blocks export
- [ ] A `warning`-severity rule with a broken expression is silently skipped (export continues)
- [ ] The user sees a meaningful error message for evaluation failures, not just the rule message
- [ ] `ValidationResult` type includes an optional `evaluationErrors` field for diagnostics

## Work Log

- 2026-04-06: Identified by Security reviewer (F-03 MEDIUM), Architecture reviewer (MEDIUM), and Simplicity reviewer

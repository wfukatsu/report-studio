---
review_agents:
  - kieran-typescript-reviewer
  - security-sentinel
  - performance-oracle
  - architecture-strategist
  - code-simplicity-reviewer
---

# Review Context

This is a Report Design Studio frontend application built with:
- Vite + React + TypeScript
- Zustand (state management with immer)
- @dnd-kit (drag-and-drop canvas)
- Tailwind CSS + shadcn/ui
- Storybook (Atomic Design component library)

## Domain Context

帳票テンプレート作成UI (Report Template Design Studio) for Japanese legal forms.
The domain model is ReportDefinition → Page → Section → Element with Binding/Constraint/OutputVariant.

## Key Architectural Decisions

- Phase 1: Type/store migration in progress (currently has old flat model + new atomic components)
- Zustand slice pattern planned (layoutSlice, rulesSlice, variantSlice, submissionSlice)
- Coordinate system: mm units internally, px for display (mmToPx = mm / 25.4 * dpi)
- Immutable updates via immer + JSON.parse/JSON.stringify for cloning
- localStorage for persistence in Phase 1

## Review Focus Areas

1. TypeScript type safety and correctness
2. State management patterns and immutability
3. Component architecture (Atomic Design adherence)
4. Performance (canvas with 100+ elements)
5. Security (XSS in rendered elements, localStorage data)
6. Test coverage gaps

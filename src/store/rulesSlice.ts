/**
 * Rules slice — calculationRules and templateVariables CRUD.
 * These live on definition but are managed separately from page layout.
 */

import type { StateCreator } from 'zustand'
import type { CalculationRule, ValidationRule } from '@/types'
import type { StoreState } from './types'

export type RulesSlice = Pick<StoreState,
  | 'addCalculationRule'
  | 'updateCalculationRule'
  | 'removeCalculationRule'
  | 'addValidationRule'
  | 'updateValidationRule'
  | 'removeValidationRule'
>

export const createRulesSlice: StateCreator<
  StoreState,
  [['zustand/immer', never]],
  [],
  RulesSlice
> = (set) => ({
  addCalculationRule: (rule: CalculationRule) => set((s) => {
    s.definition.calculationRules.push(rule)
  }),

  updateCalculationRule: (key: string, patch: Partial<CalculationRule>) => set((s) => {
    const rule = s.definition.calculationRules.find((r) => r.key === key)
    if (rule) Object.assign(rule, patch)
  }),

  removeCalculationRule: (key: string) => set((s) => {
    s.definition.calculationRules = s.definition.calculationRules.filter((r) => r.key !== key)
  }),

  addValidationRule: (rule: ValidationRule) => set((s) => {
    s.definition.validationRules.push(rule)
  }),

  updateValidationRule: (id: string, patch: Partial<ValidationRule>) => set((s) => {
    const rule = s.definition.validationRules.find((r) => r.id === id)
    if (rule) Object.assign(rule, patch)
  }),

  removeValidationRule: (id: string) => set((s) => {
    s.definition.validationRules = s.definition.validationRules.filter((r) => r.id !== id)
  }),
})

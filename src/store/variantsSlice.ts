/**
 * Variants slice — OutputVariant CRUD + element visibility toggling.
 * Variants live on definition.outputVariants (not in undo/redo history).
 */

import type { StateCreator } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { OutputVariant, MaskingRule } from '@/types'
import type { StoreState } from './types'

export type VariantsSlice = Pick<StoreState,
  | 'addVariant'
  | 'removeVariant'
  | 'updateVariant'
  | 'toggleElementHidden'
  | 'addMaskingRule'
  | 'removeMaskingRule'
  | 'replaceMaskingRule'
  | 'cleanupVariantRefsForElement'
>

export const createVariantsSlice: StateCreator<
  StoreState,
  [['zustand/immer', never]],
  [],
  VariantsSlice
> = (set) => ({
  addVariant: (name) => set((s) => {
    const variant: OutputVariant = {
      id: uuidv4(),
      name,
      hiddenElementIds: [],
      maskingRules: [],
    }
    // definition.outputVariants is now OutputVariant[] after the type update
    ;(s.definition.outputVariants as OutputVariant[]).push(variant)
  }),

  removeVariant: (variantId) => set((s) => {
    s.definition.outputVariants = (s.definition.outputVariants as OutputVariant[]).filter(
      (v) => v.id !== variantId,
    )
  }),

  updateVariant: (variantId, patch) => set((s) => {
    const variant = (s.definition.outputVariants as OutputVariant[]).find((v) => v.id === variantId)
    if (!variant) return
    Object.assign(variant, patch)
  }),

  toggleElementHidden: (variantId, elementId) => set((s) => {
    const variant = (s.definition.outputVariants as OutputVariant[]).find((v) => v.id === variantId)
    if (!variant) return
    const idx = variant.hiddenElementIds.indexOf(elementId)
    if (idx === -1) {
      variant.hiddenElementIds.push(elementId)
    } else {
      variant.hiddenElementIds.splice(idx, 1)
    }
  }),

  addMaskingRule: (variantId, rule) => set((s) => {
    const variant = (s.definition.outputVariants as OutputVariant[]).find((v) => v.id === variantId)
    if (!variant) return
    const newRule: MaskingRule = { ...rule, id: uuidv4() }
    variant.maskingRules.push(newRule)
  }),

  removeMaskingRule: (variantId, ruleId) => set((s) => {
    const variant = (s.definition.outputVariants as OutputVariant[]).find((v) => v.id === variantId)
    if (!variant) return
    variant.maskingRules = variant.maskingRules.filter((r) => r.id !== ruleId)
  }),

  replaceMaskingRule: (variantId, rule) => set((s) => {
    const variant = (s.definition.outputVariants as OutputVariant[]).find((v) => v.id === variantId)
    if (!variant) return
    const idx = variant.maskingRules.findIndex((r) => r.id === rule.id)
    if (idx !== -1) {
      variant.maskingRules[idx] = rule
    }
  }),

  cleanupVariantRefsForElement: (elementId) => set((s) => {
    for (const v of s.definition.outputVariants as OutputVariant[]) {
      v.hiddenElementIds = v.hiddenElementIds.filter((id) => id !== elementId)
      v.maskingRules = v.maskingRules.filter((r) => r.targetElementId !== elementId)
    }
  }),
})

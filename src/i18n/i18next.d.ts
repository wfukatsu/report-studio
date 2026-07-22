/**
 * Type-safe i18next keys (#329). Augments react-i18next so `t('nav.design')` is
 * autocompleted and typos are compile errors — a compile-time complement to the
 * runtime missing-key guard in config.ts. `ja` is the source of truth for the
 * key shape, so its resource files type the whole catalog.
 */
import 'i18next'
import type common from './locales/ja/common.json'
import type toolbar from './locales/ja/toolbar.json'
import type modals from './locales/ja/modals.json'
import type elements from './locales/ja/elements.json'
import type components from './locales/ja/components.json'
import type core from './locales/ja/core.json'
import type serverErrors from './locales/ja/serverErrors.json'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    resources: {
      common: typeof common
      toolbar: typeof toolbar
      modals: typeof modals
      elements: typeof elements
      components: typeof components
      core: typeof core
      serverErrors: typeof serverErrors
    }
  }
}

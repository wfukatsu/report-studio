import React from 'react'
import type { Preview } from '@storybook/react-vite'
import { I18nextProvider } from 'react-i18next'
import '../src/index.css'
// Initialize the i18next singleton so stories of components that call
// useTranslation render real copy instead of raw keys (#329 Phase 6). Without
// this, every migrated component (Toolbar, ElementPalette, element Renderers, …)
// would show keys like `toolbar.file.new`.
import i18n from '../src/i18n/config'
import { useReportStore } from '../src/store'

// Capture initial store state once at module load time (before any story mutates it).
// This snapshot is used to reset state before every story so stories don't bleed
// state into each other. Replace=true wipes the entire state (not a partial merge).
const INITIAL_STORE_STATE = useReportStore.getState()

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    layout: 'centered',
  },
  // Toolbar language switcher so reviewers can eyeball ja/en per story and catch
  // key leaks (a raw key renders visibly instead of translated text).
  globalTypes: {
    locale: {
      description: 'Display language',
      defaultValue: 'ja',
      toolbar: {
        title: 'Language',
        icon: 'globe',
        items: [
          { value: 'ja', title: '日本語' },
          { value: 'en', title: 'English' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const locale = (context.globals.locale as string) ?? 'ja'
      if (i18n.resolvedLanguage !== locale) void i18n.changeLanguage(locale)
      return (
        <I18nextProvider i18n={i18n}>
          <Story />
        </I18nextProvider>
      )
    },
  ],
  async beforeEach() {
    useReportStore.setState(INITIAL_STORE_STATE, true)
  },
}

export default preview

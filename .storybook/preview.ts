import type { Preview } from '@storybook/react-vite'
import '../src/index.css'
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
  async beforeEach() {
    useReportStore.setState(INITIAL_STORE_STATE, true)
  },
}

export default preview

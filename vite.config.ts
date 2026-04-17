import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import lezer from 'unplugin-lezer/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), lezer()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: [
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/language',
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          codemirror: [
            '@codemirror/state',
            '@codemirror/view',
            '@codemirror/language',
            '@codemirror/commands',
            '@codemirror/autocomplete',
            '@codemirror/lint',
            '@lezer/highlight',
            '@lezer/lr',
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api/v2': {
        target: `http://localhost:${process.env.VITE_API_PORT ?? 8080}`,
        changeOrigin: true,
      },
      '/api/v1': {
        target: `http://localhost:${process.env.VITE_API_PORT ?? 8080}`,
        changeOrigin: true,
      },
    },
  },
})

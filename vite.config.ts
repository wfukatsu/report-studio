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
    // vendor を機能単位で分割済み。初期ロードに乗る最大チャンクはデザイナー本体
    // （約 980KB）で、これは 24 要素すべてを含む中核コードのため分割しない。
    // export-vendor（jspdf/html2canvas, 約 674KB）はエクスポート時のみの非同期ロード。
    // 理解済みのこのベースラインに合わせて閾値を設定し、それを超える回帰は検知する。
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      output: {
        // 巨大な単一チャンクを避けるため、重い vendor ライブラリを機能単位で分割する。
        // jspdf / html2canvas / dompurify は exportUtils で動的 import しているため
        // ここで名指しせず、非同期チャンクのまま残す。
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\\/](@codemirror|@lezer)[\\/]/.test(id)) return 'codemirror'
          // PDF/PNG エクスポート系。exportUtils から動的 import されるため、
          // 専用チャンクに隔離して「非同期のまま」に保つ（初期ロードに含めない）。
          if (
            /[\\/](jspdf|html2canvas|dompurify|canvg|css-line-break|text-segmentation|fflate|rgbcolor|stackblur-canvas)[\\/]/.test(
              id,
            )
          )
            return 'export-vendor'
          // recharts とその d3 依存（victory-vendor 経由でバンドルされる）
          if (/[\\/](recharts|victory-vendor|d3-[^\\/]+)[\\/]/.test(id)) return 'charts'
          if (/[\\/](react|react-dom|react-router-dom|scheduler)[\\/]/.test(id))
            return 'react-vendor'
          if (/[\\/]@radix-ui[\\/]/.test(id)) return 'radix'
          if (/[\\/]@dnd-kit[\\/]/.test(id)) return 'dnd'
          if (/[\\/]lucide-react[\\/]/.test(id)) return 'icons'
          // 残りのサードパーティ（jexl / zod / immer / zustand 等）は
          // アプリ本体コードと分離して vendor チャンクにまとめる。
          return 'vendor'
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.VITE_API_PORT ?? 8080}`,
        changeOrigin: true,
        cookieDomainRewrite: 'localhost',
      },
    },
  },
})

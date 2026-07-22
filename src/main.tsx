import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'sonner'
import '@/index.css'
import '@/i18n/config' // Initialize i18next before any component calls useTranslation (#329)
import { AppShell } from '@/components/layout/AppShell'
import { AppErrorBoundary } from '@/components/AppErrorBoundary'

// データブラウザは独立ページなので遅延ロードし、初期バンドルから切り離す。
const DataBrowserPage = lazy(() =>
  import('@/pages/DataBrowserPage').then((m) => ({ default: m.DataBrowserPage })),
)

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')

createRoot(rootEl).render(
  <StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppShell />} />
          <Route
            path="/data-browser"
            element={
              <Suspense fallback={null}>
                <DataBrowserPage />
              </Suspense>
            }
          />
        </Routes>
      </BrowserRouter>
      <Toaster position="bottom-center" richColors duration={8000} />
    </AppErrorBoundary>
  </StrictMode>,
)

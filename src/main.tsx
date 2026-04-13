import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import '@/index.css'
import { AppShell } from '@/components/layout/AppShell'
import { DataBrowserPage } from '@/pages/DataBrowserPage'
import { AppErrorBoundary } from '@/components/AppErrorBoundary'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')

createRoot(rootEl).render(
  <StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppShell />} />
          <Route path="/data-browser" element={<DataBrowserPage />} />
        </Routes>
      </BrowserRouter>
    </AppErrorBoundary>
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './index.css'
import App from './App.tsx'
import { reportError } from './components/ErrorBoundary'
import { installTonConnectDiagnostics } from './utils/tonConnectDiagnostics'

installTonConnectDiagnostics()

window.onerror = (_msg, _src, _line, _col, error) => {
  if (error) reportError(error)
}
window.onunhandledrejection = (event: PromiseRejectionEvent) => {
  const err = event.reason instanceof Error ? event.reason : new Error(String(event.reason))
  reportError(err)
}

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

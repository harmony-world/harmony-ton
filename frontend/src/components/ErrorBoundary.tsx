import { Component, type ErrorInfo, type ReactNode } from 'react'
import { API_URL } from '../utils/env'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

function reportError(error: Error, componentStack?: string) {
  try {
    const body = {
      message: error.message,
      name: error.name,
      stack: error.stack?.slice(0, 2000),
      componentStack: componentStack?.slice(0, 2000),
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    }
    fetch(`${API_URL}/frontend-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {})
  } catch {
  }
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, info.componentStack ?? undefined)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100dvh',
            padding: 24,
            gap: 12,
            background: 'var(--tg-theme-bg-color, #fff)',
            color: 'var(--tg-theme-text-color, #1C1C1E)',
          }}
        >
          <span style={{ fontSize: 40 }}>⚠️</span>
          <p style={{ fontSize: 14, color: 'var(--tg-theme-hint-color, #8E8E93)', textAlign: 'center' }}>
            Something went wrong
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              padding: '10px 24px',
              borderRadius: 12,
              border: 'none',
              background: 'var(--tg-theme-button-color, var(--tg-brand-color, #007AFF))',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export { reportError }

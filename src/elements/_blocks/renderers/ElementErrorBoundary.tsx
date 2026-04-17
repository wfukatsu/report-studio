<<<<<<< HEAD
import { Component, type ErrorInfo, type ReactNode } from 'react'
=======
import { Component, type ReactNode } from 'react'
>>>>>>> feat/formtable-excel-editing

interface Props {
  elementId: string
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
<<<<<<< HEAD
  retryCount: number
}

/** Maximum retry attempts before disabling the retry button. */
const MAX_RETRIES = 3

/**
 * Error boundary that wraps individual element renderers.
 *
 * Prevents a single element's rendering failure from crashing the entire canvas.
 * Each element boundary is independent — an error in one element does not affect others.
 *
 * Retry behaviour: the retry button is disabled after MAX_RETRIES attempts to prevent
 * infinite loops on deterministic errors (e.g. null-dereference in a renderer). If the
 * error is transient (e.g. async data not yet resolved), the first retry usually succeeds.
 *
 * Errors are logged via componentDidCatch so they appear in the browser console even
 * when the boundary prevents them from propagating up the tree.
 */
export class ElementErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, retryCount: 0 }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log so the error appears in the browser console and any external error monitoring.
    // This is the only production-visible signal that an element failed to render.
    console.error(
      `[ElementErrorBoundary] Element "${this.props.elementId}" failed to render:`,
      error,
      info.componentStack,
    )
  }

  handleRetry = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      retryCount: prev.retryCount + 1,
    }))
=======
}

/**
 * Error boundary that wraps individual element renderers.
 * Prevents a single element's rendering failure from crashing the entire canvas.
 */
export class ElementErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
>>>>>>> feat/formtable-excel-editing
  }

  render() {
    if (this.state.hasError) {
<<<<<<< HEAD
      const canRetry = this.state.retryCount < MAX_RETRIES
=======
>>>>>>> feat/formtable-excel-editing
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#fef2f2',
            border: '1px solid #fca5a5',
            fontSize: '10px',
            color: '#991b1b',
            padding: '4px',
            flexDirection: 'column',
            gap: '4px',
            boxSizing: 'border-box',
          }}
          role="alert"
        >
          <span>描画エラー</span>
<<<<<<< HEAD
          {canRetry ? (
            <button
              onClick={this.handleRetry}
              style={{
                fontSize: '9px',
                textDecoration: 'underline',
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                color: '#991b1b',
                padding: 0,
              }}
            >
              再試行
            </button>
          ) : (
            <span style={{ fontSize: '9px', color: '#b91c1c' }}>要素が修復不能です</span>
          )}
=======
          <button
            onClick={this.handleRetry}
            style={{
              fontSize: '9px',
              textDecoration: 'underline',
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              color: '#991b1b',
              padding: 0,
            }}
          >
            再試行
          </button>
>>>>>>> feat/formtable-excel-editing
        </div>
      )
    }
    return this.props.children
  }
}

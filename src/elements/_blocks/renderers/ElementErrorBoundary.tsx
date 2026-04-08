import { Component, type ReactNode } from 'react'

interface Props {
  elementId: string
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
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
  }

  render() {
    if (this.state.hasError) {
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
        </div>
      )
    }
    return this.props.children
  }
}

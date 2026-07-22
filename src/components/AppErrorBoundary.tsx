import { Component, type ReactNode } from 'react'
import i18n from '@/i18n/config'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen gap-4 text-center p-8">
          <h1 className="text-xl font-semibold text-destructive">
            {/* Class component can't use the hook; resolve via the i18n singleton (#329). */}
            {i18n.t('common:appError.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm"
          >
            {i18n.t('common:appError.retry')}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

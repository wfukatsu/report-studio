import { Component, type ReactNode } from 'react'

interface Props {
  elementId: string
  elementType: string
  onDelete: (id: string) => void
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ElementErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.elementId !== this.props.elementId) {
      this.setState({ hasError: false, error: null })
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      `[ElementErrorBoundary] Element ${this.props.elementId} (${this.props.elementType}) threw:`,
      error,
      info,
    )
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="w-full h-full flex flex-col items-center justify-center gap-1 bg-destructive/10 border border-destructive/30 rounded text-destructive text-[10px]"
          title={this.state.error?.message}
        >
          <span>⚠ 表示エラー</span>
          <div className="flex gap-1">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-1.5 py-0.5 rounded bg-background border text-[9px] hover:bg-accent"
            >再試行</button>
            <button
              onClick={() => this.props.onDelete(this.props.elementId)}
              className="px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground text-[9px] hover:bg-destructive/90"
            >削除</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

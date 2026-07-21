import { Component, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

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

/**
 * Error boundary that wraps individual element renderers.
 *
 * Prevents a single element's rendering failure from crashing the entire canvas.
 * Each element boundary is independent — an error in one element does not affect
 * others. The fallback offers retry (clears the error state) and delete (removes
 * the broken element via the store).
 *
 * Errors are logged via componentDidCatch so they appear in the browser console
 * even when the boundary prevents them from propagating up the tree.
 */
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
        <ElementErrorFallback
          message={this.state.error?.message}
          onRetry={() => this.setState({ hasError: false, error: null })}
          onDelete={() => this.props.onDelete(this.props.elementId)}
        />
      )
    }
    return this.props.children
  }
}

/**
 * Fallback UI rendered when an element throws. Kept as a function component so
 * it can use the `useTranslation` hook (the boundary itself is a class).
 */
function ElementErrorFallback({
  message,
  onRetry,
  onDelete,
}: {
  message?: string
  onRetry: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation('elements')
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center gap-1 bg-destructive/10 border border-destructive/30 rounded text-destructive text-[10px]"
      title={message}
    >
      <span>{t('blocks.errorBoundary.displayError')}</span>
      <div className="flex gap-1">
        <button
          onClick={onRetry}
          className="px-1.5 py-0.5 rounded bg-background border text-[9px] hover:bg-accent"
        >{t('blocks.errorBoundary.retry')}</button>
        <button
          onClick={onDelete}
          className="px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground text-[9px] hover:bg-destructive/90"
        >{t('blocks.errorBoundary.delete')}</button>
      </div>
    </div>
  )
}

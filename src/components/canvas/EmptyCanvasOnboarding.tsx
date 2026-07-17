import { LayoutTemplate, MousePointerSquareDashed, X } from 'lucide-react'

interface Props {
  /** Open the template gallery (primary action) */
  onOpenTemplates: () => void
  /** Dismiss the onboarding and start from a blank page (secondary action) */
  onDismiss: () => void
}

/**
 * Onboarding shown on an empty document (no elements on any page).
 *
 * Rendered as an overlay above the canvas. The wrapper is pointer-events:none so
 * palette drag-and-drop onto the blank paper still works; only the card itself is
 * interactive. Hides automatically once the first element is added (the parent
 * gates on document emptiness).
 */
export function EmptyCanvasOnboarding({ onOpenTemplates, onDismiss }: Props) {
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center p-6"
      style={{ pointerEvents: 'none' }}
      role="region"
      aria-label="はじめかた"
    >
      <div
        className="relative max-w-sm w-full rounded-xl border bg-card shadow-lg px-7 py-8 text-center"
        style={{ pointerEvents: 'auto' }}
      >
        <button
          onClick={onDismiss}
          className="absolute top-2.5 right-2.5 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="閉じる"
          aria-label="はじめかたを閉じる"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <LayoutTemplate className="h-6 w-6" />
        </div>

        <h2 className="text-base font-semibold text-foreground">
          帳票づくりを始めましょう
        </h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          テンプレートを選ぶと、項目や表がすぐに使える状態から編集できます。白紙から作ることもできます。
        </p>

        <button
          onClick={onOpenTemplates}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          <LayoutTemplate className="h-4 w-4" />
          テンプレートから始める
        </button>

        <button
          onClick={onDismiss}
          className="mt-2.5 inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          <MousePointerSquareDashed className="h-4 w-4" />
          白紙のまま作る
        </button>

        <p className="mt-4 text-xs text-muted-foreground">
          左のパレットから要素をドラッグして配置することもできます
        </p>
      </div>
    </div>
  )
}

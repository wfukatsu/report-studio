interface AlertBannerProps {
  readonly variant: 'error' | 'success'
  readonly message: string
}

export function AlertBanner({ variant, message }: AlertBannerProps) {
  if (variant === 'error') {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        {message}
      </div>
    )
  }
  return (
    <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-xs text-green-700">
      {message}
    </div>
  )
}

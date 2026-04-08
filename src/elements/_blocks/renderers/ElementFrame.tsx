import { memo, type CSSProperties, type ReactNode } from 'react'

export interface BorderConfig {
  color: string
  width: number
  style?: 'solid' | 'dashed' | 'dotted'
  radius?: number
}

export interface PaddingConfig {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

interface ElementFrameProps {
  border?: BorderConfig
  background?: string
  padding?: PaddingConfig
  className?: string
  children: ReactNode
}

export const ElementFrame = memo(function ElementFrame({
  border,
  background,
  padding,
  className,
  children,
}: ElementFrameProps) {
  const style: CSSProperties = {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    boxSizing: 'border-box',
    ...(background && { backgroundColor: background }),
    ...(border && {
      border: `${border.width}mm ${border.style ?? 'solid'} ${border.color}`,
      borderRadius: border.radius ? `${border.radius}mm` : undefined,
    }),
    ...(padding && {
      paddingTop: padding.top ? `${padding.top}mm` : undefined,
      paddingRight: padding.right ? `${padding.right}mm` : undefined,
      paddingBottom: padding.bottom ? `${padding.bottom}mm` : undefined,
      paddingLeft: padding.left ? `${padding.left}mm` : undefined,
    }),
  }

  return (
    <div style={style} className={className}>
      {children}
    </div>
  )
})

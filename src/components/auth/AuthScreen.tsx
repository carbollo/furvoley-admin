import type { CSSProperties, ReactNode } from 'react'

export function AuthScreen({
  children,
  background = '#f8fafc',
}: {
  children: ReactNode
  background?: string
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        boxSizing: 'border-box',
        background,
        overflow: 'auto',
      }}
    >
      {children}
    </div>
  )
}

export function AuthCard({
  children,
  maxWidth = 420,
  style,
}: {
  children: ReactNode
  maxWidth?: number
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        width: '100%',
        maxWidth,
        margin: 'auto',
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 16,
        padding: 32,
        boxSizing: 'border-box',
        boxShadow: '0 4px 24px rgba(15, 23, 42, 0.06)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

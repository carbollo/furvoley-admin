import type { ClubBranding } from './types'

export const theme = {
  navy: '#141b2b',
  primary: '#0058be',
  bg: '#ecedf7',
  surface: '#ffffff',
  text: '#191b23',
  textMuted: '#727785',
  textSecondary: '#424754',
  border: 'rgba(194,198,214,0.45)',
  danger: '#be123c',
  success: '#15803d',
  warning: '#b45309',
  radius: 14,
  shadow: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
} as const

export function clubPrimary(branding?: ClubBranding | null) {
  const c = String(branding?.primaryColor || '').trim()
  return c || theme.primary
}

export function fmtMoney(n: number) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(n)
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

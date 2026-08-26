/**
 * Helper de eventos personalizados para Umami (lado cliente). Alimenta las
 * secciones Eventos / Objetivos / Embudos del panel de Umami.
 *
 * Es un no-op seguro si el script aún no ha cargado o si la analítica no está
 * configurada: la analítica NUNCA debe romper la app.
 *
 * Uso:
 *   import { track } from '@/lib/analytics/umami'
 *   track('crear-cliente', { plan: 'Pro' })
 */
type UmamiApi = {
  track: (event?: string | Record<string, unknown>, data?: Record<string, unknown>) => void
  identify?: (data: Record<string, unknown>) => void
}

declare global {
  interface Window {
    umami?: UmamiApi
  }
}

/** Registra un evento personalizado con datos opcionales. */
export function track(event: string, data?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  try {
    window.umami?.track(event, data)
  } catch {
    /* nunca propagar errores de analítica */
  }
}

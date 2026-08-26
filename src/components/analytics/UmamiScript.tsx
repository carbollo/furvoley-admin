import { headers } from 'next/headers'
import { runWithTenant } from '@/lib/multitenant/request'
import { currentTenant } from '@/lib/multitenant/context'

/**
 * Inyecta el script de Umami (analítica privacy-first, sin cookies) en TODAS las
 * superficies (portal + CRM de cada club, que comparten este layout raíz).
 *
 * - Se activa SOLO si `UMAMI_WEBSITE_ID` está definido (si no, no renderiza nada,
 *   así el código puede desplegarse antes de configurar la analítica).
 * - `UMAMI_SCRIPT_URL` apunta al script: Umami Cloud (por defecto), self-hosted, o
 *   `recorder.js` (con grabación de sesión + heatmaps).
 * - Etiqueta cada pageview/evento con el **slug del club** (`data-tag`) para segmentar
 *   por tenant en Umami. En el portal (sin tenant) no añade etiqueta.
 *
 * `await headers()` fuerza render **dinámico**: así `process.env` se lee en RUNTIME
 * (donde Railway inyecta las variables), no en build. Sin esto, en las superficies
 * que Next optimiza como estáticas la variable quedaría vacía y el script no saldría.
 */
export default async function UmamiScript() {
  await headers()

  const websiteId = (process.env.UMAMI_WEBSITE_ID || '').trim()
  if (!websiteId) return null

  const src = (process.env.UMAMI_SCRIPT_URL || '').trim() || 'https://cloud.umami.is/script.js'

  let tag = ''
  try {
    tag = (await runWithTenant(async () => currentTenant()?.slug ?? '')) || ''
  } catch {
    tag = ''
  }

  return (
    <script
      defer
      src={src}
      data-website-id={websiteId}
      {...(tag ? { 'data-tag': tag } : {})}
    />
  )
}

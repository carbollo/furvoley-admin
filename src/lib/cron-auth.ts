import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'

/**
 * Autenticación de los endpoints de tareas programadas (`/api/jobs/*`).
 *
 * Seguridad (fail-closed): si NO hay secreto configurado, se DENIEGA. Antes el
 * patrón `if (secret && header !== ...)` dejaba el endpoint PÚBLICO cuando el
 * secreto no estaba definido, permitiendo a cualquiera disparar generación de
 * facturas y envío masivo de WhatsApp/email (coste y spam). La comparación es
 * de tiempo constante para no filtrar el secreto byte a byte.
 *
 * Acepta `CRON_SECRET` o `BILLING_CRON_SECRET`.
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export function requireCronAuth(request: Request): NextResponse | null {
  const secret = String(process.env.CRON_SECRET || process.env.BILLING_CRON_SECRET || '').trim()
  if (!secret) {
    return NextResponse.json(
      { error: 'Tareas programadas no configuradas: define CRON_SECRET.' },
      { status: 503 },
    )
  }

  const header = String(request.headers.get('authorization') || '').trim()
  if (!timingSafeStringEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  return null
}

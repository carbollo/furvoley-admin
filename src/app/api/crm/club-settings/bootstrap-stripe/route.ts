import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { ensureStripeWebhooks, getStripeBootstrapStatus } from '@/lib/stripe-bootstrap'

/**
 * GET: estado actual del bootstrap de Stripe (URL pública detectada, IDs y
 * presencia de secrets — no expone los secrets en sí).
 *
 * POST: fuerza una sincronización inmediata (re-crear o actualizar los
 * webhook endpoints en Stripe). Útil tras clonar el servicio o cambiar el
 * dominio público.
 */
export async function GET() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response
  const status = await getStripeBootstrapStatus()
  return NextResponse.json({ status })
}

export async function POST() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response
  const status = await ensureStripeWebhooks()
  if (!status.configured && status.error) {
    return NextResponse.json({ status, error: status.error }, { status: 400 })
  }
  return NextResponse.json({ status })
}

import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { parseCuid } from '@/lib/db-input-validation'
import { createWhopSubscriptionCheckout } from '@/lib/whop/checkout'

export const dynamic = 'force-dynamic'

/**
 * Enlace de alta de la cuota de un socio (cobro RECURRENTE): se le envía y, al
 * pagarlo, la pasarela renueva la cuota cada periodo automáticamente.
 */
export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) return auth.response

  let body: { subscriptionId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = parseCuid(String(body.subscriptionId || ''), 'subscriptionId')
  if (parsed instanceof Response) return parsed

  const result = await createWhopSubscriptionCheckout(parsed)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  return NextResponse.json({ url: result.url })
}

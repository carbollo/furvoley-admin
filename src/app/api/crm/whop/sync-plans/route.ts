import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { syncAllWhopPlans } from '@/lib/whop/plans'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Crea/actualiza en la pasarela un plan por cada cuota activa del club, para
 * poder cobrarlas de forma recurrente. Idempotente: si la cuota ya está espejada
 * con el mismo precio y periodicidad, no hace nada.
 */
export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  const result = await syncAllWhopPlans()
  return NextResponse.json({ ok: result.errors.length === 0, ...result })
}

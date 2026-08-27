import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { getCardSecrets } from '@/lib/whop/cards'

export const dynamic = 'force-dynamic'

/**
 * Número completo y CVC de una tarjeta.
 *
 * Es el dato más sensible que sirve este CRM, así que:
 *
 * - solo el ADMIN (el tesorero ve los gastos, no el número);
 * - se pide a la pasarela en el momento y no se guarda en ninguna parte;
 * - `no-store` en la respuesta, para que no acabe en la caché del navegador ni
 *   en la de ningún intermediario;
 * - nunca se registra en el log, ni siquiera al fallar.
 *
 * Es un GET porque no cambia nada, pero se comporta como algo de un solo uso.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  const { id } = await params
  const res = await getCardSecrets(id)
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  return NextResponse.json(
    {
      cardNumber: res.cardNumber,
      cvc: res.cvc,
      nameOnCard: res.nameOnCard,
      expiration: res.expiration,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        Pragma: 'no-cache',
      },
    },
  )
}

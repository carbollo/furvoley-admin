import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { updateCard } from '@/lib/whop/cards'

export const dynamic = 'force-dynamic'

/**
 * Congela, descongela, renombra, cambia el límite o cancela una tarjeta.
 *
 * Solo el ADMIN. El tesorero ve los gastos, pero abrir o cerrar el grifo del
 * dinero del club es otra cosa.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  const { id } = await params

  let body: {
    frozen?: unknown
    canceled?: unknown
    name?: unknown
    spendLimit?: unknown
    spendLimitFrequency?: unknown
    transactionLimit?: unknown
    removeLimit?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const FRECUENCIAS = ['daily', 'weekly', 'monthly', 'one_time']
  // Sin periodo no se asume ninguno: la pasarela lo exige junto al importe, y
  // suponer «al mes» convertiría en silencio un tope diario en uno mensual.
  const frecuencia =
    body.spendLimitFrequency === undefined ? null : String(body.spendLimitFrequency).toLowerCase()
  if (frecuencia != null && !FRECUENCIAS.includes(frecuencia)) {
    return NextResponse.json({ error: 'Periodo de límite no válido.' }, { status: 400 })
  }

  const limite = body.spendLimit == null || body.spendLimit === '' ? null : Number(body.spendLimit)
  if (limite != null && (!Number.isFinite(limite) || limite <= 0 || limite > 1_000_000)) {
    return NextResponse.json({ error: 'El límite debe estar entre 1 y 1.000.000.' }, { status: 400 })
  }
  const porCompra =
    body.transactionLimit == null || body.transactionLimit === '' ? null : Number(body.transactionLimit)
  if (porCompra != null && (!Number.isFinite(porCompra) || porCompra <= 0 || porCompra > 1_000_000)) {
    return NextResponse.json({ error: 'El límite por compra debe estar entre 1 y 1.000.000.' }, { status: 400 })
  }

  // Cancelar es irreversible, así que tiene que venir solo y explícito: nunca
  // como efecto colateral de guardar un nombre o un límite.
  const cancelar = body.canceled === true

  const res = await updateCard(id, {
    canceled: cancelar || undefined,
    frozen: cancelar || body.frozen === undefined ? undefined : Boolean(body.frozen),
    name: cancelar || body.name === undefined ? undefined : String(body.name),
    spendLimit: cancelar ? undefined : limite,
    spendLimitFrequency: (frecuencia || undefined) as 'daily' | 'weekly' | 'monthly' | 'one_time' | undefined,
    transactionLimit: cancelar ? undefined : porCompra,
    removeLimit: cancelar ? undefined : body.removeLimit === true,
  })

  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
  return NextResponse.json({ ok: true, card: res.card })
}

import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import {
  checkCardScopes,
  createCard,
  listCardHolders,
  listCardMovements,
  listCards,
} from '@/lib/whop/cards'

export const dynamic = 'force-dynamic'

/**
 * Todo lo que necesita la pestaña Banco para pintar las tarjetas.
 *
 * Va en una sola llamada porque las cuatro consultas se piden siempre juntas y
 * separarlas solo añadiría estados intermedios en pantalla. Ninguna incluye el
 * número de la tarjeta: eso solo sale por `/cards/[id]/secrets`, y a petición.
 */
export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) return auth.response

  const [cards, movements, scopes] = await Promise.all([
    listCards(),
    listCardMovements({ limit: 25 }),
    checkCardScopes(),
  ])

  // Los titulares solo hacen falta para emitir, que es cosa del ADMIN, y su
  // consulta necesita un permiso aparte: si falla, el resto de la pantalla
  // tiene que seguir funcionando.
  // Los titulares llevan nombres y correos del equipo del club en la pasarela, y
  // solo hacen falta para emitir, que es cosa del ADMIN: al tesorero no se le
  // manda esa lista aunque su clave pueda leerla.
  const esAdmin = auth.role === 'ADMIN'
  const puedeEmitir = esAdmin && scopes.every((s) => s.granted)
  const holders = puedeEmitir ? await listCardHolders() : null

  return NextResponse.json({
    connected: cards.ok || !/no está conectada/.test(cards.error),
    cards: cards.ok ? cards.cards : [],
    cardsError: cards.ok ? null : cards.error,
    movements: movements.ok ? movements.movements : [],
    movementsError: movements.ok ? null : movements.error,
    hayMasMovimientos: movements.ok ? movements.hayMas : false,
    holders: holders?.ok ? holders.holders : [],
    scopes,
  })
}

/** Emite una tarjeta nueva. Solo el ADMIN: gasta el dinero del club. */
export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  let body: {
    name?: unknown
    spendLimit?: unknown
    spendLimitFrequency?: unknown
    transactionLimit?: unknown
    assignedUserId?: unknown
    requestId?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const FRECUENCIAS = ['daily', 'weekly', 'monthly', 'one_time']
  const frecuencia = String(body.spendLimitFrequency || 'monthly').toLowerCase()
  if (!FRECUENCIAS.includes(frecuencia)) {
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

  const holder = String(body.assignedUserId || '').trim()
  if (holder && !/^user_[A-Za-z0-9]+$/.test(holder)) {
    return NextResponse.json({ error: 'Titular no válido.' }, { status: 400 })
  }

  // Identifica ESTE intento y es lo que impide emitir dos tarjetas por un doble
  // clic. Se exige con formato para que nadie pueda fijar una clave a mano y
  // provocar que la pasarela repita una respuesta ajena.
  const requestId = String(body.requestId || '').trim()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    return NextResponse.json({ error: 'Petición mal formada. Recarga la página.' }, { status: 400 })
  }

  const res = await createCard({
    name: String(body.name || ''),
    spendLimit: limite,
    spendLimitFrequency: frecuencia as 'daily' | 'weekly' | 'monthly' | 'one_time',
    transactionLimit: porCompra,
    assignedUserId: holder || null,
    requestId,
  })

  if (!res.ok) {
    return NextResponse.json({ error: res.error, indeterminate: res.indeterminate }, { status: 400 })
  }
  return NextResponse.json(res)
}

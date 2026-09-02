import { NextResponse } from 'next/server'
import { getWhopClubConfig } from '@/lib/whop/club-config'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { consumeRateLimit } from '@/lib/rate-limit'
import {
  checkCardScopes,
  createCard,
  listCardHolders,
  listCardMovements,
  listCards,
} from '@/lib/whop/cards'

export const dynamic = 'force-dynamic'
/**
 * Cuatro llamadas a la pasarela, cada una con su propio tiempo de espera. El
 * tope explicito evita que la peticion quede colgando si la pasarela va lenta.
 */
export const maxDuration = 60

/**
 * Rechaza la peticion cuando se pasa del limite. Devuelve la respuesta ya hecha
 * o `null` si puede seguir.
 */
async function frenar(
  clave: string,
  max: number,
  ventanaMs: number,
  mensaje: string,
): Promise<NextResponse | null> {
  const r = await consumeRateLimit({ clave, max, ventanaMs })
  if (r.permitido) return null
  return NextResponse.json(
    { error: mensaje },
    { status: 429, headers: { 'Retry-After': String(r.reintentarEnS) } },
  )
}

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

  const quien = auth.session?.user?.id || 'anon'
  // Cada carga son cuatro llamadas a la pasarela: recargar en bucle agotaria su
  // cuota y dejaria al club sin cobrar.
  const frenado = await frenar(
    `cards-list:${quien}`,
    60,
    5 * 60_000,
    'Demasiadas consultas seguidas. Espera un momento y vuelve a cargar la pantalla.',
  )
  if (frenado) return frenado

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

  // Quien ha visto los numeros de tarjeta. Es informacion de control interno del
  // club, asi que solo la ve quien puede tomar medidas.
  const ajustes = await prisma.clubSettings
    .findFirst({
      where: { isDefault: true },
      select: { cardDefaultLimit: true, cardDefaultLimitPeriod: true },
    })
    .catch(() => null)

  const vistas = esAdmin
    ? await prisma.cardViewLog
        .findMany({ orderBy: { createdAt: 'desc' }, take: 20 })
        .then((rows) =>
          rows.map((v) => ({
            id: v.id,
            cardId: v.cardId,
            cardLast4: v.cardLast4,
            userName: v.userName || v.userEmail || 'Alguien de administración',
            createdAt: v.createdAt.toISOString(),
          })),
        )
        .catch(() => [])
    : []

  return NextResponse.json({
    // Antes esto se deducía comparando el mensaje de error contra una frase en
    // castellano: cambiar el texto de la pantalla habría cambiado el estado.
    connected: (await getWhopClubConfig()).hasCompany,
    cards: cards.ok ? cards.cards : [],
    cardsError: cards.ok ? null : cards.error,
    movements: movements.ok ? movements.movements : [],
    movementsError: movements.ok ? null : movements.error,
    hayMasMovimientos: movements.ok ? movements.hayMas : false,
    holders: holders?.ok ? holders.holders : [],
    scopes,
    vistas,
    topePorDefecto: {
      importe: ajustes?.cardDefaultLimit ?? null,
      periodo: ajustes?.cardDefaultLimitPeriod || 'monthly',
    },
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

  // Emitir tarjetas en serie con una sesion robada es el peor escenario de esta
  // pantalla, y no hay ninguna razon legitima para emitir muchas de golpe.
  const frenadoEmitir = await frenar(
    `cards-create:${auth.session?.user?.id || 'anon'}`,
    5,
    60 * 60_000,
    'Has emitido varias tarjetas seguidas. Espera una hora antes de emitir otra, o revisa la lista por si ya está.',
  )
  if (frenadoEmitir) return frenadoEmitir

  // Si no se indica tope, manda el que el club tenga puesto por defecto. Se
  // resuelve AQUI y no en la pantalla: un cliente que no mandara el campo se
  // llevaria una tarjeta sin limite.
  const porDefecto = await prisma.clubSettings
    .findFirst({
      where: { isDefault: true },
      select: { cardDefaultLimit: true, cardDefaultLimitPeriod: true },
    })
    .catch(() => null)

  const limiteFinal = limite ?? porDefecto?.cardDefaultLimit ?? null
  const frecuenciaFinal =
    body.spendLimitFrequency === undefined && limite == null
      ? porDefecto?.cardDefaultLimitPeriod || 'monthly'
      : frecuencia

  const res = await createCard({
    name: String(body.name || ''),
    spendLimit: limiteFinal,
    spendLimitFrequency: frecuenciaFinal as 'daily' | 'weekly' | 'monthly' | 'one_time',
    transactionLimit: porCompra,
    assignedUserId: holder || null,
    requestId,
  })

  if (!res.ok) {
    return NextResponse.json({ error: res.error, indeterminate: res.indeterminate }, { status: 400 })
  }
  return NextResponse.json(res)
}

import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { consumeRateLimit } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { getWhopClubConfig } from '@/lib/whop/club-config'
import { getBalances, listPayoutMethods, listPayouts } from '@/lib/whop/payouts'
import { sweepClubBalance } from '@/lib/whop/sweep'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Dinero del club: saldo, cuenta bancaria y transferencias hechas. */
export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) return auth.response

  const config = await getWhopClubConfig()
  if (!config.hasCompany) {
    // Con el contrato mudo de antes la pantalla no pintaba nada y el club veía
    // una sección en blanco sin saber por qué.
    return NextResponse.json({
      ok: true,
      connected: false,
      balances: [],
      balancesError: 'Aún no has conectado la pasarela de cobro. Hazlo en Ajustes del club.',
      methods: [],
      methodsError: null,
      payouts: [],
      payoutsError: null,
      pending: [],
      sweep: {
        frequency: config.sweepFrequency,
        minAmount: config.sweepMinAmount,
        lastSweepAt: config.lastSweepAt,
        hasPayoutMethod: false,
        currency: config.payoutCurrency,
      },
    })
  }

  const [balances, methods, payouts, pending] = await Promise.all([
    getBalances(),
    listPayoutMethods(),
    listPayouts(),
    // Transferencias que el CRM pidió y aún no ha podido confirmar: se enseñan
    // para que el club no crea que su dinero se ha evaporado.
    prisma.whopPayout
      .findMany({
        where: { status: { in: ['SENDING', 'UNKNOWN'] } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, amount: true, currency: true, createdAt: true },
      })
      .catch(() => []),
  ])

  const ajustes = await prisma.clubSettings
    .findUnique({
      where: { isDefault: true },
      select: { treasurerCanTransfer: true, cardDefaultLimit: true, cardDefaultLimitPeriod: true },
    })
    .catch(() => null)

  return NextResponse.json({
    ok: true,
    connected: true,
    balances: balances.ok ? balances.balances : [],
    balancesError: balances.ok ? null : balances.error,
    methods: methods.ok ? methods.methods : [],
    methodsError: methods.ok ? null : methods.error,
    payouts: payouts.ok ? payouts.payouts : [],
    // Si la pasarela no deja leer el historial, el club tiene que enterarse. Sin
    // esto, «no hay transferencias» y «no puedo consultarlas» se veían igual: en
    // blanco.
    payoutsError: payouts.ok ? null : payouts.error,
    pending: pending.map((p) => ({
      amount: p.amount,
      currency: p.currency,
      createdAt: p.createdAt.toISOString(),
    })),
    sweep: {
      frequency: config.sweepFrequency,
      minAmount: config.sweepMinAmount,
      lastSweepAt: config.lastSweepAt,
      hasPayoutMethod: config.hasPayoutMethod,
      currency: config.payoutCurrency,
    },
    permisos: {
      treasurerCanTransfer: ajustes?.treasurerCanTransfer !== false,
      cardDefaultLimit: ajustes?.cardDefaultLimit ?? null,
      cardDefaultLimitPeriod: ajustes?.cardDefaultLimitPeriod || 'monthly',
    },
  })
}

/** Transferir el saldo ahora, sin esperar al barrido automático. */
export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) return auth.response

  // Mover el dinero al banco es algo que el ADMIN puede quitarle al tesorero. Se
  // comprueba AQUI y no solo ocultando el boton: ocultarlo deja la ruta abierta
  // a una llamada desde la consola del navegador.
  if (auth.role === 'TREASURER') {
    const permiso = await prisma.clubSettings
      .findUnique({ where: { isDefault: true }, select: { treasurerCanTransfer: true } })
      // Si no se puede comprobar el permiso, no se transfiere: es dinero, y
      // negar de mas cuesta una espera; permitir de mas, un descubierto.
      .catch(() => ({ treasurerCanTransfer: false }))
    if (permiso?.treasurerCanTransfer === false) {
      return NextResponse.json(
        { error: 'El administrador del club ha desactivado las transferencias para el tesorero.' },
        { status: 403 },
      )
    }
  }

  // Mover dinero a mano es algo puntual: un bucle aqui solo puede ser un error
  // o alguien con la sesion de otro.
  const limite = await consumeRateLimit({
    clave: `payout-now:${auth.session?.user?.id || 'anon'}`,
    max: 10,
    ventanaMs: 60 * 60_000,
  })
  if (!limite.permitido) {
    return NextResponse.json(
      { error: 'Has pedido varias transferencias seguidas. Espera un rato y comprueba el historial.' },
      { status: 429, headers: { 'Retry-After': String(limite.reintentarEnS) } },
    )
  }

  // Permite transferir a mano una divisa distinta a la de la cuenta bancaria
  // (el barrido automático nunca lo hace por su cuenta).
  let currency: string | undefined
  try {
    const body = (await request.json()) as { currency?: unknown }
    const c = String(body?.currency || '').trim().toUpperCase()
    if (/^[A-Z]{3,10}$/.test(c)) currency = c
  } catch {
    /* sin cuerpo: se transfiere la divisa de la cuenta bancaria */
  }

  const result = await sweepClubBalance(true, currency)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  if (result.skipped) return NextResponse.json({ ok: true, skipped: true, reason: result.reason })

  return NextResponse.json({
    ok: true,
    skipped: false,
    transfers: result.transfers,
    stranded: result.stranded,
  })
}

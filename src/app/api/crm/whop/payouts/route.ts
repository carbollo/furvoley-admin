import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
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
    return NextResponse.json({ ok: true, connected: false })
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

  return NextResponse.json({
    ok: true,
    connected: true,
    balances: balances.ok ? balances.balances : [],
    balancesError: balances.ok ? null : balances.error,
    methods: methods.ok ? methods.methods : [],
    methodsError: methods.ok ? null : methods.error,
    payouts: payouts.ok ? payouts.payouts : [],
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
  })
}

/** Transferir el saldo ahora, sin esperar al barrido automático. */
export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) return auth.response

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

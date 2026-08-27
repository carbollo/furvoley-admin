import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'

export const dynamic = 'force-dynamic'

const FREQUENCIES = ['OFF', 'DAILY', 'WEEKLY', 'MONTHLY']

/** Cada cuánto y a partir de qué importe se transfiere el saldo al banco. */
export async function PATCH(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  let body: {
    frequency?: unknown
    minAmount?: unknown
    treasurerCanTransfer?: unknown
    cardDefaultLimit?: unknown
    cardDefaultLimitPeriod?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const data: {
    whopSweepFrequency?: string
    whopSweepMinAmount?: number
    treasurerCanTransfer?: boolean
    cardDefaultLimit?: number | null
    cardDefaultLimitPeriod?: string
  } = {}

  if (body.frequency !== undefined) {
    const f = String(body.frequency).toUpperCase()
    if (!FREQUENCIES.includes(f)) {
      return NextResponse.json({ error: 'Frecuencia no válida.' }, { status: 400 })
    }
    data.whopSweepFrequency = f
  }

  if (body.treasurerCanTransfer !== undefined) {
    if (typeof body.treasurerCanTransfer !== 'boolean') {
      return NextResponse.json({ error: 'Valor no válido.' }, { status: 400 })
    }
    data.treasurerCanTransfer = body.treasurerCanTransfer
  }

  if (body.cardDefaultLimit !== undefined) {
    // `null` es una eleccion valida y significa «sin tope»: no se confunde con
    // «no me han dicho nada», que deja el valor como estaba.
    if (body.cardDefaultLimit === null) {
      data.cardDefaultLimit = null
    } else {
      const n = Number(body.cardDefaultLimit)
      if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) {
        return NextResponse.json(
          { error: 'El tope por defecto debe estar entre 1 y 1.000.000.' },
          { status: 400 },
        )
      }
      data.cardDefaultLimit = Number(n.toFixed(2))
    }
  }

  if (body.cardDefaultLimitPeriod !== undefined) {
    const p = String(body.cardDefaultLimitPeriod).toLowerCase()
    if (!['daily', 'weekly', 'monthly', 'one_time'].includes(p)) {
      return NextResponse.json({ error: 'Periodo no válido.' }, { status: 400 })
    }
    data.cardDefaultLimitPeriod = p
  }

  if (body.minAmount !== undefined) {
    const n = Number(body.minAmount)
    // El suelo de 1 evita transferencias de céntimos, en las que la comisión se
    // come el importe. Se rechaza en vez de corregirlo por dentro: si el club ve
    // un número en pantalla, tiene que ser el que se aplica.
    if (!Number.isFinite(n) || n < 1 || n > 100000) {
      return NextResponse.json(
        { error: 'El importe mínimo debe estar entre 1 y 100.000.' },
        { status: 400 },
      )
    }
    data.whopSweepMinAmount = Number(n.toFixed(2))
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nada que cambiar.' }, { status: 400 })
  }

  await prisma.clubSettings.update({ where: { isDefault: true }, data })
  return NextResponse.json({ ok: true })
}

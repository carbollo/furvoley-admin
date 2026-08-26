import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getWhopClubConfig } from '@/lib/whop/club-config'
import {
  getBalances,
  createPayout,
  listPayouts,
  syncDefaultPayoutMethod,
  PAYOUT_LIVE_STATUSES,
} from '@/lib/whop/payouts'

/**
 * Barrido: manda el saldo del club a su cuenta bancaria.
 *
 * El club no ve un "saldo" que tenga que retirar: para él es simplemente una
 * transferencia que le entra en el banco, como con cualquier pasarela.
 *
 * Todo aquí gira alrededor de una regla: **nunca transferir el mismo dinero dos
 * veces**. Por eso cada transferencia se anota en la BD *antes* de pedirla, con
 * su clave de reintento ya fijada; sólo un proceso a la vez puede barrer un
 * club (cerrojo); y un resultado que se queda en el aire (timeout) se marca como
 * indeterminado y se comprueba contra la pasarela antes de volver a intentarlo,
 * en lugar de reintentarse a ciegas.
 */

export type SweepTransfer = { amount: number; currency: string; payoutId: string }

export type SweepResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; transfers: SweepTransfer[]; stranded: string[] }
  | { ok: false; error: string }

const FREQUENCY_DAYS: Record<string, number> = { DAILY: 1, WEEKLY: 7, MONTHLY: 30 }

/** Un barrido no puede durar más que esto; pasado el plazo el cerrojo caduca. */
const LOCK_TTL_MS = 15 * 60 * 1000

/**
 * Margen antes de dar por no ejecutada una transferencia que no aparece en la
 * pasarela. Cubre el desfase entre que se acepta y que se lista.
 */
const UNRESOLVED_GRACE_MS = 10 * 60 * 1000

/** ¿Toca transferir, según la frecuencia configurada por el club? */
export function isDue(frequency: string, lastSweepAt: string | null): boolean {
  if (frequency === 'OFF') return false
  const days = FREQUENCY_DAYS[frequency] ?? 7
  if (!lastSweepAt) return true
  const elapsed = Date.now() - new Date(lastSweepAt).getTime()
  return elapsed >= days * 24 * 60 * 60 * 1000
}

/**
 * Cierra las transferencias que quedaron sin confirmar comprobando qué pasó de
 * verdad en la pasarela.
 *
 * @returns true si alguna sigue viva o sin aclarar — en ese caso no se puede
 *          barrer todavía sin arriesgarse a duplicarla.
 */
async function resolvePending(): Promise<boolean> {
  const open = await prisma.whopPayout.findMany({
    where: { status: { in: ['SENDING', 'UNKNOWN'] } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  if (open.length === 0) return false

  const remote = await listPayouts(50)
  // Si no se puede consultar, se es conservador: hay algo abierto y no se barre.
  if (!remote.ok) return true

  let blocking = false
  for (const row of open) {
    const match = remote.payouts.find((p) => p.reference === row.id)

    if (match) {
      const live = PAYOUT_LIVE_STATUSES.includes(match.status)
      await prisma.whopPayout.update({
        where: { id: row.id },
        data: {
          payoutId: match.id,
          status: live ? 'SENT' : 'FAILED',
          error: live ? null : `La pasarela la dejó en estado «${match.status}».`,
          confirmedAt: new Date(),
        },
      })
      continue
    }

    // No aparece: si ya ha pasado el margen, es que nunca llegó a existir.
    if (Date.now() - row.createdAt.getTime() > UNRESOLVED_GRACE_MS) {
      await prisma.whopPayout.update({
        where: { id: row.id },
        data: { status: 'FAILED', error: 'No llegó a registrarse en la pasarela.', confirmedAt: new Date() },
      })
      continue
    }

    blocking = true
  }
  return blocking
}

/** Toma el cerrojo del club. Devuelve false si ya lo tiene otro proceso. */
async function acquireLock(): Promise<boolean> {
  const stale = new Date(Date.now() - LOCK_TTL_MS)
  const claimed = await prisma.clubSettings.updateMany({
    where: {
      isDefault: true,
      OR: [{ whopSweepLockAt: null }, { whopSweepLockAt: { lt: stale } }],
    },
    data: { whopSweepLockAt: new Date() },
  })
  return claimed.count > 0
}

async function releaseLock(): Promise<void> {
  await prisma.clubSettings
    .update({ where: { isDefault: true }, data: { whopSweepLockAt: null } })
    .catch((e) => console.error('[whop/sweep] no se pudo soltar el cerrojo', e))
}

/**
 * Ejecuta el barrido del club activo.
 *
 * @param force     Transferir ahora aunque no toque por calendario (botón manual).
 * @param currency  Divisa concreta a transferir. Sólo para el botón manual: el
 *                  barrido automático se ciñe a la divisa de la cuenta bancaria
 *                  para no meter al club en un cambio de moneda que no ha pedido.
 */
export async function sweepClubBalance(force = false, currency?: string): Promise<SweepResult> {
  const config = await getWhopClubConfig()
  if (!config.hasCompany) return { ok: true, skipped: true, reason: 'pasarela no conectada' }
  if (config.onboardingStatus === 'DISABLED') {
    return { ok: true, skipped: true, reason: 'pasarela deshabilitada' }
  }

  // Puede que la cuenta esté guardada en la pasarela pero no anotada aquí.
  const payoutMethodId = config.hasPayoutMethod ? config.payoutMethodId : await syncDefaultPayoutMethod()
  if (!payoutMethodId) return { ok: true, skipped: true, reason: 'sin cuenta bancaria' }

  if (!force && !isDue(config.sweepFrequency, config.lastSweepAt)) {
    return { ok: true, skipped: true, reason: 'aún no toca' }
  }

  if (!(await acquireLock())) {
    return { ok: true, skipped: true, reason: 'ya hay un barrido en curso' }
  }

  try {
    if (await resolvePending()) {
      return { ok: true, skipped: true, reason: 'hay una transferencia anterior sin confirmar' }
    }

    const balances = await getBalances()
    if (!balances.ok) return { ok: false, error: balances.error }

    // La divisa de la cuenta bancaria manda: transferir otra divisa implicaría un
    // cambio de moneda al tipo del día, y eso el club lo decide a mano.
    const bankCurrency = (config.payoutCurrency || 'EUR').toUpperCase()
    const target = (currency || bankCurrency).toUpperCase()

    // El mínimo es para el barrido automático: si el club pulsa el botón, se le
    // manda lo que tenga, aunque sea poco. Ya decide él si le compensa.
    const min = force ? 0 : Math.max(config.sweepMinAmount, 0)
    const eligible = balances.balances.filter((b) => b.currency === target && b.available >= min && b.available > 0)
    const stranded = balances.balances
      .filter((b) => b.currency !== target && b.available > 0)
      .map((b) => `${b.available} ${b.currency}`)

    if (eligible.length === 0) {
      const own = balances.balances.find((b) => b.currency === target)
      const reason = !own || own.available <= 0 ? 'sin saldo disponible' : `saldo por debajo del mínimo (${own.available} < ${min})`
      return { ok: true, skipped: true, reason }
    }

    const transfers: SweepTransfer[] = []
    for (const balance of eligible) {
      // La fila se crea ANTES de mover nada y ya lleva su clave de reintento: es
      // única en la tabla, así que este barrido no puede generar dos.
      const key = `crm:sweep:${randomUUID()}`
      const row = await prisma.whopPayout.create({
        data: {
          idempotencyKey: key,
          amount: balance.available,
          currency: balance.currency,
          status: 'SENDING',
          trigger: force ? 'MANUAL' : 'AUTO',
        },
      })

      const payout = await createPayout({
        amount: balance.available,
        currency: balance.currency,
        payoutMethodId,
        descriptor: 'Cuotas de socios',
        idempotencyKey: key,
        reference: row.id,
      })

      if (payout.ok) {
        await prisma.whopPayout.update({
          where: { id: row.id },
          data: { payoutId: payout.id, status: 'SENT', confirmedAt: new Date() },
        })
        transfers.push({ amount: balance.available, currency: balance.currency, payoutId: payout.id })
        continue
      }

      // Indeterminado ≠ fallido: se deja abierta para comprobarla, nunca se
      // reintenta a ciegas.
      await prisma.whopPayout.update({
        where: { id: row.id },
        data: {
          status: payout.indeterminate ? 'UNKNOWN' : 'FAILED',
          error: payout.error.slice(0, 400),
          ...(payout.indeterminate ? {} : { confirmedAt: new Date() }),
        },
      })
      if (!payout.indeterminate) return { ok: false, error: payout.error }
      return { ok: false, error: `${payout.error} Se comprobará antes del próximo intento.` }
    }

    // Sólo cuenta como barrido hecho si de verdad se ha movido dinero: si el club
    // no tenía saldo, el mes que viene no debería tener que esperar otro ciclo.
    await prisma.clubSettings
      .update({ where: { isDefault: true }, data: { whopLastSweepAt: new Date() } })
      .catch((e) => console.error('[whop/sweep] no se pudo anotar la fecha del barrido', e))

    return { ok: true, skipped: false, transfers, stranded }
  } finally {
    await releaseLock()
  }
}

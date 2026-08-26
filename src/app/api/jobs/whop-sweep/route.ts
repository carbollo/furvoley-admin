import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { forEachTenant } from '@/lib/multitenant/dispatch'
import { sweepClubBalance } from '@/lib/whop/sweep'

export const dynamic = 'force-dynamic'
export const maxDuration = 800

/** Se para antes del límite del runtime para poder responder qué quedó fuera. */
const TIME_BUDGET_MS = 600_000

/**
 * Transferencia automática del saldo de cada club a su banco.
 *
 * Tarea diaria: cada club decide su frecuencia (diaria/semanal/mensual) y su
 * importe mínimo; aquí solo se transfiere a quien le toque. Un fallo en un club
 * no interrumpe al resto.
 *
 * Si no da tiempo a recorrer todos, se corta limpiamente y se dice cuáles han
 * quedado pendientes; el recorrido rota cada día para que no sean siempre los
 * mismos clubes los que se quedan sin barrer.
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/jobs/whop-sweep
 */
type ClubOutcome =
  | { club: string; transfers: { amount: number; currency: string; payoutId: string }[]; stranded: string[] }
  | { club: string; skipped: string }
  | { club: string; error: string }

async function run(request: Request) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const startedAt = Date.now()
  const dayOfYear = Math.floor(Date.now() / 86_400_000)
  const deferred: string[] = []

  const results = await forEachTenant<ClubOutcome>(
    async (slug) => {
      const club = slug || '(default)'
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        deferred.push(club)
        return { club, skipped: 'sin tiempo en esta pasada' }
      }
      const r = await sweepClubBalance(false)
      if (!r.ok) return { club, error: r.error }
      if (r.skipped) return { club, skipped: r.reason }
      return { club, transfers: r.transfers, stranded: r.stranded }
    },
    { rotateBy: dayOfYear },
  )

  const outcomes = results.map<ClubOutcome>((r) =>
    r.ok && r.value
      ? r.value
      : // El error crudo de un tenant puede llevar dentro su cadena de conexión.
        { club: r.slug, error: 'Fallo al procesar el club; revisa los logs del servidor.' },
  )

  const transferred = outcomes.filter((o) => 'transfers' in o && o.transfers.length > 0)
  const failed = outcomes.filter((o) => 'error' in o)

  for (const o of outcomes) {
    if ('error' in o) console.error(`[whop-sweep] ${o.club}: fallo en el barrido`)
  }

  return NextResponse.json({
    ok: failed.length === 0,
    clubs: outcomes.length,
    transferred: transferred.length,
    failed: failed.length,
    truncated: deferred.length > 0,
    deferred,
    detail: outcomes,
  })
}

export async function POST(request: Request) {
  return run(request)
}

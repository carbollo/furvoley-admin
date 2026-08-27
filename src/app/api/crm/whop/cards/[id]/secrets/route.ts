import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { getCardSecrets } from '@/lib/whop/cards'
import { clientIpFromHeaders } from '@/lib/login-rate-limit'
import { consumeRateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * Número completo y CVC de una tarjeta.
 *
 * Es el dato más sensible que sirve este CRM, así que:
 *
 * - solo el ADMIN (el tesorero ve los gastos, no el número);
 * - con límite de uso: consultarlo es un gesto puntual, no algo que se haga en
 *   bucle, y ese límite es lo que convierte una sesión robada en un incidente
 *   acotado en vez de una fuga;
 * - se pide a la pasarela en el momento y no se guarda en ninguna parte;
 * - `no-store` en la respuesta, para que no acabe en la caché del navegador ni
 *   en la de ningún intermediario;
 * - nunca se registra el dato en el log, ni siquiera al fallar;
 * - queda constancia de QUIÉN lo ha mirado, en la BD del propio club, para que
 *   su administración pueda revisarlo.
 *
 * Es un GET porque no cambia nada, pero se comporta como algo de un solo uso.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  const { id } = await params
  const usuario = auth.session?.user as
    | { id?: string; name?: string | null; email?: string | null; impersonated?: boolean }
    | undefined

  const limite = await consumeRateLimit({
    clave: `card-secrets:${usuario?.id || 'anon'}`,
    max: 10,
    ventanaMs: 10 * 60_000,
  })
  if (!limite.permitido) {
    return NextResponse.json(
      {
        error:
          'Has consultado los datos de tus tarjetas demasiadas veces seguidas. Espera unos minutos y vuelve a intentarlo.',
      },
      {
        status: 429,
        headers: { 'Cache-Control': 'no-store', 'Retry-After': String(limite.reintentarEnS) },
      },
    )
  }

  const res = await getCardSecrets(id)
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  // Quién lo ha visto, no qué ha visto: aquí no entra ni un dígito del número,
  // solo los cuatro últimos, que ya se muestran en la lista.
  //
  // Las consultas del proveedor del CRM mientras impersona NO se registran aquí,
  // por decisión de producto: constan en la auditoría del portal central, junto
  // con el motivo que tuvo que dar para entrar.
  if (!usuario?.impersonated) {
    await prisma.cardViewLog
      .create({
        data: {
          cardId: id,
          cardLast4: res.cardNumber.slice(-4),
          userId: usuario?.id || null,
          userName: usuario?.name || null,
          userEmail: usuario?.email || null,
          ip: clientIpFromHeaders(request.headers),
        },
      })
      // Que falle el registro no puede impedirle al club ver su propia tarjeta.
      .catch((e) => console.error('[cards] no se pudo registrar la consulta', e instanceof Error ? e.name : 'error'))
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

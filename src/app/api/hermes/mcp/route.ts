import { NextResponse } from 'next/server'
import { hermesActorFromRequest, withHermesActor } from '@/lib/hermes-mcp/actor'
import { verifyHermesMcpAuth } from '@/lib/hermes-mcp/auth'
import { checkHermesMcpRateLimit } from '@/lib/hermes-mcp/rate-limit'
import { handleHermesMcpRequest } from '@/lib/hermes-mcp/session-store'
import { withTenant } from '@/lib/multitenant/context'
import { isMultiTenant, sanitizeSlug, tenantDbUrl } from '@/lib/multitenant/registry'
import { currentTenant } from '@/lib/multitenant/context'
import { enterTenantFromRequest } from '@/lib/multitenant/request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Punto de entrada MCP del agente.
 *
 * Aquí hay que resolver el club ANTES de nada, y esa es la diferencia con el
 * resto de rutas. Las demás llegan por el subdominio del club y `requireRoles`
 * activa la base de datos por el camino; esta la llama el gateway de WhatsApp
 * por `127.0.0.1`, donde no hay subdominio del que deducir nada.
 *
 * Mientras no se resolvía, la ruta estaba MUERTA en multi-tenant: la primera
 * consulta —la que comprueba si Hermes está activado, antes incluso de validar
 * la clave— se ejecutaba sin club y reventaba. Ni siquiera daba un error
 * legible: daba «operación de BD sin tenant en contexto».
 *
 * Ahora el club llega por el subdominio si lo hay, y si no por la cabecera
 * `x-hermes-club` que pone el gateway. Que esa cabecera la controle quien llama
 * no abre nada: solo elige CONTRA QUÉ CLUB se comprueba la clave, y la clave
 * sigue siendo la de ese club.
 */
async function conClub<T>(
  request: Request,
  fn: () => Promise<T>,
): Promise<T | NextResponse> {
  if (!isMultiTenant()) return fn()

  // 1) Por subdominio, que es como llega si el gateway usa la URL pública.
  await enterTenantFromRequest(request)
  const porHost = currentTenant()?.slug
  if (porHost) return fn()

  // 2) Por cabecera, que es como llega desde 127.0.0.1.
  const slug = sanitizeSlug(request.headers.get('x-hermes-club'))
  const dbUrl = slug ? tenantDbUrl(slug) : null
  if (!slug || !dbUrl) {
    // Mismo 401 que una clave inválida, a propósito: si un club inexistente
    // diera un error distinto, se podría averiguar qué clubes existen probando.
    console.warn('[hermes-mcp] petición sin club resoluble')
    return NextResponse.json({ error: 'API key MCP inválida' }, { status: 401 })
  }
  return withTenant({ slug, dbUrl }, fn)
}

async function guard(request: Request) {
  const auth = await verifyHermesMcpAuth(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status })
  }
  const rate = checkHermesMcpRateLimit(request, auth.apiKey)
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Rate limit excedido' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    )
  }
  return null
}

export async function GET(request: Request) {
  return conClub(request, () => withHermesActor(hermesActorFromRequest(request), async () => {
    const denied = await guard(request)
    if (denied) return denied
    return handleHermesMcpRequest(request)
  }))
}

export async function POST(request: Request) {
  return conClub(request, () => withHermesActor(hermesActorFromRequest(request), async () => {
    const denied = await guard(request)
    if (denied) return denied
    let parsedBody: unknown
    try {
      parsedBody = await request.json()
    } catch {
      parsedBody = undefined
    }
    return handleHermesMcpRequest(request, parsedBody)
  }))
}

export async function DELETE(request: Request) {
  return conClub(request, () => withHermesActor(hermesActorFromRequest(request), async () => {
    const denied = await guard(request)
    if (denied) return denied
    return handleHermesMcpRequest(request)
  }))
}

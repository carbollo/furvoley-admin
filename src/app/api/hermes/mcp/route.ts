import { NextResponse } from 'next/server'
import { hermesActorFromRequest, withHermesActor } from '@/lib/hermes-mcp/actor'
import { verifyHermesMcpAuth } from '@/lib/hermes-mcp/auth'
import { checkHermesMcpRateLimit } from '@/lib/hermes-mcp/rate-limit'
import { handleHermesMcpRequest } from '@/lib/hermes-mcp/session-store'
import { withTenant } from '@/lib/multitenant/context'
import { isMultiTenant, sanitizeSlug, tenantDbUrl } from '@/lib/multitenant/registry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Punto de entrada MCP del agente.
 *
 * Aquí hay que resolver el club ANTES de nada, y esa es la diferencia con el
 * resto de rutas. Las demás llegan por el subdominio del club y `requireRoles`
 * activa la base de datos por el camino; a esta la llama el gateway de WhatsApp
 * por `127.0.0.1`, donde no hay subdominio del que deducir nada.
 *
 * Mientras no se resolvía, la ruta estaba MUERTA en multi-tenant: la primera
 * consulta —la que comprueba si Hermes está activado, antes incluso de validar
 * la clave— se ejecutaba sin club y reventaba con «operación de BD sin tenant en
 * contexto».
 *
 * Dos detalles que costaron un despliegue:
 *
 * 1. Se usa `withTenant` (que por dentro es `als.run`) y NO `enterTenantFromRequest`
 *    (que usa `enterWith`). `enterWith` no sobrevive a un `await`, así que el
 *    contexto se perdía entre activar el club y ejecutar la herramienta. Es la
 *    trampa que el propio cerebro del proyecto tiene documentada.
 * 2. El slug se lee de `x-tenant-slug` —que pone el middleware a partir del
 *    host, nunca el cliente— o de `x-hermes-club`, que es como llega desde
 *    127.0.0.1. Que esa segunda cabecera la ponga quien llama no abre nada:
 *    solo elige CONTRA QUÉ CLUB se comprueba la clave, y la clave sigue siendo
 *    la de ese club.
 */
function clubDeLaPeticion(request: Request): { slug: string; dbUrl: string } | null {
  const slug =
    sanitizeSlug(request.headers.get('x-tenant-slug')) ||
    sanitizeSlug(request.headers.get('x-hermes-club'))
  const dbUrl = slug ? tenantDbUrl(slug) : null
  return slug && dbUrl ? { slug, dbUrl } : null
}

async function guard(request: Request) {
  let auth
  try {
    auth = await verifyHermesMcpAuth(request)
  } catch (e) {
    // Comprobar la clave es lo primero que toca la base de datos del club. Si
    // eso falla, el club no existe o no se puede alcanzar: se responde igual
    // que ante una clave mala, para que no se pueda averiguar qué clubes hay
    // probando nombres. El motivo queda en el log del servidor.
    console.warn('[hermes-mcp] no se pudo comprobar la clave', e instanceof Error ? e.name : 'error')
    return NextResponse.json({ error: 'API key MCP inválida' }, { status: 401 })
  }
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

/** Resuelve el club, fija quién pide la acción, y ejecuta. */
function enContexto<T>(request: Request, fn: () => Promise<T>): Promise<T | NextResponse> {
  const conActor = () => withHermesActor(hermesActorFromRequest(request), fn)

  if (!isMultiTenant()) return conActor()

  const club = clubDeLaPeticion(request)
  if (!club) {
    console.warn('[hermes-mcp] petición sin club resoluble')
    return Promise.resolve(NextResponse.json({ error: 'API key MCP inválida' }, { status: 401 }))
  }
  return withTenant(club, conActor)
}

export async function GET(request: Request) {
  return enContexto(request, async () => {
    const denied = await guard(request)
    if (denied) return denied
    return handleHermesMcpRequest(request)
  })
}

export async function POST(request: Request) {
  return enContexto(request, async () => {
    const denied = await guard(request)
    if (denied) return denied
    let parsedBody: unknown
    try {
      parsedBody = await request.json()
    } catch {
      parsedBody = undefined
    }
    return handleHermesMcpRequest(request, parsedBody)
  })
}

export async function DELETE(request: Request) {
  return enContexto(request, async () => {
    const denied = await guard(request)
    if (denied) return denied
    return handleHermesMcpRequest(request)
  })
}

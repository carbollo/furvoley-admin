import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Quién le está pidiendo las cosas al agente.
 *
 * El registro de acciones guardaba qué se hizo y cuándo, pero no de parte de
 * quién: aparecía una factura marcada como pagada en efectivo a las 23:14 y no
 * había forma de saber si lo pidió el presidente, el tesorero, un número que se
 * coló en la lista de permitidos, o el propio modelo tras leer el mensaje de un
 * socio.
 *
 * Va por AsyncLocalStorage y no por parámetro porque las herramientas son
 * decenas y ninguna debería tener que acordarse de propagarlo.
 */
export type HermesActor = {
  /** Teléfono de WhatsApp o identificador de quien habla con el agente. */
  actor: string | null
  /** Conversación MCP, para poder reconstruir la secuencia entera. */
  sessionId: string | null
}

const als = new AsyncLocalStorage<HermesActor>()

export function withHermesActor<T>(ctx: HermesActor, fn: () => T): T {
  return als.run(ctx, fn)
}

export function currentHermesActor(): HermesActor {
  return als.getStore() ?? { actor: null, sessionId: null }
}

/**
 * Lee al solicitante de las cabeceras de la petición MCP.
 *
 * `x-hermes-actor` la pone el gateway con el teléfono de quien escribe. Si no
 * viene, al menos queda la conversación, que ya permite agrupar acciones.
 */
export function hermesActorFromRequest(request: Request): HermesActor {
  const bruto = (request.headers.get('x-hermes-actor') || '').trim()
  const sesion = (request.headers.get('mcp-session-id') || '').trim()
  return {
    actor: bruto ? bruto.slice(0, 120) : null,
    sessionId: sesion ? sesion.slice(0, 120) : null,
  }
}

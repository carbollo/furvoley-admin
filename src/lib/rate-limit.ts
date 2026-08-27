import { prisma } from '@/lib/prisma'

/**
 * Límite de uso por clave y ventana, contado en la base de datos del club.
 *
 * Por qué en base de datos y no en memoria, que sería más barato: un contador en
 * memoria se reinicia con cada despliegue y no cruza instancias, así que a quien
 * conozca esas dos cosas le basta con esperar un despliegue —o repartir las
 * peticiones— para pasar por encima. El de `login-rate-limit.ts` es en memoria a
 * propósito, porque ahí protege de fuerza bruta anónima y no puede depender de
 * un tenant activo; aquí, en cambio, todas las rutas están autenticadas y ya hay
 * una base de datos de club a mano.
 *
 * El contador se incrementa con UNA sola sentencia atómica. Importa: con dos
 * peticiones simultáneas, un «leer, comparar, escribir» en tres pasos deja pasar
 * las dos, que es justo el caso que se explota para saltarse el límite.
 *
 * Fail-closed: si la cuenta no se puede llevar, la petición se rechaza. Vale
 * para lo que protege esto —ver el número de una tarjeta, emitir una, mover
 * dinero—, donde negar de más es mucho más barato que permitir de más.
 */

export type ResultadoLimite = {
  permitido: boolean
  /** Peticiones consumidas en la ventana actual, contando esta. */
  usadas: number
  /** Segundos que faltan para que la ventana se reinicie. */
  reintentarEnS: number
}

export async function consumeRateLimit(opts: {
  /** Identifica qué se está limitando y a quién. Ej.: `card-secrets:<userId>`. */
  clave: string
  /** Peticiones permitidas dentro de la ventana. */
  max: number
  ventanaMs: number
}): Promise<ResultadoLimite> {
  const { clave, max, ventanaMs } = opts
  const ahora = new Date()
  const finVentana = new Date(ahora.getTime() + ventanaMs)

  try {
    // Un solo INSERT ... ON CONFLICT: crea el contador o lo incrementa, y de
    // paso reinicia la ventana si ya había caducado. Todo dentro de la misma
    // sentencia, que es lo que impide que dos peticiones a la vez lean el mismo
    // valor y se cuelen las dos.
    const filas = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
      VALUES (${clave}, 1, ${finVentana}, ${ahora})
      ON CONFLICT ("key") DO UPDATE SET
        "count"   = CASE WHEN "RateLimitBucket"."resetAt" <= ${ahora} THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= ${ahora} THEN ${finVentana} ELSE "RateLimitBucket"."resetAt" END,
        "updatedAt" = ${ahora}
      RETURNING "count", "resetAt"
    `
    const fila = filas?.[0]
    if (!fila) return { permitido: false, usadas: 0, reintentarEnS: Math.ceil(ventanaMs / 1000) }

    const usadas = Number(fila.count)
    const reintentarEnS = Math.max(1, Math.ceil((new Date(fila.resetAt).getTime() - ahora.getTime()) / 1000))
    return { permitido: usadas <= max, usadas, reintentarEnS }
  } catch (e) {
    // Nunca se registra la clave: puede llevar dentro el identificador de una
    // persona, y esto acaba en los logs del servidor.
    console.error('[rate-limit] fallo al contar', e instanceof Error ? e.name : 'error')
    return { permitido: false, usadas: 0, reintentarEnS: 60 }
  }
}

/**
 * Borra los contadores ya caducados.
 *
 * La tabla crece con una fila por clave distinta, así que conviene barrerla de
 * vez en cuando. No se llama desde la ruta que cuenta: hacerlo ahí añadiría un
 * borrado a cada petición para ahorrar unas filas.
 */
export async function limpiarLimitesCaducados(): Promise<number> {
  try {
    const r = await prisma.rateLimitBucket.deleteMany({ where: { resetAt: { lt: new Date() } } })
    return r.count
  } catch {
    return 0
  }
}

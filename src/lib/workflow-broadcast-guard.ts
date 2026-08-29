import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Evita que un envío colectivo salga una vez por cada socio del grupo.
 *
 * Hay disparadores que se ejecutan POR SOCIO —el mensaje al grupo recorre a los
 * veinte jugadores— y acciones que son COLECTIVAS: «mandar a todo el equipo»
 * abanica ella sola a los veinte. Combinadas dan veinte por veinte: cuatrocientos
 * mensajes, cada familia recibiendo el mismo texto veinte veces, y la sesión de
 * WhatsApp del club a un paso de que la bloqueen por spam.
 *
 * La guarda va aquí y no en el runner porque el problema es de la ACCIÓN: un
 * flujo con pasos por socio (mandarle SU recibo, por ejemplo) tiene que seguir
 * ejecutándose veinte veces. Lo que no puede repetirse es el abanico.
 *
 * Es un `AsyncLocalStorage` y no un global de proceso: corta solo dentro de la
 * misma cadena de ejecución, sin estorbar a dos clubes que difundan a la vez.
 */
const enviosDelDisparo = new AsyncLocalStorage<Set<string>>()

/** Marca el ámbito de UN disparo (una pulsación de «mandar al grupo»). */
export function conAmbitoDeDifusion<T>(fn: () => Promise<T>): Promise<T> {
  return enviosDelDisparo.run(new Set<string>(), fn)
}

/**
 * ¿Ya se hizo este envío colectivo en este disparo?
 *
 * Devuelve `true` la PRIMERA vez (y lo anota), `false` las siguientes. Fuera de
 * un ámbito de difusión siempre deja pasar: los disparos sueltos no se agrupan.
 */
export function reservarDifusion(clave: string): boolean {
  const hechos = enviosDelDisparo.getStore()
  if (!hechos) return true
  if (hechos.has(clave)) return false
  hechos.add(clave)
  return true
}

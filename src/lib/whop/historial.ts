/**
 * Cuánto historial se enseña y de cuánto en cuánto.
 *
 * Vive aparte porque lo tienen que compartir dos lados que no se hablan: el
 * servidor, que decide cuántas filas le pide a la pasarela, y la pantalla, que
 * decide cuántas pinta de golpe. Si cada uno llevara su propio número, el tope
 * real acabaría siendo el más pequeño de los dos sin que nadie lo hubiera
 * decidido.
 */

/** Filas por página en los historiales (transferencias y gastos de tarjeta). */
export const HISTORIAL_POR_PAGINA = 20

/**
 * Tope de filas que se pueden mirar hacia atrás. No es un tope de pantalla: es
 * lo máximo que se le pide a la pasarela, así que el CRM ni siquiera llega a
 * tener en memoria más historial del que se puede consultar.
 */
export const HISTORIAL_MAXIMO = 100

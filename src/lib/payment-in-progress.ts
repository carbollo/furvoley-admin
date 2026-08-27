/** Cuánto tiempo se considera que un pago sigue en curso tras abrir el enlace. */
export const PAGO_EN_CURSO_MIN = 15

/**
 * ¿Este socio acaba de irse a pagar esta factura?
 *
 * El cobro no llega al CRM en el mismo instante: la pasarela lo confirma por
 * webhook unos segundos o minutos después. Durante ese hueco la factura sigue
 * apareciendo como pendiente y, si se le vuelve a ofrecer el botón, el socio
 * paga dos veces la misma cuota.
 */
export function pagoEnCurso(
  inv: { whopCheckoutStartedAt?: Date | string | null },
  ahora = new Date(),
): boolean {
  const t = inv.whopCheckoutStartedAt
  if (!t) return false
  const inicio = t instanceof Date ? t : new Date(t)
  if (Number.isNaN(inicio.getTime())) return false
  return ahora.getTime() - inicio.getTime() < PAGO_EN_CURSO_MIN * 60_000
}

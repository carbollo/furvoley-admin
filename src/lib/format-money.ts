/**
 * Formato único de importes para todo el producto.
 *
 * Antes convivían cinco: `es-AR` sin decimales en el CRM, `es-ES` con dos en el
 * panel del socio, y tres variantes de `€{n.toFixed(2)}` en contabilidad. El del
 * CRM redondeaba a euros enteros, así que una cuota de 12,50 € se leía «EUR 13»
 * y ninguna columna sumaba su propio total ni cuadraba con el extracto del banco.
 *
 * Regla: **en cualquier sitio donde el número represente dinero, dos decimales
 * siempre**. Para rótulos donde el espacio manda existe `formatMoneyCompact`,
 * que nunca debe usarse en tablas ni en desgloses.
 */

const CACHE = new Map<string, Intl.NumberFormat>()

function formatter(currency: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = currency + JSON.stringify(opts)
  let f = CACHE.get(key)
  if (!f) {
    f = new Intl.NumberFormat('es-ES', { style: 'currency', currency, ...opts })
    CACHE.set(key, f)
  }
  return f
}

/**
 * Importe con dos decimales y formato español: `1.234,50 €`.
 * Devuelve `—` si el valor no es un número, para que un fallo de datos se vea
 * como un hueco y no como un cero (que se leería como «no debe nada»).
 */
export function formatMoney(n: number | null | undefined, currency = 'EUR'): string {
  const value = Number(n)
  if (!Number.isFinite(value)) return '—'
  const cur = (currency || 'EUR').toUpperCase()
  try {
    // es-ES ya coloca el signo delante del número, así que no hay que recomponer
    // las partes a mano como hacía la versión anterior.
    return formatter(cur, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
  } catch {
    const abs = Math.abs(value).toLocaleString('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    return `${value < 0 ? '-' : ''}${abs} €`
  }
}

/**
 * Versión corta para rótulos con poco espacio: `1,2 mil €`.
 * NUNCA en tablas, totales ni desgloses: ahí el céntimo importa.
 */
export function formatMoneyCompact(n: number | null | undefined, currency = 'EUR'): string {
  const value = Number(n)
  if (!Number.isFinite(value)) return '—'
  if (Math.abs(value) < 10000) return formatMoney(value, currency)
  const cur = (currency || 'EUR').toUpperCase()
  try {
    return formatter(cur, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
  } catch {
    return formatMoney(value, currency)
  }
}

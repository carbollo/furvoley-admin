/**
 * Ejecuta `fn` sobre cada elemento con un máximo de `limit` tareas en paralelo.
 * Mantiene el orden de los resultados y nunca lanza: cada tarea se resuelve
 * individualmente (usa try/catch dentro de `fn` si necesitas tolerar fallos).
 *
 * Pensado para acelerar envíos masivos (WhatsApp/ApiWass, enlaces Stripe…) que
 * antes se hacían de uno en uno y tardaban demasiado, sin saturar el proveedor.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  const max = Math.max(1, Math.min(limit, items.length || 1))
  let cursor = 0

  async function worker() {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      results[index] = await fn(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: max }, () => worker()))
  return results
}

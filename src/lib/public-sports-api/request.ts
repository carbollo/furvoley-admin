import { publicSportsError } from '@/lib/public-sports-api/index'

/** Lee cuerpo JSON del bot (POST); `{}` vacío es válido. */
export async function parsePublicSportsJsonBody(
  request: Request,
): Promise<Record<string, unknown> | Response> {
  try {
    const text = await request.text()
    if (!text.trim()) return {}
    const parsed: unknown = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return publicSportsError(400, 'El cuerpo debe ser un objeto JSON, por ejemplo {} o { "resource": "calendar" }.')
    }
    return parsed as Record<string, unknown>
  } catch {
    return publicSportsError(400, 'JSON no válido en el cuerpo del mensaje.')
  }
}

/** Combina query string + cuerpo JSON (el cuerpo gana si repites clave). */
export function mergePublicSportsParams(
  searchParams: URLSearchParams,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const nested =
    body.params && typeof body.params === 'object' && !Array.isArray(body.params)
      ? (body.params as Record<string, unknown>)
      : {}

  const out: Record<string, unknown> = { ...nested }

  searchParams.forEach((value, key) => {
    out[key] = value
  })

  for (const [key, value] of Object.entries(body)) {
    if (key === 'params') continue
    out[key] = value
  }

  return out
}

export function paramString(
  params: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = params[key]
  if (typeof v === 'string') {
    const t = v.trim()
    return t || undefined
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return undefined
}

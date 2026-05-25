type Bucket = { count: number; resetAt: number }

const WINDOW_MS = Number(process.env.HERMES_MCP_RATE_WINDOW_MS || 60_000)
const MAX_REQUESTS = Number(process.env.HERMES_MCP_RATE_MAX || 120)

declare global {
  // eslint-disable-next-line no-var
  var __hermesMcpRateBuckets: Map<string, Bucket> | undefined
}

const buckets = globalThis.__hermesMcpRateBuckets ?? new Map<string, Bucket>()
globalThis.__hermesMcpRateBuckets = buckets

function clientKey(request: Request, apiKey: string) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = forwarded || request.headers.get('x-real-ip') || 'unknown'
  return `${ip}:${apiKey.slice(0, 8)}`
}

export function checkHermesMcpRateLimit(request: Request, apiKey: string) {
  const key = clientKey(request, apiKey)
  const now = Date.now()
  const existing = buckets.get(key)
  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return { ok: true as const }
  }
  if (existing.count >= MAX_REQUESTS) {
    return {
      ok: false as const,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    }
  }
  existing.count += 1
  return { ok: true as const }
}

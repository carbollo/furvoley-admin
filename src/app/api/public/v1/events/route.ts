import {
  assertPublicSportsApiAuth,
  listEvents,
  parseIsoDate,
  parseLimit,
  publicSportsError,
  publicSportsJson,
} from '@/lib/public-sports-api'

export async function GET(request: Request) {
  const denied = assertPublicSportsApiAuth(request)
  if (denied) return denied

  const url = new URL(request.url)
  const fromRaw = parseIsoDate(url.searchParams.get('from'), 'from')
  if (fromRaw instanceof Response) return fromRaw
  const toRaw = parseIsoDate(url.searchParams.get('to'), 'to')
  if (toRaw instanceof Response) return toRaw

  const type = url.searchParams.get('type')?.trim() || undefined
  if (type && !['TRAINING', 'MATCH', 'TOURNAMENT', 'SOCIAL', 'OTHER'].includes(type)) {
    return publicSportsError(400, 'type no válido')
  }

  const status = url.searchParams.get('status')?.trim() || undefined
  if (status && !['SCHEDULED', 'CANCELLED', 'COMPLETED'].includes(status)) {
    return publicSportsError(400, 'status no válido')
  }

  const events = await listEvents({
    teamId: url.searchParams.get('teamId')?.trim() || undefined,
    type,
    from: fromRaw ?? undefined,
    to: toRaw ?? undefined,
    status,
    limit: parseLimit(url.searchParams.get('limit')),
  })

  return publicSportsJson({ events, count: events.length })
}

export async function OPTIONS() {
  return publicSportsJson({ ok: true })
}

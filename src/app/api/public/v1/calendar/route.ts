import {
  assertPublicSportsApiAuth,
  getCalendarFeed,
  parseIsoDate,
  parseLimit,
  publicSportsJson,
} from '@/lib/public-sports-api'

export async function GET(request: Request) {
  const denied = await assertPublicSportsApiAuth(request)
  if (denied) return denied

  const url = new URL(request.url)
  const fromRaw = parseIsoDate(url.searchParams.get('from'), 'from')
  if (fromRaw instanceof Response) return fromRaw
  const toRaw = parseIsoDate(url.searchParams.get('to'), 'to')
  if (toRaw instanceof Response) return toRaw

  const feed = await getCalendarFeed({
    from: fromRaw ?? undefined,
    to: toRaw ?? undefined,
    groupId: url.searchParams.get('groupId')?.trim() || undefined,
    limit: parseLimit(url.searchParams.get('limit'), 200, 100),
  })

  return publicSportsJson(feed)
}

export async function OPTIONS() {
  return publicSportsJson({ ok: true })
}

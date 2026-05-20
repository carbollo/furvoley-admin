import {
  assertPublicSportsApiAuth,
  listHolidays,
  parseIsoDate,
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

  const holidays = await listHolidays(fromRaw ?? undefined, toRaw ?? undefined)
  return publicSportsJson({ holidays, count: holidays.length })
}

export async function OPTIONS() {
  return publicSportsJson({ ok: true })
}

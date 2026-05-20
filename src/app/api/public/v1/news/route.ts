import {
  assertPublicSportsApiAuth,
  listPublishedNews,
  parseLimit,
  publicSportsJson,
} from '@/lib/public-sports-api'

export async function GET(request: Request) {
  const denied = assertPublicSportsApiAuth(request)
  if (denied) return denied

  const url = new URL(request.url)
  const news = await listPublishedNews(parseLimit(url.searchParams.get('limit'), 30, 10))
  return publicSportsJson({ news, count: news.length })
}

export async function OPTIONS() {
  return publicSportsJson({ ok: true })
}

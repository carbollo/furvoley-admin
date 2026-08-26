import {
  API_INDEX,
  assertPublicSportsApiAuth,
  publicSportsJson,
} from '@/lib/public-sports-api'

export async function GET(request: Request) {
  const denied = await assertPublicSportsApiAuth(request)
  if (denied) return denied
  return publicSportsJson(API_INDEX)
}

export async function OPTIONS() {
  return publicSportsJson({ ok: true })
}

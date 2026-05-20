import {
  assertPublicSportsApiAuth,
  listTeams,
  publicSportsJson,
} from '@/lib/public-sports-api'

export async function GET(request: Request) {
  const denied = assertPublicSportsApiAuth(request)
  if (denied) return denied
  const teams = await listTeams()
  return publicSportsJson({ teams, count: teams.length })
}

export async function OPTIONS() {
  return publicSportsJson({ ok: true })
}

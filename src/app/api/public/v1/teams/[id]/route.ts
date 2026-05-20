import {
  assertPublicSportsApiAuth,
  getTeamById,
  publicSportsError,
  publicSportsJson,
} from '@/lib/public-sports-api'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = assertPublicSportsApiAuth(request)
  if (denied) return denied

  const { id } = await context.params
  const team = await getTeamById(id)
  if (!team) return publicSportsError(404, 'Equipo no encontrado')
  return publicSportsJson({ team })
}

export async function OPTIONS() {
  return publicSportsJson({ ok: true })
}

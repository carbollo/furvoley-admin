import {
  assertPublicSportsApiAuth,
  getTeamById,
  publicSportsError,
  publicSportsJson,
} from '@/lib/public-sports-api'
import { parseCuid } from '@/lib/db-input-validation'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = await assertPublicSportsApiAuth(request)
  if (denied) return denied

  const { id } = await context.params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return publicSportsError(400, 'id no tiene un formato válido.')
  const team = await getTeamById(parsedId)
  if (!team) return publicSportsError(404, 'Equipo no encontrado')
  return publicSportsJson({ team })
}

export async function OPTIONS() {
  return publicSportsJson({ ok: true })
}

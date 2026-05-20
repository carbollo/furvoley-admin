import {
  assertPublicSportsApiAuth,
  getEventById,
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
  const event = await getEventById(id)
  if (!event) return publicSportsError(404, 'Actividad no encontrada o no disponible en la API pública')
  return publicSportsJson({ event })
}

export async function OPTIONS() {
  return publicSportsJson({ ok: true })
}

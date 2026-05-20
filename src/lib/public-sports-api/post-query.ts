import {
  assertPublicSportsApiAuth,
  getCalendarFeed,
  getEventById,
  getTeamById,
  listEvents,
  listHolidays,
  listPublishedNews,
  listTeams,
  parseIsoDate,
  parseLimit,
  publicSportsError,
  publicSportsJson,
} from '@/lib/public-sports-api/index'

export type PublicSportsQueryBody = {
  apiKey?: string
  resource?: string
  id?: string
  teamId?: string
  type?: string
  status?: string
  from?: string
  to?: string
  limit?: number | string
}

function assertApiKeyInBody(body: PublicSportsQueryBody): Response | null {
  const required = process.env.PUBLIC_SPORTS_API_KEY?.trim()
  if (!required) return null
  const key = String(body.apiKey ?? '').trim()
  if (key === required) return null
  return publicSportsError(401, 'apiKey incorrecta o ausente en el JSON.')
}

function paramStr(body: PublicSportsQueryBody, key: keyof PublicSportsQueryBody) {
  const v = body[key]
  if (typeof v === 'string') {
    const t = v.trim()
    return t || undefined
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return undefined
}

export async function handlePublicSportsPostQuery(request: Request) {
  let body: PublicSportsQueryBody
  try {
    body = (await request.json()) as PublicSportsQueryBody
  } catch {
    return publicSportsError(400, 'Cuerpo JSON obligatorio.')
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return publicSportsError(400, 'El cuerpo debe ser un objeto JSON.')
  }

  const headerDenied = assertPublicSportsApiAuth(request)
  if (headerDenied) {
    const bodyDenied = assertApiKeyInBody(body)
    if (bodyDenied) return bodyDenied
  }

  const resource = String(body.resource ?? '')
    .trim()
    .toLowerCase()

  if (!resource) {
    return publicSportsError(400, 'Falta "resource" en el JSON.', {
      ejemplos: {
        calendario: { apiKey: 'TU_CLAVE', resource: 'calendar' },
        equipos: { apiKey: 'TU_CLAVE', resource: 'teams' },
        eventos: {
          apiKey: 'TU_CLAVE',
          resource: 'events',
          from: '2026-05-01',
          to: '2026-05-31',
        },
      },
    })
  }

  const fromRaw = parseIsoDate(paramStr(body, 'from') ?? null, 'from')
  if (fromRaw instanceof Response) return fromRaw
  const toRaw = parseIsoDate(paramStr(body, 'to') ?? null, 'to')
  if (toRaw instanceof Response) return toRaw

  const limit = parseLimit(paramStr(body, 'limit') ?? null)

  if (resource === 'teams' || resource === 'equipos') {
    const teams = await listTeams()
    return publicSportsJson({ resource: 'teams', teams, count: teams.length })
  }

  if (resource === 'team' || resource === 'equipo') {
    const id = paramStr(body, 'id') || paramStr(body, 'teamId')
    if (!id) return publicSportsError(400, 'Falta "id" (id del equipo).')
    const team = await getTeamById(id)
    if (!team) return publicSportsError(404, 'Equipo no encontrado')
    return publicSportsJson({ resource: 'team', team })
  }

  if (resource === 'events' || resource === 'eventos') {
    const type = paramStr(body, 'type')
    if (type && !['TRAINING', 'MATCH', 'TOURNAMENT', 'SOCIAL', 'OTHER'].includes(type)) {
      return publicSportsError(400, 'type no válido')
    }
    const status = paramStr(body, 'status')
    if (status && !['SCHEDULED', 'CANCELLED', 'COMPLETED'].includes(status)) {
      return publicSportsError(400, 'status no válido')
    }
    const events = await listEvents({
      teamId: paramStr(body, 'teamId'),
      type,
      from: fromRaw ?? undefined,
      to: toRaw ?? undefined,
      status,
      limit,
    })
    return publicSportsJson({ resource: 'events', events, count: events.length })
  }

  if (resource === 'event' || resource === 'evento') {
    const id = paramStr(body, 'id')
    if (!id) return publicSportsError(400, 'Falta "id" (id del evento).')
    const event = await getEventById(id)
    if (!event) return publicSportsError(404, 'Evento no encontrado')
    return publicSportsJson({ resource: 'event', event })
  }

  if (resource === 'holidays' || resource === 'festivos') {
    const holidays = await listHolidays(fromRaw ?? undefined, toRaw ?? undefined)
    return publicSportsJson({ resource: 'holidays', holidays, count: holidays.length })
  }

  if (resource === 'news' || resource === 'noticias') {
    const news = await listPublishedNews(parseLimit(paramStr(body, 'limit') ?? null, 30, 10))
    return publicSportsJson({ resource: 'news', news, count: news.length })
  }

  if (resource === 'calendar' || resource === 'calendario') {
    const feed = await getCalendarFeed({
      from: fromRaw ?? undefined,
      to: toRaw ?? undefined,
      teamId: paramStr(body, 'teamId'),
      limit: parseLimit(paramStr(body, 'limit') ?? null, 200, 100),
    })
    return publicSportsJson({ resource: 'calendar', ...feed })
  }

  return publicSportsError(400, `resource desconocido: "${resource}"`, {
    validos: ['calendar', 'teams', 'team', 'events', 'event', 'holidays', 'news'],
  })
}

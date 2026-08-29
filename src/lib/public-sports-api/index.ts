import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'
import { isCuid } from '@/lib/db-input-validation'
import { enterTenantFromRequest } from '@/lib/multitenant/request'

/** Tipos de actividad expuestos sin marcar el evento como público. */
export const PUBLIC_SPORT_EVENT_TYPES = ['TRAINING', 'MATCH', 'TOURNAMENT'] as const

const EVENT_TYPE_LABELS: Record<string, string> = {
  TRAINING: 'Entrenamiento',
  MATCH: 'Partido',
  TOURNAMENT: 'Torneo',
  SOCIAL: 'Social',
  OTHER: 'Otro',
}

export function publicEventWhere(extra?: Prisma.EventWhereInput): Prisma.EventWhereInput {
  return {
    AND: [
      extra ?? {},
      {
        OR: [
          { isPublic: true },
          { type: { in: [...PUBLIC_SPORT_EVENT_TYPES] } },
        ],
      },
    ],
  }
}

export function parseIsoDate(value: string | null, field: string): Date | null | Response {
  if (!value?.trim()) return null
  const d = new Date(value.trim())
  if (Number.isNaN(d.getTime())) {
    return publicSportsError(400, `Parámetro "${field}" no es una fecha ISO válida.`)
  }
  return d
}

export function parseLimit(value: string | null, max = 100, fallback = 50): number {
  if (!value?.trim()) return fallback
  const n = Math.trunc(Number(value))
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(n, max)
}

export function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, X-API-Key, Content-Type',
  }
}

export function publicSportsJson<T>(data: T, status = 200) {
  return NextResponse.json(data, { status, headers: corsHeaders() })
}

export function publicSportsError(status: number, message: string, details?: Record<string, unknown>) {
  return NextResponse.json(
    { error: message, ...(details ? { details } : {}) },
    { status, headers: corsHeaders() },
  )
}

/** Si `PUBLIC_SPORTS_API_KEY` está definida, exige Bearer o X-API-Key. */
export async function assertPublicSportsApiAuth(request: Request): Promise<Response | null> {
  const required = process.env.PUBLIC_SPORTS_API_KEY?.trim()
  // Activa la BD del club (por host) ANTES de cualquier consulta prisma. Sin esto,
  // en multi-tenant el proxy de prisma lanzaría por "sin tenant" (o, peor, usaría la
  // BD por defecto). Se hace aquí porque todo endpoint público llama a este guard.
  if (!required) {
    await enterTenantFromRequest(request)
    return null
  }

  const auth = request.headers.get('authorization') ?? ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  const headerKey = request.headers.get('x-api-key')?.trim() ?? ''

  if (bearer === required || headerKey === required) {
    await enterTenantFromRequest(request)
    return null
  }
  return publicSportsError(
    401,
    'API key requerida. Envía Authorization: Bearer <clave> o el header X-API-Key.',
  )
}

export function serializeTeamSummary(
  group: {
    id: string
    name: string
    _count?: { memberships: number }
    memberships?: { role: string }[]
  },
  includeCounts = false,
) {
  let players = 0
  let coaches = 0
  if (group.memberships) {
    // Roles del organigrama: PLAYER | COACH | FAMILY. Los familiares no son
    // jugadores ni entrenadores, así que no se cuentan en el roster deportivo.
    for (const m of group.memberships) {
      if (m.role === 'COACH') coaches++
      else if (m.role === 'PLAYER') players++
    }
  }
  // Nota: sin `memberships` (solo `_count`) no hay desglose por rol, así que no
  // se puede informar el roster con precisión; se omite en vez de sobre-contar.

  return {
    id: group.id,
    name: group.name,
    category: null,
    seasonStartDate: null,
    seasonEndDate: null,
    ...(includeCounts ? { roster: { players, coaches } } : {}),
  }
}

export function serializeEvent(event: {
  id: string
  title: string
  type: string
  date: Date
  endDate: Date | null
  location: string | null
  description: string | null
  isPublic: boolean
  maxAttendees: number | null
  status: string
  source: string
  group: { id: string; name: string } | null
}) {
  const sportType = (PUBLIC_SPORT_EVENT_TYPES as readonly string[]).includes(event.type)
  return {
    id: event.id,
    title: event.title,
    type: event.type,
    typeLabel: EVENT_TYPE_LABELS[event.type] ?? event.type,
    status: event.status,
    date: event.date.toISOString(),
    endDate: event.endDate?.toISOString() ?? null,
    // El lugar y la descripción solo si el club marcó el evento como público.
    // Un entrenamiento interno se publicaba con su hora, su pabellón y sus
    // notas: cualquiera podía saber dónde y cuándo encontrar al equipo de
    // menores del club sin más que pedir la agenda.
    location: event.isPublic ? event.location : null,
    description: event.isPublic ? event.description : null,
    isPublic: event.isPublic,
    source: event.source,
    maxAttendees: event.isPublic ? event.maxAttendees : null,
    group: event.group
      ? { id: event.group.id, name: event.group.name, category: null }
      : null,
  }
}

export function serializeHoliday(row: { id: string; date: Date; name: string | null }) {
  return {
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    name: row.name,
  }
}

export function serializeNews(post: {
  id: string
  title: string
  content: string
  priority: string
  publishedAt: Date | null
  createdAt: Date
}) {
  return {
    id: post.id,
    title: post.title,
    content: post.content,
    priority: post.priority,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
  }
}

export async function listTeams() {
  const teams = await prisma.group.findMany({
    orderBy: { name: 'asc' },
    include: {
      memberships: { select: { role: true } },
    },
  })
  return teams.map((t) => ({
    ...serializeTeamSummary(t, true),
    schedules: [] as never[],
  }))
}

export async function getTeamById(id: string) {
  if (!isCuid(id)) return null
  const team = await prisma.group.findUnique({
    where: { id },
    include: {
      memberships: { select: { role: true } },
    },
  })
  if (!team) return null
  return {
    ...serializeTeamSummary(team, true),
    schedules: [] as never[],
  }
}

export async function listEvents(params: {
  groupId?: string
  type?: string
  from?: Date
  to?: Date
  status?: string
  limit: number
}) {
  if (params.groupId && !isCuid(params.groupId)) return []
  const where: Prisma.EventWhereInput = publicEventWhere({
    ...(params.groupId ? { groupId: params.groupId } : {}),
    ...(params.type ? { type: params.type } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.from || params.to
      ? {
          date: {
            ...(params.from ? { gte: params.from } : {}),
            ...(params.to ? { lte: params.to } : {}),
          },
        }
      : {}),
  })

  const events = await prisma.event.findMany({
    where,
    orderBy: { date: 'asc' },
    take: params.limit,
    include: {
      group: { select: { id: true, name: true } },
    },
  })
  return events.map(serializeEvent)
}

export async function getEventById(id: string) {
  if (!isCuid(id)) return null
  const event = await prisma.event.findFirst({
    where: publicEventWhere({ id }),
    include: {
      group: { select: { id: true, name: true } },
    },
  })
  if (!event) return null
  return serializeEvent(event)
}

export async function listHolidays(from?: Date, to?: Date) {
  const rows = await prisma.clubHoliday.findMany({
    where:
      from || to
        ? {
            date: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : undefined,
    orderBy: { date: 'asc' },
  })
  return rows.map(serializeHoliday)
}

export async function listPublishedNews(limit: number) {
  const posts = await prisma.newsPost.findMany({
    where: { isPublished: true },
    orderBy: [{ priority: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      title: true,
      content: true,
      priority: true,
      publishedAt: true,
      createdAt: true,
    },
  })
  return posts.map(serializeNews)
}

export async function getCalendarFeed(params: {
  from?: Date
  to?: Date
  groupId?: string
  limit: number
}) {
  const [events, holidays, teams] = await Promise.all([
    listEvents({ ...params, limit: params.limit }),
    listHolidays(params.from, params.to),
    prisma.group.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
      },
    }),
  ])

  return {
    events,
    holidays,
    teams: teams.map((t) => serializeTeamSummary(t, false)),
    schedules: [] as never[],
  }
}

export const API_INDEX = {
  version: '1',
  description:
    'Datos deportivos públicos: equipos, horarios, entrenamientos, partidos y noticias publicadas. Sin datos de socios, facturación ni configuración del club.',
  authentication:
    'GET: Authorization o X-API-Key. POST /api/public/v1/query: campo apiKey en el JSON (obligatorio si PUBLIC_SPORTS_API_KEY está definida).',
  endpoints: [
    {
      method: 'POST',
      path: '/api/public/v1/query',
      description: 'Para bots: cuerpo JSON obligatorio con resource (+ apiKey si aplica)',
    },
    { method: 'GET', path: '/api/public/v1/teams', description: 'Equipos y horarios fijos' },
    { method: 'GET', path: '/api/public/v1/teams/{id}', description: 'Detalle de un equipo' },
    { method: 'GET', path: '/api/public/v1/events', description: 'Actividades (query: groupId, type, from, to, status, limit)' },
    { method: 'GET', path: '/api/public/v1/events/{id}', description: 'Detalle de una actividad' },
    { method: 'GET', path: '/api/public/v1/holidays', description: 'Días sin actividad (festivos)' },
    { method: 'GET', path: '/api/public/v1/news', description: 'Noticias publicadas' },
    { method: 'GET', path: '/api/public/v1/calendar', description: 'Resumen: eventos, festivos, equipos y horarios' },
  ],
  eventTypes: PUBLIC_SPORT_EVENT_TYPES,
  excluded: [
    'Datos personales de socios (nombre, teléfono, email, DNI)',
    'Facturación, pagos y suscripciones',
    'Configuración interna del club y credenciales',
    'Asistencias, convocatorias e incidencias con identificación de personas',
  ],
}

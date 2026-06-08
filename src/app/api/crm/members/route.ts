import { NextResponse } from 'next/server'
import { createMember } from '@/app/actions'
import { createSubscription } from '@/app/actions/billing'
import { requireRoles } from '@/lib/rbac-api'
import { prisma } from '@/lib/prisma'
import { getRegistrationFieldsConfig } from '@/lib/club-settings'
import {
  mapRegistrationToMemberData,
  validateRegistrationSubmission,
  type RegistrationFieldValues,
} from '@/lib/registration-fields'
import { parseCuid } from '@/lib/db-input-validation'
import {
  fetchMemberById,
  fetchMembersPage,
  getDeporteFilterOptions,
  getMemberStatsAccurate,
  getMorosoMemberIds,
} from '@/lib/crm-member-mapper'

function parsePageParam(value: string | null, fallback = 1) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.floor(n)
}

function parsePageSizeParam(value: string | null, fallback = 50) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(100, Math.floor(n))
}

export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER', 'COACH'], request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const idParam = String(url.searchParams.get('id') || '').trim()
  if (idParam) {
    const parsedId = parseCuid(idParam, 'id')
    if (parsedId instanceof NextResponse) return parsedId
    const socio = await fetchMemberById(prisma, parsedId)
    if (!socio) {
      return NextResponse.json({ error: 'Socio no encontrado' }, { status: 404 })
    }
    const res = NextResponse.json({ socio })
    res.headers.set('Cache-Control', 'no-store')
    return res
  }

  const page = parsePageParam(url.searchParams.get('page'))
  const pageSize = parsePageSizeParam(url.searchParams.get('pageSize'))
  const q = String(url.searchParams.get('q') || '').trim()
  const estado = String(url.searchParams.get('estado') || 'Todos').trim()
  const deporte = String(url.searchParams.get('deporte') || 'Todos').trim()
  const teamIdRaw = String(url.searchParams.get('teamId') || '').trim()
  const lite = url.searchParams.get('lite') === '1'
  const withStats = url.searchParams.get('stats') === '1'

  let teamId: string | undefined
  if (teamIdRaw) {
    const parsedTeamId = parseCuid(teamIdRaw, 'teamId')
    if (parsedTeamId instanceof NextResponse) return parsedTeamId
    teamId = parsedTeamId
  }

  const morosoIds = estado !== 'Todos' || withStats ? await getMorosoMemberIds(prisma) : undefined

  const pageResult = await fetchMembersPage(prisma, {
    page,
    pageSize,
    q: q || undefined,
    estado: estado || undefined,
    deporte: deporte || undefined,
    teamId,
    morosoIds,
    lite,
  })

  const payload: Record<string, unknown> = { ...pageResult }

  if (withStats) {
    payload.stats = await getMemberStatsAccurate(prisma)
    payload.deportes = ['Todos', ...(await getDeporteFilterOptions(prisma))]
  }

  const res = NextResponse.json(payload)
  res.headers.set('Cache-Control', 'no-store')
  return res
}

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  let body: {
    registrationValues?: RegistrationFieldValues
    firstName?: string
    lastName?: string
    name?: string
    dni?: string
    email?: string
    address?: string
    sportPreference?: string
    birthDate?: string
    joinedAt?: string
    phone?: string
    planId?: string
    paymentRequiredOnEnrollment?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const config = await getRegistrationFieldsConfig()

  let values: RegistrationFieldValues = body.registrationValues || {}
  if (!body.registrationValues) {
    values = {
      firstName: String(body.firstName || '').trim(),
      lastName: String(body.lastName || '').trim(),
      phone: String(body.phone || '').trim(),
      birthDate: String(body.birthDate || '').trim(),
      dni: String(body.dni || '').trim(),
      email: String(body.email || '').trim(),
      address: String(body.address || '').trim(),
      sportPreference: String(body.sportPreference || '').trim(),
    }
    if (body.name) {
      values.firstName = String(body.name).trim()
    }
  }

  const fieldErrors = validateRegistrationSubmission(values, config)
  const firstFieldError = Object.values(fieldErrors)[0]
  if (firstFieldError) {
    return NextResponse.json({ error: firstFieldError }, { status: 400 })
  }

  const mapped = mapRegistrationToMemberData(values, config)
  if (!mapped.name) {
    return NextResponse.json(
      { error: 'Nombre y apellidos (o nombre completo) son obligatorios' },
      { status: 400 },
    )
  }

  let joined: Date | undefined
  if (body.joinedAt) {
    const d = new Date(body.joinedAt)
    if (!Number.isNaN(d.getTime())) joined = d
  }

  let member
  try {
    member = await createMember({
      name: mapped.name,
      email: mapped.email || undefined,
      phone: mapped.phone || undefined,
      dni: mapped.dni || undefined,
      address: mapped.address || undefined,
      sportPreference: mapped.sportPreference || undefined,
      guardianName: mapped.guardianName || undefined,
      guardianPhone: mapped.guardianPhone || undefined,
      registrationExtra: mapped.registrationExtra,
      birthDate: mapped.birthDate ?? undefined,
      status: 'ACTIVE',
      ...(joined !== undefined ? { joinedAt: joined } : {}),
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'No se pudo crear el socio' },
      { status: 400 },
    )
  }

  let planId = String(body.planId || '').trim()
  if (!planId) {
    const activePlans = await prisma.membershipPlan.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      take: 2,
    })
    if (activePlans.length === 1) planId = activePlans[0].id
  }

  let subscriptionWarning: string | null = null
  let subscriptionId: string | null = null
  if (planId) {
    const plan = await prisma.membershipPlan.findUnique({ where: { id: planId } })
    if (!plan || !plan.isActive) {
      subscriptionWarning =
        'Socio creado, pero el plan de cuota no es válido. Asigna la cuota en Gestión de cuotas.'
    } else {
      try {
        const paymentRequiredOnEnrollment =
          typeof body.paymentRequiredOnEnrollment === 'boolean'
            ? body.paymentRequiredOnEnrollment
            : plan.paymentRequiredOnEnrollment
        const subscription = await createSubscription({
          memberId: member.id,
          planId,
          paymentRequiredOnEnrollment,
        })
        subscriptionId = subscription.id
      } catch (e) {
        subscriptionWarning =
          e instanceof Error
            ? `Socio creado, pero no se pudo asignar la cuota: ${e.message}`
            : 'Socio creado, pero no se pudo asignar la cuota.'
      }
    }
  } else {
    const activeCount = await prisma.membershipPlan.count({ where: { isActive: true } })
    if (activeCount > 0) {
      subscriptionWarning =
        'Socio creado sin cuota asignada. Elige un plan al dar de alta o asígnalo en Gestión de cuotas para que aparezca el pago en Mis pagos.'
    } else {
      subscriptionWarning =
        'Socio creado. Crea un plan en Gestión de cuotas y asígnalo al socio para generar el primer cobro.'
    }
  }

  const portalEmail = member.email?.trim().toLowerCase() || ''
  const hasEmail = !!portalEmail
  const defaultPasswordRaw = process.env.MEMBER_DEFAULT_PASSWORD || '12345678'
  const warnings = [hasEmail ? null : 'El socio no tiene email válido; no se creó usuario de portal.', subscriptionWarning].filter(
    Boolean,
  )
  return NextResponse.json({
    ok: true,
    id: member.id,
    subscriptionId,
    memberAccount: hasEmail
      ? {
          email: portalEmail,
          role: 'MEMBER',
          defaultPassword: defaultPasswordRaw,
        }
      : null,
    warning: warnings.length ? warnings.join(' ') : null,
  })
}

import { NextResponse } from 'next/server'
import { createMember } from '@/app/actions'
import { createSubscription } from '@/app/actions/billing'
import { requireRoles } from '@/lib/rbac-api'
import { memberIsDelinquentForCrm } from '@/lib/invoice-display'
import { prisma } from '@/lib/prisma'
import { getRegistrationFieldsConfig } from '@/lib/club-settings'
import {
  mapRegistrationToMemberData,
  validateRegistrationSubmission,
  type RegistrationFieldValues,
} from '@/lib/registration-fields'

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 3)
}

export async function GET() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const { prisma } = await import('@/lib/prisma')
  const membersRaw = await prisma.member.findMany({
    orderBy: { name: 'asc' },
    include: {
      subscriptions: {
        where: { status: 'ACTIVE' },
        include: { plan: true },
        take: 1,
        orderBy: { createdAt: 'desc' },
      },
      teamRoles: {
        include: { team: true },
        take: 3,
      },
    },
  })
  const invoicesRaw = await prisma.invoice.findMany({
    include: { member: true },
    orderBy: { dueDate: 'desc' },
    take: 300,
  })

  const socios = membersRaw.map((m) => {
    const sub = m.subscriptions[0]
    const team = m.teamRoles[0]?.team
    const unpaid = invoicesRaw.find(
      (inv) =>
        inv.memberId === m.id &&
        inv.status !== 'PAID' &&
        inv.status !== 'VOID' &&
        Math.max(0, inv.totalAmount - inv.paidAmount) > 0,
    )
    const memberInvoices = invoicesRaw.filter((inv) => inv.memberId === m.id)
    const isMoroso = memberIsDelinquentForCrm(memberInvoices)

    return {
      id: m.id,
      nombre: m.name,
      email: m.email || '',
      telefono: m.phone ?? '',
      dni: m.dni ?? '',
      domicilio: m.address ?? '',
      deporteInscripcion: m.sportPreference ?? '',
      equipoNombre: team?.name ?? '',
      fechaAlta: m.joinedAt.toISOString().slice(0, 10),
      deporte: m.sportPreference?.trim() || team?.name || 'Club',
      categoria: team?.category ?? '—',
      estado: isMoroso
        ? 'Moroso'
        : m.status === 'PENDING_PAYMENT'
          ? 'Alta pendiente de pago'
          : m.status === 'ACTIVE'
            ? 'Activo'
            : m.status === 'PAUSED'
              ? 'En pausa'
              : m.status === 'LEAD'
                ? 'Lead'
                : 'Inactivo',
      cuota: sub?.plan?.amount ?? 0,
      vencimiento: sub?.nextInvoiceDate
        ? sub.nextInvoiceDate.toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      avatar: initials(m.name),
      pendingInvoiceId: unpaid?.id ?? null,
      pendingInvoiceAmount: unpaid ? Math.max(0, unpaid.totalAmount - unpaid.paidAmount) : null,
      membershipPlanName: sub?.plan?.name ?? '',
    }
  })

  const res = NextResponse.json({ socios })
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

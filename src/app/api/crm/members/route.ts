import { NextResponse } from 'next/server'
import { createMember } from '@/app/actions'
import { requireRoles } from '@/lib/rbac-api'
import { memberIsDelinquentForCrm } from '@/lib/invoice-display'

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
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const first = String(body.firstName || '').trim()
  const last = String(body.lastName || '').trim()
  const fullNameDirect = String(body.name || '').trim()

  const combined =
    fullNameDirect ||
    ([first, last].filter(Boolean).join(' ').trim() || '')
  const phone = String(body.phone || '').trim()

  if (!combined) {
    return NextResponse.json(
      { error: 'Nombre y apellidos (o nombre completo) son obligatorios' },
      { status: 400 },
    )
  }
  if (!phone) {
    return NextResponse.json({ error: 'El teléfono es obligatorio' }, { status: 400 })
  }
  const birthDateRaw = String(body.birthDate || '').trim()
  if (!birthDateRaw) {
    return NextResponse.json({ error: 'La fecha de nacimiento es obligatoria' }, { status: 400 })
  }
  const birthDate = new Date(birthDateRaw)
  if (Number.isNaN(birthDate.getTime())) {
    return NextResponse.json({ error: 'Fecha de nacimiento inválida' }, { status: 400 })
  }

  let joined: Date | undefined
  if (body.joinedAt) {
    const d = new Date(body.joinedAt)
    if (!Number.isNaN(d.getTime())) joined = d
  }

  let member
  try {
    member = await createMember({
      name: combined,
      email: body.email?.trim() || undefined,
      phone,
      dni: body.dni?.trim() || undefined,
      address: body.address?.trim() || undefined,
      sportPreference: body.sportPreference?.trim() || undefined,
      birthDate,
      status: 'ACTIVE',
      ...(joined !== undefined ? { joinedAt: joined } : {}),
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'No se pudo crear el socio' },
      { status: 400 },
    )
  }
  const portalEmail = member.email?.trim().toLowerCase() || ''
  const hasEmail = !!portalEmail
  const defaultPasswordRaw = process.env.MEMBER_DEFAULT_PASSWORD || '12345678'
  return NextResponse.json({
    ok: true,
    id: member.id,
    memberAccount: hasEmail
      ? {
          email: portalEmail,
          role: 'MEMBER',
          defaultPassword: defaultPasswordRaw,
        }
      : null,
    warning: hasEmail ? null : 'El socio no tiene email válido; no se creó usuario de portal.',
  })
}

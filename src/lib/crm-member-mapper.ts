import type { PrismaClient } from '@/generated/prisma/client'
import {
  memberIsDelinquentForCrm,
  startOfDay,
  type InvoiceLike,
} from '@/lib/invoice-display'

type MemberWithRelations = {
  id: string
  name: string
  email: string | null
  phone: string | null
  dni: string | null
  address: string | null
  sportPreference: string | null
  status: string
  joinedAt: Date
  subscriptions: Array<{
    plan: { amount: number; name: string } | null
    nextInvoiceDate: Date | null
  }>
  teamRoles: Array<{
    team: { name: string; category: string | null } | null
  }>
}

export type CrmSocioRow = {
  id: string
  nombre: string
  email: string
  telefono: string
  dni: string
  domicilio: string
  deporteInscripcion: string
  equipoNombre: string
  fechaAlta: string
  deporte: string
  categoria: string
  estado: string
  cuota: number
  vencimiento: string
  avatar: string
  pendingInvoiceId: string | null
  pendingInvoiceAmount: number | null
  membershipPlanName: string
}

export function memberInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 3)
}

export function mapMemberToSocioRow(
  m: MemberWithRelations,
  memberInvoices: InvoiceLike[],
  unpaidInvoice?: { id: string; pending: number } | null,
): CrmSocioRow {
  const sub = m.subscriptions[0]
  const team = m.teamRoles[0]?.team
  const isMoroso = memberIsDelinquentForCrm(memberInvoices)
  let estado: string
  if (isMoroso) estado = 'Moroso'
  else if (m.status === 'PENDING_PAYMENT') estado = 'Alta pendiente de pago'
  else if (m.status === 'ACTIVE') estado = 'Activo'
  else if (m.status === 'PAUSED') estado = 'En pausa'
  else if (m.status === 'LEAD') estado = 'Lead'
  else estado = 'Inactivo'

  const deporteMostrar = m.sportPreference?.trim() || team?.name || 'Club'

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
    deporte: deporteMostrar,
    categoria: team?.category ?? '—',
    estado,
    cuota: sub?.plan?.amount ?? 0,
    vencimiento: sub?.nextInvoiceDate
      ? sub.nextInvoiceDate.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    avatar: memberInitials(m.name),
    pendingInvoiceId: unpaidInvoice?.id ?? null,
    pendingInvoiceAmount: unpaidInvoice?.pending ?? null,
    membershipPlanName: sub?.plan?.name ?? '',
  }
}

export function mapMemberToSocioLite(m: {
  id: string
  name: string
  email: string | null
  status: string
}) {
  return {
    id: m.id,
    nombre: m.name,
    email: m.email || '',
    avatar: memberInitials(m.name),
    estado:
      m.status === 'ACTIVE'
        ? 'Activo'
        : m.status === 'INACTIVE'
          ? 'Inactivo'
          : m.status,
  }
}

export async function getMorosoMemberIds(
  prisma: PrismaClient,
  today = new Date(),
): Promise<Set<string>> {
  const t = startOfDay(today)
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { notIn: ['PAID', 'VOID'] },
      OR: [{ status: 'OVERDUE' }, { dueDate: { lt: t } }],
    },
    select: {
      memberId: true,
      status: true,
      dueDate: true,
      totalAmount: true,
      paidAmount: true,
    },
  })
  const ids = new Set<string>()
  for (const inv of invoices) {
    if (memberIsDelinquentForCrm([inv], today)) ids.add(inv.memberId)
  }
  return ids
}

export async function getMemberStatsAccurate(prisma: PrismaClient, today = new Date()) {
  const morosoIds = await getMorosoMemberIds(prisma, today)
  const [total, activeMembers] = await Promise.all([
    prisma.member.count(),
    prisma.member.count({ where: { status: 'ACTIVE' } }),
  ])
  const morososActive = await prisma.member.count({
    where: { status: 'ACTIVE', id: { in: [...morosoIds] } },
  })
  const activos = Math.max(0, activeMembers - morososActive)
  const activeSubs = await prisma.subscription.findMany({
    where: { status: 'ACTIVE' },
    include: { plan: { select: { amount: true } } },
  })
  const cuotaPromedio =
    total > 0 && activeSubs.length > 0
      ? activeSubs.reduce((a, s) => a + Number(s.plan?.amount ?? 0), 0) / activeSubs.length
      : 0

  return {
    total,
    activos,
    morosos: morosoIds.size,
    cuotaPromedio: Number(cuotaPromedio.toFixed(2)),
  }
}

export async function getDeporteFilterOptions(prisma: PrismaClient): Promise<string[]> {
  const [teams, sports] = await Promise.all([
    prisma.team.findMany({ select: { name: true }, orderBy: { name: 'asc' } }),
    prisma.member.findMany({
      where: { sportPreference: { not: null } },
      select: { sportPreference: true },
      distinct: ['sportPreference'],
      orderBy: { sportPreference: 'asc' },
    }),
  ])
  const set = new Set<string>()
  for (const t of teams) if (t.name?.trim()) set.add(t.name.trim())
  for (const s of sports) if (s.sportPreference?.trim()) set.add(s.sportPreference.trim())
  set.add('Club')
  return [...set].sort((a, b) => a.localeCompare(b, 'es'))
}

const memberInclude = {
  subscriptions: {
    where: { status: 'ACTIVE' as const },
    include: { plan: true },
    take: 1,
    orderBy: { createdAt: 'desc' as const },
  },
  teamRoles: {
    include: { team: true },
    take: 3,
  },
} as const

export async function fetchMembersPage(
  prisma: PrismaClient,
  opts: {
    page: number
    pageSize: number
    q?: string
    estado?: string
    deporte?: string
    teamId?: string
    morosoIds?: Set<string>
    lite?: boolean
  },
) {
  const { page, pageSize, q, estado, deporte, teamId, morosoIds, lite } = opts
  const where: Record<string, unknown> = {}

  if (q?.trim()) {
    const term = q.trim()
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { email: { contains: term, mode: 'insensitive' } },
      { phone: { contains: term, mode: 'insensitive' } },
      { dni: { contains: term, mode: 'insensitive' } },
    ]
  }

  if (teamId) {
    where.teamRoles = { some: { teamId } }
  }

  if (deporte && deporte !== 'Todos') {
    const deporteWhere = {
      OR: [
        { sportPreference: { equals: deporte, mode: 'insensitive' } },
        { teamRoles: { some: { team: { name: deporte } } } },
      ],
    }
    if (deporte === 'Club') {
      Object.assign(where, {
        AND: [
          { OR: [{ sportPreference: null }, { sportPreference: '' }] },
          { teamRoles: { none: {} } },
        ],
      })
    } else {
      Object.assign(where, deporteWhere)
    }
  }

  if (estado && estado !== 'Todos' && morosoIds) {
    if (estado === 'Moroso') {
      where.id = { in: [...morosoIds] }
    } else if (estado === 'Activo') {
      where.status = 'ACTIVE'
      where.id = { notIn: [...morosoIds] }
    } else if (estado === 'Inactivo') {
      where.status = { in: ['INACTIVE', 'PAUSED', 'LEAD'] }
    }
  }

  const total = await prisma.member.count({ where })

  if (lite) {
    const rows = await prisma.member.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, name: true, email: true, status: true },
    })
    return {
      socios: rows.map(mapMemberToSocioLite),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    }
  }

  const membersRaw = await prisma.member.findMany({
    where,
    orderBy: { name: 'asc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: memberInclude,
  })

  const memberIds = membersRaw.map((m) => m.id)
  const invoicesRaw =
    memberIds.length > 0
      ? await prisma.invoice.findMany({
          where: { memberId: { in: memberIds } },
          orderBy: { dueDate: 'desc' },
        })
      : []

  const socios = membersRaw.map((m) => {
    const memberInvoices = invoicesRaw.filter((inv) => inv.memberId === m.id)
    const unpaid = memberInvoices.find(
      (inv) =>
        inv.status !== 'PAID' &&
        inv.status !== 'VOID' &&
        Math.max(0, inv.totalAmount - inv.paidAmount) > 0,
    )
    const pendingInvoice = unpaid
      ? { id: unpaid.id, pending: Math.max(0, unpaid.totalAmount - unpaid.paidAmount) }
      : null
    return mapMemberToSocioRow(m, memberInvoices, pendingInvoice)
  })

  return {
    socios,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function fetchMemberById(prisma: PrismaClient, id: string) {
  const m = await prisma.member.findUnique({
    where: { id },
    include: memberInclude,
  })
  if (!m) return null
  const invoicesRaw = await prisma.invoice.findMany({
    where: { memberId: id },
    orderBy: { dueDate: 'desc' },
  })
  const unpaid = invoicesRaw.find(
    (inv) =>
      inv.status !== 'PAID' &&
      inv.status !== 'VOID' &&
      Math.max(0, inv.totalAmount - inv.paidAmount) > 0,
  )
  const pendingInvoice = unpaid
    ? { id: unpaid.id, pending: Math.max(0, unpaid.totalAmount - unpaid.paidAmount) }
    : null
  return mapMemberToSocioRow(m, invoicesRaw, pendingInvoice)
}

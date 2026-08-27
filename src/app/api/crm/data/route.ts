import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTaxConfig } from '@/lib/tax-config'
import { requireRoles } from '@/lib/rbac-api'
import { ROLE_LABEL, normalizeRole } from '@/lib/rbac'
import { getClubBranding, getRegistrationFieldsConfig } from '@/lib/club-settings'
import { crmInvoiceEstado, isInvoicePastDue } from '@/lib/invoice-display'
import { isEnvFixedAdminEmail } from '@/lib/env-admin'
import { getMemberStatsAccurate } from '@/lib/crm-member-mapper'
import { currentTenant } from '@/lib/multitenant/context'
import { getTenantFeatures } from '@/lib/tenant-features'

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

function mapInvoiceEstado(
  inv: { status: string; dueDate: Date; totalAmount: number; paidAmount: number },
) {
  return crmInvoiceEstado(inv)
}

const TYPE_LABEL: Record<string, string> = {
  TRAINING: 'Entrenamiento',
  MATCH: 'Partido',
  TOURNAMENT: 'Torneo',
  SOCIAL: 'Reunión',
  OTHER: 'Otro',
}

export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN', 'COACH', 'TREASURER'], request)
  if (!auth.ok) return auth.response
  const role = auth.role
  const sessionUser = auth.session.user as { memberId?: string | null; name?: string | null; email?: string | null; role?: string }
  const sessionMemberId = sessionUser.memberId || null
  const canUseAccounting = role === 'ADMIN' || role === 'TREASURER'
  const canManageWorkflows = role === 'ADMIN'
  const canManagePeople = role === 'ADMIN' || role === 'COACH'

  let coachTeamIds: string[] = []
  if (role === 'COACH' && sessionMemberId) {
    const coachTeams = await prisma.groupMembership.findMany({
      where: { memberId: sessionMemberId, role: 'COACH' },
      select: { groupId: true },
    })
    coachTeamIds = coachTeams.map((t) => t.groupId)
  }

  const now = new Date()
  const year = now.getFullYear()
  const startYear = new Date(year, 0, 1)
  const endYear = new Date(year + 1, 0, 1)
  const monthStart = new Date(year, now.getMonth(), 1)
  const monthEnd = new Date(year, now.getMonth() + 1, 0, 23, 59, 59, 999)

  const [
    memberStats,
    teamsRaw,
    invoicesRaw,
    eventsRaw,
    workflowsRaw,
    incomeTxYearRaw,
    expenseTxYear,
    incomeTxMonthRaw,
    reportTxRaw,
    taxConfig,
    usersRaw,
    newsRaw,
    clubBranding,
    registrationFieldsConfig,
    clubHolidaysRaw,
  ] = await Promise.all([
    getMemberStatsAccurate(prisma),
    prisma.group.findMany({
      where: role === 'COACH' ? { id: { in: coachTeamIds } } : {},
      orderBy: { name: 'asc' },
      include: {
        memberships: {
          include: { member: true },
        },
      },
    }),
    prisma.invoice.findMany({
      where: canUseAccounting ? {} : { id: '__none__' },
      include: {
        member: true,
        items: { take: 1 },
      },
      orderBy: { dueDate: 'desc' },
      take: 120,
    }),
    prisma.event.findMany({
      where: {
        date: { gte: new Date(year, now.getMonth() - 1, 1) },
        ...(role === 'COACH' ? { groupId: { in: coachTeamIds } } : {}),
      },
      include: { group: true },
      orderBy: { date: 'asc' },
      take: 80,
    }),
    prisma.workflow.findMany({
      where: canManageWorkflows ? {} : { id: '__none__' },
      include: { steps: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.transaction.findMany({
      where: canUseAccounting
        ? {
        type: 'INCOME',
        date: { gte: startYear, lt: endYear },
          }
        : { id: '__none__' },
      select: {
        amount: true,
        date: true,
        source: true,
        invoiceId: true,
        invoice: { select: { kind: true } },
      },
    }),
    prisma.transaction.findMany({
      where: canUseAccounting
        ? {
        type: 'EXPENSE',
        date: { gte: startYear, lt: endYear },
          }
        : { id: '__none__' },
      select: { amount: true, date: true },
    }),
    prisma.transaction.findMany({
      where: canUseAccounting
        ? {
        type: 'INCOME',
        date: { gte: monthStart, lte: monthEnd },
          }
        : { id: '__none__' },
      select: {
        amount: true,
        source: true,
        invoiceId: true,
      },
    }),
    prisma.transaction.findMany({
      where: canUseAccounting ? {} : { id: '__none__' },
      orderBy: { date: 'asc' },
      select: {
        amount: true,
        date: true,
        type: true,
        source: true,
        description: true,
        invoice: { select: { kind: true } },
      },
    }),
    getTaxConfig(),
    role === 'ADMIN'
      ? prisma.user.findMany({
          orderBy: { email: 'asc' },
          include: { member: { select: { id: true, name: true, email: true } } },
          take: 500,
        })
      : Promise.resolve([]),
    role === 'ADMIN'
      ? prisma.newsPost.findMany({
          orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
          include: { author: { select: { id: true, name: true, email: true } } },
          take: 150,
        })
      : Promise.resolve([]),
    getClubBranding(),
    getRegistrationFieldsConfig(),
    prisma.clubHoliday.findMany({ orderBy: { date: 'asc' } }),
  ])

  // TODAS las facturas sin pagar del club, sin el tope de 120 de la lista. Es la
  // única fuente de «lo que nos deben»: Sumario, Impagos e Informes leen de aquí
  // para que las tres pantallas den la misma cifra.
  const deudaRaw = canUseAccounting
    ? await prisma.invoice.findMany({
        where: { status: { notIn: ['PAID', 'VOID'] } },
        select: { totalAmount: true, paidAmount: true, dueDate: true },
      })
    : []
  const hoyCorte = new Date()
  hoyCorte.setHours(0, 0, 0, 0)
  const deudaAbierta = deudaRaw
    .map((i) => ({ pendiente: Math.max(0, i.totalAmount - i.paidAmount), dueDate: i.dueDate }))
    .filter((i) => i.pendiente > 0)
  const deudaTotalClub = deudaAbierta.reduce((a, i) => a + i.pendiente, 0)
  const deudaVencidaClub = deudaAbierta
    .filter((i) => new Date(i.dueDate) < hoyCorte)
    .reduce((a, i) => a + i.pendiente, 0)
  const facturasAbiertasClub = deudaAbierta.length
  const facturasVencidasClub = deudaAbierta.filter((i) => new Date(i.dueDate) < hoyCorte).length

  const pendingInvoicesAll = invoicesRaw.filter(
    (inv) =>
      inv.status !== 'PAID' &&
      inv.status !== 'VOID' &&
      Math.max(0, inv.totalAmount - inv.paidAmount) > 0,
  )


  const incomeTxYear = incomeTxYearRaw
  const incomeTxMonth = incomeTxMonthRaw

  const ingresoMesSum = incomeTxMonth.reduce((a, t) => a + t.amount, 0)

  const currency = invoicesRaw[0]?.currency ?? 'EUR'

  const ingresosMensual: number[] = Array(12).fill(0)
  for (const t of incomeTxYear) {
    const m = new Date(t.date).getMonth()
    ingresosMensual[m] += t.amount
  }

  const egresoMensual: number[] = Array(12).fill(0)
  for (const t of expenseTxYear) {
    const m = new Date(t.date).getMonth()
    egresoMensual[m] += t.amount
  }

  const conceptTotals = new Map<string, number>()
  for (const t of incomeTxYear) {
    let label = 'Otros'
    if (t.invoice?.kind === 'MEMBERSHIP') label = 'Cuotas mensuales'
    else if (t.invoice?.kind === 'OTHER') label = 'Cobros adicionales'
    // Histórico: las filas antiguas se etiquetaron con la pasarela anterior.
    else if (t.source === 'STRIPE' || t.source === 'WHOP') label = 'Cobros online'
    else if (t.source === 'BANK_TRANSFER') label = 'Transferencias'
    else if (t.source === 'CASH') label = 'Efectivo'
    else if (t.source === 'MANUAL') label = 'Manual'

    conceptTotals.set(label, (conceptTotals.get(label) ?? 0) + t.amount)
  }

  const conceptPalette = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#06B6D4', '#EF4444']
  const ingresosPorConcepto = Array.from(conceptTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({
      label,
      value,
      color: conceptPalette[i % conceptPalette.length],
    }))

  const teamLabels: { label: string; value: number; color: string }[] =
    teamsRaw.length > 0
      ? teamsRaw.slice(0, 8).map((t, i) => {
          const hues = ['#3B82F6', '#10B981', '#06B6D4', '#F59E0B', '#8B5CF6', '#EF4444']
          return {
            label: t.name,
            value: t.memberships.length,
            color: hues[i % hues.length],
          }
        })
      : [{ label: 'Sin equipos', value: memberStats.activos || 1, color: '#3B82F6' }]

  const equipos = teamsRaw.map((t) => {
    const coachTm = t.memberships.find((tm) => tm.role === 'COACH')
    return {
      id: t.id,
      nombre: t.name,
      deporte: t.name,
      categoria: '—',
      categoriaDb: '',
      jugadores:
        t.memberships.filter((m) => m.role === 'PLAYER').length || t.memberships.length,
      entrenador: coachTm?.member?.name ?? '—',
      coachMemberId: coachTm?.memberId ?? null,
      horario: '',
      horarios: [] as {
        id: string
        weekday: number
        startTime: string
        durationMinutes: number
        title: string | null
        location: string | null
      }[],
      seasonStartDate: '',
      seasonEndDate: '',
      color: '#3B82F6',
      logo: '🏐',
      miembros: t.memberships.map((tm) => ({
        teamMemberId: tm.id,
        memberId: tm.memberId,
        nombre: tm.member.name,
        role: tm.role,
      })),
    }
  })

  const cobros = invoicesRaw.map((inv) => ({
    tipoFactura: inv.kind,
    numero: inv.invoiceNumber,
    subtotal: inv.subtotal,
    iva: inv.taxAmount,
    retencion: Math.max(0, (inv.subtotal + inv.taxAmount) - inv.totalAmount),
    id: inv.id,
    socio: inv.member.name,
    memberId: inv.memberId,
    concepto: inv.items[0]?.description ?? `Factura ${inv.invoiceNumber}`,
    monto: inv.totalAmount,
    estado: mapInvoiceEstado(inv),
    registro: inv.createdAt.toISOString().slice(0, 10),
    vencimiento: inv.dueDate.toISOString().slice(0, 10),
    deporte: inv.member.sportPreference?.trim() || '—',
    pendingAmount: Math.max(0, inv.totalAmount - inv.paidAmount),
    // Para reclamar sin salir de Impagos: a quien se llama y desde cuando debe.
    telefono: inv.member.phone?.trim() || inv.member.guardianPhone?.trim() || '',
    esTelefonoTutor: !inv.member.phone?.trim() && Boolean(inv.member.guardianPhone?.trim()),
  }))

  const eventos = eventsRaw.map((e) => ({
    id: e.id,
    titulo: e.title,
    fecha: e.date.toISOString().slice(0, 10),
    hora: `${String(e.date.getHours()).padStart(2, '0')}:${String(e.date.getMinutes()).padStart(2, '0')}`,
    // Instante completo (UTC) para reconstruir el datetime en la ZONA DEL CLIENTE al
    // editar, evitando el desfase de mezclar fecha-UTC con hora-del-servidor.
    dateIso: e.date.toISOString(),
    tipo: TYPE_LABEL[e.type] ?? e.type,
    typeCode: e.type,
    groupId: e.groupId ?? '',
    equipo: e.group?.name ?? 'Club',
    lugar: e.location ?? '—',
    location: e.location ?? '',
    description: e.description ?? '',
  }))

  const workflows = workflowsRaw.map((w) => {
    const sortedSteps = [...w.steps].sort((a, b) => a.position - b.position)
    const step = sortedSteps[0]
    return {
      id: w.id,
      nombre: w.name,
      descripcion: w.description ?? '',
      trigger: w.triggerType,
      triggerConfig: w.triggerConfig ?? null,
      accion: step ? `${step.stepType}: ${step.actionType}` : '—',
      activo: w.isActive,
      ejecuciones: 0,
      ultima: '—',
      pasos: sortedSteps.map((s) => ({
        id: s.id,
        position: s.position,
        stepType: s.stepType,
        actionType: s.actionType,
        config: s.config ?? {},
      })),
    }
  })

  const totalIngresosAnuales = ingresosMensual.reduce((a, b) => a + b, 0)
  const totalEgresosAnuales = egresoMensual.reduce((a, b) => a + b, 0)

  const displayName = sessionUser.name?.trim() || sessionUser.email || 'Administrador'
  const currentRole = normalizeRole(sessionUser.role)
  const users = usersRaw.map((usr) => {
    const mappedRole = normalizeRole(usr.role)
    return {
      id: usr.id,
      name: usr.name || '',
      email: usr.email || '',
      role: mappedRole,
      roleLabel: ROLE_LABEL[mappedRole],
      memberId: usr.memberId || null,
      memberName: usr.member?.name || '',
      isEnvFixedAdmin: isEnvFixedAdminEmail(usr.email),
    }
  }).filter((u) => u.role !== 'MEMBER')
  const newsPosts = newsRaw.map((post) => ({
    id: post.id,
    title: post.title,
    content: post.content,
    priority: post.priority,
    isPublished: post.isPublished,
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    createdAt: post.createdAt.toISOString(),
    authorName: post.author?.name || post.author?.email || '',
  }))

  // Feature flags del club (qué módulos tiene activados su plan). El CRM oculta
  // las secciones de los módulos apagados. Se lee de la BD del portal (cacheado).
  const features = await getTenantFeatures(currentTenant()?.slug)

  const res = NextResponse.json({
    features,
    user: {
      name: displayName,
      email: sessionUser.email ?? '',
      role: currentRole,
      initials: initials(displayName),
    },
    club: {
      name: clubBranding.name,
      logoUrl: clubBranding.logoUrl,
      primaryColor: clubBranding.primaryColor,
      website: clubBranding.website,
      subtitle: clubBranding.subtitle,
      registrationFields: registrationFieldsConfig,
    },
    currency,
    kpis: {
      sociosActivos: memberStats.activos,
      sociosTotal: memberStats.total,
      sociosMorosos: memberStats.morosos,
      cobrosPendientes: facturasAbiertasClub,
      cobrosPendientesMonto: deudaTotalClub,
      /** Solo lo ya vencido: es la cifra que sale en Impagos. */
      deudaVencidaMonto: deudaVencidaClub,
      facturasVencidas: facturasVencidasClub,
      ingresosMes: ingresoMesSum,
    },
    ingresosMensual,
    egresoMensual,
    ingresosPorConcepto,
    reportTransactions: reportTxRaw.map((t) => ({
      amount: t.amount,
      date: t.date.toISOString().slice(0, 10),
      type: t.type,
      source: t.source,
      // Sin el concepto, el CSV de movimientos salía con fecha, importe y poco
      // más: ilegible para llevarlo a una asamblea.
      description: t.description,
      invoiceKind: t.invoice?.kind ?? null,
    })),
    sociosPorDeporte: teamLabels,
    equipos,
    festivos: clubHolidaysRaw.map((h) => ({
      id: h.id,
      date: h.date.toISOString().slice(0, 10),
      name: h.name ?? '',
    })),
    cobros,
    eventos,
    workflows,
    meta: {
      today: now.toISOString(),
    },
    taxConfig: {
      vatRateIncome: taxConfig.vatRateIncome,
      vatRateExpense: taxConfig.vatRateExpense,
      withholdRateIncome: taxConfig.withholdRateIncome,
      withholdRateExpense: taxConfig.withholdRateExpense,
      applyOnInvoices: taxConfig.applyOnInvoices,
      applyOnIncome: taxConfig.applyOnIncome,
      applyOnExpense: taxConfig.applyOnExpense,
      applyWithholdOnInvoices: taxConfig.applyWithholdOnInvoices,
      applyWithholdOnIncome: taxConfig.applyWithholdOnIncome,
      applyWithholdOnExpense: taxConfig.applyWithholdOnExpense,
    },
    users,
    newsPosts,
  })
  res.headers.set('Cache-Control', 'no-store')
  return res
}

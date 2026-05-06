import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTaxConfig } from '@/lib/tax-config'

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

function mapInvoiceEstado(status: string): 'Pagado' | 'Pendiente' | 'Vencido' {
  if (status === 'PAID') return 'Pagado'
  if (status === 'OVERDUE') return 'Vencido'
  return 'Pendiente'
}

const TYPE_LABEL: Record<string, string> = {
  TRAINING: 'Entrenamiento',
  MATCH: 'Partido',
  TOURNAMENT: 'Torneo',
  SOCIAL: 'Reunión',
  OTHER: 'Otro',
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const year = now.getFullYear()
  const startYear = new Date(year, 0, 1)
  const endYear = new Date(year + 1, 0, 1)
  const monthStart = new Date(year, now.getMonth(), 1)
  const monthEnd = new Date(year, now.getMonth() + 1, 0, 23, 59, 59, 999)

  const [
    membersRaw,
    teamsRaw,
    invoicesRaw,
    eventsRaw,
    workflowsRaw,
    incomeTxYearRaw,
    expenseTxYear,
    incomeTxMonthRaw,
    reportTxRaw,
    taxConfig,
  ] = await Promise.all([
    prisma.member.findMany({
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
        invoices: {
          where: { status: { in: ['OVERDUE'] } },
          select: { id: true },
          take: 1,
        },
      },
    }),
    prisma.team.findMany({
      orderBy: { name: 'asc' },
      include: {
        members: {
          include: { member: true },
        },
      },
    }),
    prisma.invoice.findMany({
      include: {
        member: true,
        items: { take: 1 },
      },
      orderBy: { dueDate: 'desc' },
      take: 120,
    }),
    prisma.event.findMany({
      where: { date: { gte: new Date(year, now.getMonth() - 1, 1) } },
      include: { team: true },
      orderBy: { date: 'asc' },
      take: 80,
    }),
    prisma.workflow.findMany({
      include: { steps: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.transaction.findMany({
      where: {
        type: 'INCOME',
        date: { gte: startYear, lt: endYear },
      },
      select: {
        amount: true,
        date: true,
        source: true,
        invoiceId: true,
        invoice: { select: { kind: true } },
      },
    }),
    prisma.transaction.findMany({
      where: {
        type: 'EXPENSE',
        date: { gte: startYear, lt: endYear },
      },
      select: { amount: true, date: true },
    }),
    prisma.transaction.findMany({
      where: {
        type: 'INCOME',
        date: { gte: monthStart, lte: monthEnd },
      },
      select: {
        amount: true,
        source: true,
        invoiceId: true,
      },
    }),
    prisma.transaction.findMany({
      orderBy: { date: 'asc' },
      select: {
        amount: true,
        date: true,
        type: true,
        source: true,
        invoice: { select: { kind: true } },
      },
    }),
    getTaxConfig(),
  ])

  const pendingInvoicesAll = invoicesRaw.filter(
    (inv) =>
      inv.status !== 'PAID' &&
      inv.status !== 'VOID' &&
      Math.max(0, inv.totalAmount - inv.paidAmount) > 0,
  )

  const overdueInvoices = pendingInvoicesAll.filter((i) => i.status === 'OVERDUE')
  const pendingCount = pendingInvoicesAll.length

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
    else if (t.source === 'STRIPE') label = 'Pagos Stripe'
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
            value: t.members.length,
            color: hues[i % hues.length],
          }
        })
      : [{ label: 'Sin equipos', value: membersRaw.filter((m) => m.status === 'ACTIVE').length || 1, color: '#3B82F6' }]

  const socios = membersRaw.map((m) => {
    const sub = m.subscriptions[0]
    const team = m.teamRoles[0]?.team
    const hasOverdue = m.invoices.length > 0
    let estadoUi: string
    if (hasOverdue) estadoUi = 'Moroso'
    else if (m.status === 'ACTIVE') estadoUi = 'Activo'
    else estadoUi = 'Inactivo'

    let pendingInvoice: { id: string; pending: number } | null = null
    const unpaid = invoicesRaw.find(
      (inv) =>
        inv.memberId === m.id &&
        inv.status !== 'PAID' &&
        inv.status !== 'VOID' &&
        Math.max(0, inv.totalAmount - inv.paidAmount) > 0,
    )
    if (unpaid) {
      pendingInvoice = {
        id: unpaid.id,
        pending: Math.max(0, unpaid.totalAmount - unpaid.paidAmount),
      }
    }

    const deporteMostrar =
      m.sportPreference?.trim() || team?.name || 'Club'

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
      estado: estadoUi,
      cuota: sub?.plan?.amount ?? 0,
      vencimiento: sub?.nextInvoiceDate
        ? sub.nextInvoiceDate.toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      avatar: initials(m.name),
      pendingInvoiceId: pendingInvoice?.id ?? null,
      pendingInvoiceAmount: pendingInvoice?.pending ?? null,
      membershipPlanName: sub?.plan?.name ?? '',
    }
  })

  const socioActivosCount = membersRaw.filter((m) => m.status === 'ACTIVE').length

  const equipos = teamsRaw.map((t) => {
    const coachTm = t.members.find((tm) => tm.role === 'COACH')
    return {
      id: t.id,
      nombre: t.name,
      deporte: t.name,
      categoria: t.category ?? '—',
      categoriaDb: t.category ?? '',
      jugadores:
        t.members.filter((m) => m.role === 'PLAYER').length || t.members.length,
      entrenador: coachTm?.member?.name ?? '—',
      coachMemberId: coachTm?.memberId ?? null,
      horario: '—',
      color: '#3B82F6',
      logo: '🏐',
      miembros: t.members.map((tm) => ({
        teamMemberId: tm.id,
        memberId: tm.memberId,
        nombre: tm.member.name,
        role: tm.role,
      })),
    }
  })

  const cobros = invoicesRaw.map((inv) => ({
    id: inv.id,
    socio: inv.member.name,
    memberId: inv.memberId,
    concepto: inv.items[0]?.description ?? `Factura ${inv.invoiceNumber}`,
    monto: inv.totalAmount,
    estado: mapInvoiceEstado(inv.status),
    registro: inv.createdAt.toISOString().slice(0, 10),
    vencimiento: inv.dueDate.toISOString().slice(0, 10),
    deporte: socios.find((s) => s.id === inv.memberId)?.deporte ?? '—',
    pendingAmount: Math.max(0, inv.totalAmount - inv.paidAmount),
  }))

  const eventos = eventsRaw.map((e) => ({
    id: e.id,
    titulo: e.title,
    fecha: e.date.toISOString().slice(0, 10),
    hora: `${String(e.date.getHours()).padStart(2, '0')}:${String(e.date.getMinutes()).padStart(2, '0')}`,
    tipo: TYPE_LABEL[e.type] ?? e.type,
    equipo: e.team?.name ?? 'Club',
    lugar: e.location ?? '—',
  }))

  const workflows = workflowsRaw.map((w) => {
    const sortedSteps = [...w.steps].sort((a, b) => a.position - b.position)
    const step = sortedSteps[0]
    return {
      id: w.id,
      nombre: w.name,
      descripcion: w.description ?? '',
      trigger: w.triggerType,
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

  const u = session.user as { name?: string | null; email?: string | null; role?: string }
  const displayName = u.name?.trim() || u.email || 'Administrador'

  return NextResponse.json({
    user: {
      name: displayName,
      email: u.email ?? '',
      role: u.role ?? 'ADMIN',
      initials: initials(displayName),
    },
    currency,
    kpis: {
      sociosActivos: socioActivosCount,
      cobrosPendientes: pendingCount,
      cobrosPendientesMonto: pendingInvoicesAll.reduce(
        (a, i) => a + Math.max(0, i.totalAmount - i.paidAmount),
        0,
      ),
      facturasVencidas: overdueInvoices.length,
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
      invoiceKind: t.invoice?.kind ?? null,
    })),
    sociosPorDeporte: teamLabels,
    socios,
    equipos,
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
  })
}

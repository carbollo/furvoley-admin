import { prisma } from '@/lib/prisma'
import { getClubBranding } from '@/lib/club-settings'
import { isInvoicePastDue } from '@/lib/invoice-display'
import { normalizeRole } from '@/lib/rbac'
import type { Session } from 'next-auth'

export async function getMobileMe(session: Session) {
  const branding = await getClubBranding()
  const user = session.user as {
    id?: string
    name?: string | null
    email?: string | null
    role?: string
    memberId?: string | null
    mustChangePassword?: boolean
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: normalizeRole(user.role),
      memberId: user.memberId ?? null,
      mustChangePassword: user.mustChangePassword === true,
    },
    branding: {
      name: branding.name,
      logoUrl: branding.logoUrl,
      primaryColor: branding.primaryColor,
      subtitle: branding.subtitle,
    },
  }
}

export async function getMobileHome(session: Session) {
  const user = session.user as { name?: string | null; memberId?: string | null }
  const memberId = user.memberId || ''
  const userMember = memberId
    ? await prisma.member.findUnique({
        where: { id: memberId },
        include: {
          teamRoles: {
            include: {
              team: { include: { _count: { select: { members: true } } } },
            },
          },
        },
      })
    : null

  const memberInvoices = userMember
    ? await prisma.invoice.findMany({
        where: { memberId: userMember.id },
        orderBy: { issueDate: 'desc' },
        take: 5,
      })
    : []

  const allOpenInvoices = userMember
    ? await prisma.invoice.findMany({
        where: {
          memberId: userMember.id,
          status: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] },
        },
        orderBy: { dueDate: 'asc' },
      })
    : []

  const debt = allOpenInvoices.reduce((acc, i) => acc + (i.totalAmount - i.paidAmount), 0)
  const pendingInvoiceCount = allOpenInvoices.length
  const overdueCount = allOpenInvoices.filter((i) => isInvoicePastDue(i)).length

  const today = new Date()
  const nextDue = allOpenInvoices[0]?.dueDate
  let nextDueLabel: string | null = null
  if (nextDue) {
    const diffDays = Math.ceil(
      (new Date(nextDue).getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    )
    if (diffDays <= 0) nextDueLabel = 'Cuota sin pagar — puedes abonarla ahora'
    else if (diffDays === 1) nextDueLabel = 'Vence mañana'
    else if (diffDays <= 7) nextDueLabel = `Vence en ${diffDays} días`
    else nextDueLabel = `${pendingInvoiceCount} factura(s) por pagar`
  }

  const teamIds = userMember?.teamRoles.map((tr) => tr.teamId) ?? []
  const upcomingTeamEventsRaw = teamIds.length
    ? await prisma.event.findMany({
        where: { teamId: { in: teamIds }, date: { gte: new Date() } },
        include: { team: true },
        orderBy: { date: 'asc' },
        take: 4,
      })
    : []

  const newsPostsRaw = await prisma.newsPost.findMany({
    where: { isPublished: true },
    orderBy: [{ priority: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
    take: 4,
  })

  const publicEventsRaw = await prisma.event.findMany({
    where: { isPublic: true, date: { gte: new Date() } },
    orderBy: { date: 'asc' },
    take: 4,
  })

  const dateStr = today.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const firstName = String(user.name || 'Socio').trim().split(/\s+/)[0]

  return {
    firstName,
    dateStrPretty: dateStr.charAt(0).toUpperCase() + dateStr.slice(1),
    debt,
    pendingInvoiceCount,
    overdueCount,
    nextDueLabel,
    enrollmentPaymentPending: userMember?.status === 'PENDING_PAYMENT',
    teams: (userMember?.teamRoles ?? []).map((tr) => ({
      id: tr.team.id,
      name: tr.team.name,
      role: tr.role,
      memberCount: tr.team._count.members,
      category: tr.team.category,
    })),
    upcomingTeamEvents: upcomingTeamEventsRaw.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date.toISOString(),
      type: e.type,
      location: e.location,
      teamName: e.team?.name ?? null,
    })),
    news: newsPostsRaw.map((post) => ({
      id: post.id,
      title: post.title,
      content: post.content,
      priority: post.priority,
      publishedAt: post.publishedAt?.toISOString() ?? null,
      createdAt: post.createdAt.toISOString(),
    })),
    publicEvents: publicEventsRaw.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date.toISOString(),
      type: e.type,
    })),
    recentInvoices: memberInvoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      totalAmount: inv.totalAmount,
      paidAmount: inv.paidAmount,
      issueDate: inv.issueDate.toISOString(),
      dueDate: inv.dueDate.toISOString(),
      status: inv.status,
    })),
  }
}

export async function getMobileCalendar(session: Session) {
  const role = normalizeRole((session.user as { role?: string }).role)
  const memberId = (session.user as { memberId?: string | null }).memberId || ''
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0))

  if (role === 'ADMIN') {
    const events = await prisma.event.findMany({
      include: { team: true },
      orderBy: { date: 'asc' },
      where: { date: { gte: todayStart } },
    })
    return {
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        date: e.date.toISOString(),
        type: e.type,
        location: e.location,
        teamName: e.team?.name ?? null,
      })),
    }
  }

  const userMember = memberId
    ? await prisma.member.findUnique({
        where: { id: memberId },
        include: { teamRoles: true },
      })
    : null

  const teamIds = userMember?.teamRoles.map((tr) => tr.teamId) ?? []
  const events =
    teamIds.length > 0
      ? await prisma.event.findMany({
          where: { teamId: { in: teamIds }, date: { gte: todayStart } },
          include: { team: true },
          orderBy: { date: 'asc' },
        })
      : []

  return {
    events: events.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date.toISOString(),
      type: e.type,
      location: e.location,
      teamName: e.team?.name ?? null,
    })),
  }
}

export async function getMobileBilling(session: Session) {
  const memberId = (session.user as { memberId?: string | null }).memberId || ''
  const invoices = memberId
    ? await prisma.invoice.findMany({
        where: { memberId },
        orderBy: { issueDate: 'desc' },
      })
    : []

  const debt = invoices
    .filter((i) => i.status !== 'PAID' && i.status !== 'VOID')
    .reduce((acc, i) => acc + (i.totalAmount - i.paidAmount), 0)

  return {
    debt,
    invoices: invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      totalAmount: inv.totalAmount,
      paidAmount: inv.paidAmount,
      issueDate: inv.issueDate.toISOString(),
      dueDate: inv.dueDate.toISOString(),
      status: inv.status,
      pastDue: isInvoicePastDue(inv),
    })),
  }
}

export async function getMobileMural() {
  const posts = await prisma.newsPost.findMany({
    where: { isPublished: true },
    orderBy: [{ priority: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
    include: { author: { select: { name: true } } },
  })

  return {
    posts: posts.map((post) => ({
      id: post.id,
      title: post.title,
      content: post.content,
      priority: post.priority,
      publishedAt: post.publishedAt?.toISOString() ?? null,
      createdAt: post.createdAt.toISOString(),
      authorName: post.author?.name ?? null,
    })),
  }
}

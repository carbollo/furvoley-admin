import { prisma } from '@/lib/prisma'
import { getSafeServerSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import CrmApp from '@/components/crm/CrmApp'
import { MemberShell } from '@/components/member/MemberShell'
import { MemberDashboard } from '@/components/member/MemberDashboard'
import { getClubBranding } from '@/lib/club-settings'
import { normalizeRole } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const session = await getSafeServerSession()

  if (!session) {
    redirect('/login')
  }

  const role = normalizeRole((session.user as { role?: string }).role)
  if (role === 'ADMIN' || role === 'COACH' || role === 'TREASURER') {
    return (
      <Suspense fallback={<div style={{ padding: 32, color: '#475569' }}>Cargando CRM…</div>}>
        <CrmApp />
      </Suspense>
    )
  }

  const sessionMemberId = (session.user as { memberId?: string | null })?.memberId || ''
  const clubBranding = await getClubBranding()

  const userMember = sessionMemberId
    ? await prisma.member.findUnique({
        where: { id: sessionMemberId },
    include: {
      teamRoles: {
            include: {
              team: {
                include: {
                  _count: { select: { members: true } },
                },
              },
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
        select: {
          id: true,
          dueDate: true,
          totalAmount: true,
          paidAmount: true,
          status: true,
        },
      })
    : []

  const debt = allOpenInvoices.reduce(
    (acc, i) => acc + (i.totalAmount - i.paidAmount),
    0,
  )
  const pendingInvoiceCount = allOpenInvoices.length
  const overdueCount = allOpenInvoices.filter((i) => i.status === 'OVERDUE').length

  const today = new Date()
  const nextDue = allOpenInvoices[0]?.dueDate
  let nextDueLabel: string | null = null
  if (nextDue) {
    const diffDays = Math.ceil(
      (new Date(nextDue).getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    )
    if (diffDays <= 0) {
      nextDueLabel = 'Vencida — paga ahora'
    } else if (diffDays === 1) {
      nextDueLabel = 'Vence mañana'
    } else if (diffDays <= 7) {
      nextDueLabel = `Vence en ${diffDays} días`
    } else {
      nextDueLabel = `${pendingInvoiceCount} factura(s) por pagar`
    }
  }

  const teamIds = userMember?.teamRoles.map((tr) => tr.teamId) ?? []
  const upcomingTeamEventsRaw = teamIds.length
    ? await prisma.event.findMany({
        where: {
          teamId: { in: teamIds },
          date: { gte: new Date() },
        },
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
  const dateStrPretty = dateStr.charAt(0).toUpperCase() + dateStr.slice(1)
  const userName = session.user?.name || 'Socio'
  const firstName = String(userName).trim().split(/\s+/)[0]

  const teams = (userMember?.teamRoles ?? []).map((tr) => ({
    id: tr.team.id,
    name: tr.team.name,
    role: tr.role,
    memberCount: tr.team._count.members,
    category: tr.team.category,
  }))

  const upcomingTeamEvents = upcomingTeamEventsRaw.map((e) => ({
    id: e.id,
    title: e.title,
    date: e.date,
    type: e.type,
    location: e.location,
    teamName: e.team?.name ?? null,
  }))

  const news = newsPostsRaw.map((post) => ({
    id: post.id,
    title: post.title,
    content: post.content,
    priority: post.priority,
    publishedAt: post.publishedAt,
    createdAt: post.createdAt,
  }))

  const publicEvents = publicEventsRaw.map((e) => ({
    id: e.id,
    title: e.title,
    date: e.date,
    type: e.type,
  }))

  const recentInvoices = memberInvoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    totalAmount: inv.totalAmount,
    paidAmount: inv.paidAmount,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    status: inv.status,
  }))

  return (
    <MemberShell
      branding={{
        name: clubBranding.name,
        logoUrl: clubBranding.logoUrl,
        primaryColor: clubBranding.primaryColor,
        subtitle: clubBranding.subtitle,
      }}
    >
      <MemberDashboard
        firstName={firstName}
        dateStrPretty={dateStrPretty}
        debt={debt}
        pendingInvoiceCount={pendingInvoiceCount}
        overdueCount={overdueCount}
        nextDueLabel={nextDueLabel}
        upcomingTeamEvents={upcomingTeamEvents}
        teams={teams}
        recentInvoices={recentInvoices}
        news={news}
        publicEvents={publicEvents}
        enrollmentPaymentPending={userMember?.status === 'PENDING_PAYMENT'}
      />
    </MemberShell>
  )
}

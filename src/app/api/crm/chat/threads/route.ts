import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'

export const dynamic = 'force-dynamic'

/**
 * Lista de conversaciones del Chat (roadmap · Módulo 3): hilos 1 a 1 y de
 * grupo con su último mensaje, ordenados por actividad reciente.
 */
export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  const recent = await prisma.chatMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 400,
    include: {
      member: { select: { id: true, name: true } },
      group: { select: { id: true, name: true } },
    },
  })

  type Thread = {
    kind: 'member' | 'group'
    id: string
    name: string
    lastMessage: string
    lastAt: string
    lastStatus: string
  }
  const threads = new Map<string, Thread>()
  for (const m of recent) {
    const kind = m.groupId ? 'group' : 'member'
    const id = m.groupId || m.memberId
    if (!id) continue
    const key = `${kind}:${id}`
    if (threads.has(key)) continue // recent está ordenado desc: el primero es el último mensaje
    threads.set(key, {
      kind,
      id,
      name: (kind === 'group' ? m.group?.name : m.member?.name) || '—',
      lastMessage: m.body.length > 80 ? `${m.body.slice(0, 80)}…` : m.body,
      lastAt: m.createdAt.toISOString(),
      lastStatus: m.status,
    })
  }

  return NextResponse.json({ threads: [...threads.values()] })
}

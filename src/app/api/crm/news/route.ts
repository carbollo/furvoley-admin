import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'

export async function GET() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const posts = await prisma.newsPost.findMany({
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    include: {
      author: {
        select: { id: true, name: true, email: true },
      },
    },
    take: 200,
  })

  return NextResponse.json({
    posts: posts.map((p) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      isPublished: p.isPublished,
      priority: p.priority,
      publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
      authorName: p.author?.name || p.author?.email || '',
    })),
  })
}

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  let body: { title?: string; content?: string; priority?: string; isPublished?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const title = String(body.title || '').trim()
  const content = String(body.content || '').trim()
  const priority = String(body.priority || 'NORMAL').toUpperCase() === 'HIGH' ? 'HIGH' : 'NORMAL'
  const isPublished = !!body.isPublished
  const authorId = (auth.session.user as { id?: string }).id

  if (!title || !content) {
    return NextResponse.json({ error: 'Título y contenido son obligatorios' }, { status: 400 })
  }

  const created = await prisma.newsPost.create({
    data: {
      title,
      content,
      priority,
      isPublished,
      publishedAt: isPublished ? new Date() : null,
      authorId,
    },
    select: { id: true },
  })

  return NextResponse.json({ ok: true, id: created.id })
}

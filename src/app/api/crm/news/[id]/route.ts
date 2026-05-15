import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const { id } = await context.params
  let body: { title?: string; content?: string; priority?: string; isPublished?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (typeof body.title === 'string') data.title = body.title.trim()
  if (typeof body.content === 'string') data.content = body.content.trim()
  if (typeof body.priority === 'string') {
    data.priority = body.priority.toUpperCase() === 'HIGH' ? 'HIGH' : 'NORMAL'
  }
  if (typeof body.isPublished === 'boolean') {
    data.isPublished = body.isPublished
    data.publishedAt = body.isPublished ? new Date() : null
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No hay cambios para guardar' }, { status: 400 })
  }

  try {
    await prisma.newsPost.update({
      where: { id },
      data,
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'No se pudo actualizar la noticia' }, { status: 400 })
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const { id } = await context.params
  try {
    await prisma.newsPost.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'No se pudo eliminar la noticia' }, { status: 400 })
  }
}

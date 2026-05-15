import { NextResponse } from 'next/server'
import { updateTeam } from '@/app/actions/teams'
import { requireRoles } from '@/lib/rbac-api'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['ADMIN', 'COACH'])
  if (!auth.ok) return auth.response

  const { id } = await context.params
  let body: { name?: string; category?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const name = body.name !== undefined ? String(body.name).trim() : undefined
  const category =
    body.category === null || body.category === ''
      ? null
      : body.category !== undefined
        ? String(body.category).trim() || null
        : undefined

  if (name !== undefined && name === '') {
    return NextResponse.json({ error: 'El nombre no puede quedar vacío' }, { status: 400 })
  }

  const payload: { name?: string; category?: string | null } = {}
  if (name !== undefined) payload.name = name
  if (category !== undefined) payload.category = category

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: 'Sin datos para actualizar' }, { status: 400 })
  }

  await updateTeam(id, payload)

  return NextResponse.json({ ok: true })
}

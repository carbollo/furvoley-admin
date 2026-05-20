import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { deleteMembershipPlan } from '@/app/actions/billing'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'])
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  try {
    await deleteMembershipPlan(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'No se pudo eliminar el plan'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

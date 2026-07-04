import { NextResponse } from 'next/server'
import { parseCuid } from '@/lib/db-input-validation'
import { requireRoles } from '@/lib/rbac-api'
import { deleteMembershipPlan } from '@/app/actions/billing'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], _request)
  if (!auth.ok) return auth.response

  const { id } = await params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId

  try {
    await deleteMembershipPlan(parsedId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'No se pudo eliminar el plan'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

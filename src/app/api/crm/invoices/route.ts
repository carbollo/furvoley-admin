import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { parseCuid } from '@/lib/db-input-validation'
import { createMemberInvoice, createTeamInvoices } from '@/lib/crm-invoice-create'

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const memberIdRaw = String(body.memberId || '').trim()
  const teamIdRaw = String(body.teamId || '').trim()
  const hasMember = Boolean(memberIdRaw)
  const hasTeam = Boolean(teamIdRaw)

  if (hasMember === hasTeam) {
    return NextResponse.json(
      { error: 'Indica memberId o teamId, pero no ambos.' },
      { status: 400 },
    )
  }

  const input = {
    concepto: String(body.concepto || ''),
    amount: Number(body.amount),
    dueDate: String(body.dueDate || ''),
    applyTax: typeof body.applyTax === 'boolean' ? body.applyTax : undefined,
    taxRate: Number(body.taxRate),
    applyWithholding:
      typeof body.applyWithholding === 'boolean' ? body.applyWithholding : undefined,
    withholdingRate: Number(body.withholdingRate),
  }

  try {
    if (hasTeam) {
      const parsedTeamId = parseCuid(teamIdRaw, 'teamId')
      if (parsedTeamId instanceof NextResponse) return parsedTeamId
      const result = await createTeamInvoices(parsedTeamId, input)
      return NextResponse.json({ ok: true, count: result.count, ids: result.ids })
    }

    const parsedMemberId = parseCuid(memberIdRaw, 'memberId')
    if (parsedMemberId instanceof NextResponse) return parsedMemberId
    const invoice = await createMemberInvoice(parsedMemberId, input)
    return NextResponse.json({ ok: true, id: invoice.id })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'No se pudo crear el cobro'
    const status = msg.includes('no encontrado') ? 404 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
